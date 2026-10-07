"use server";

import { unlink } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { QuestionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/rbac";
import { recalculateCourseProgress } from "@/server/services/progress-service";
import { slugify } from "@/lib/utils";
import {
  categorySchema,
  createCourseSchema,
  publishCourseSchema,
  updateCourseFullSchema,
  updateCourseSchema,
} from "@/lib/validations/course";
import {
  evaluationSchema,
  type QuestionInput,
} from "@/lib/validations/evaluation";
import {
  failure,
  fromZodError,
  success,
  type ActionResult,
} from "@/lib/validations/common";

/** Sesión con rol administrativo, o null. */
async function getAdminSession() {
  const session = await getSession();
  if (!session || !isAdminRole(session.role)) return null;
  return session;
}

const NO_ACCESS = "No tienes permisos de administración o tu sesión expiró.";

/** Crea una inducción/capacitación con sus videos (1 largo o N cápsulas). */
export async function createCourseAction(
  input: unknown,
): Promise<ActionResult<{ courseId: string }>> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const parsed = createCourseSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  // Multi-tenant: sólo se crea dentro de un colegio al que se tiene acceso.
  if (!session.institutionIds.includes(parsed.data.institutionId))
    return failure("No tienes acceso a ese colegio.");

  const institutionId = parsed.data.institutionId;

  const catalogError = await verifyCatalogOwnership(institutionId, {
    categoryId: parsed.data.categoryId,
    typeId: parsed.data.typeId,
    targetPositionIds: parsed.data.targetPositionIds,
  });
  if (catalogError) return failure(catalogError);

  const tagConnections = await resolveTags(institutionId, parsed.data.tags);

  // Manejo de módulos y lecciones
  const modulesData = parsed.data.modules || [];
  
  const course = await prisma.$transaction(async (tx) => {
    const createdCourse = await tx.course.create({
      data: {
        institutionId,
        categoryId: parsed.data.categoryId || null,
        typeId: parsed.data.typeId || null,
        title: parsed.data.title,
        description: parsed.data.description || null,
        videoFormat: parsed.data.videoFormat,
        isSequential: parsed.data.isSequential,
        isPublished: parsed.data.isPublished,
        // El curso nace vigente para el año en curso (se reutiliza con "Iniciar nuevo período").
        currentPeriod: new Date().getFullYear(),
        targetPositions: {
          connect: parsed.data.targetPositionIds.map((id) => ({ id })),
        },
        tags: { connect: tagConnections },
      },
      select: { id: true },
    });

    // Crear módulos si vienen definidos
    const moduleMap = new Map<string, string>(); // index o temp id -> db id
    let mIdx = 0;
    for (const mod of modulesData) {
      const createdMod = await tx.courseModule.create({
        data: {
          courseId: createdCourse.id,
          title: mod.title,
          description: mod.description || null,
          orderIndex: mod.orderIndex ?? mIdx,
        },
      });
      if (mod.id) moduleMap.set(mod.id, createdMod.id);
      moduleMap.set(String(mIdx), createdMod.id);
      moduleMap.set(mod.title, createdMod.id);
      mIdx++;
    }

    // Crear lecciones con su respectivo moduleId si aplica
    let lIdx = 0;
    for (const lesson of parsed.data.lessons) {
      const assignedModuleId =
        (lesson.moduleId && moduleMap.get(lesson.moduleId)) ||
        (lesson.moduleTitle && moduleMap.get(lesson.moduleTitle)) ||
        (lesson.moduleId && lesson.moduleId.length > 10 ? lesson.moduleId : null);

      await tx.lesson.create({
        data: {
          courseId: createdCourse.id,
          ...(assignedModuleId ? { moduleId: assignedModuleId } : {}),
          title: lesson.title,
          description: lesson.description || null,
          videoUrl: lesson.videoUrl,
          durationSeconds: lesson.durationSeconds,
          orderIndex: lesson.orderIndex ?? lIdx,
          isActive: lesson.isActive ?? true,
        },
      });
      lIdx++;
    }

    return createdCourse;
  });

  revalidatePath("/admin/cursos");
  return success({ courseId: course.id }, "Curso creado correctamente.");
}

export async function updateCourseAction(
  input: unknown,
): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const parsed = updateCourseSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  // `tags` es una relación y no puede ir en un updateMany: se resuelve aparte.
  const { id, tags, categoryId, ...data } = parsed.data;

  const owned = await prisma.course.findFirst({
    where: { id, institutionId: session.institutionId },
    select: { id: true },
  });
  if (!owned) return failure("Curso no encontrado.");

  if (categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, institutionId: session.institutionId },
      select: { id: true },
    });
    if (!category) return failure("La categoría no existe en este colegio.");
  }

  await prisma.course.update({
    where: { id },
    data: {
      ...data,
      // Sólo se toca la descripción si vino en el payload parcial.
      ...(data.description !== undefined
        ? { description: data.description || null }
        : {}),
      ...(categoryId !== undefined ? { categoryId: categoryId || null } : {}),
      ...(tags !== undefined
        ? {
            tags: {
              set: await resolveTags(session.institutionId, tags),
            },
          }
        : {}),
    },
  });

  revalidatePath("/admin/cursos");
  revalidatePath(`/admin/cursos/${id}`);
  return success(undefined, "Curso actualizado.");
}

/**
 * Edición completa: metadatos + sincronización de videos.
 * Los videos que desaparecen del formulario se eliminan, salvo que algún
 * funcionario ya los haya visto (eso destruiría evidencia de avance).
 */
export async function updateCourseFullAction(
  input: unknown,
): Promise<ActionResult<{ courseId: string }>> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const parsed = updateCourseFullSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const {
    id,
    institutionId,
    modules,
    lessons,
    tags,
    categoryId,
    typeId,
    targetPositionIds,
    ...data
  } = parsed.data;

  const course = await prisma.course.findFirst({
    where: { id, institutionId: session.institutionId },
    include: { lessons: { select: { id: true } } },
  });
  if (!course) return failure("Curso no encontrado.");

  const catalogError = await verifyCatalogOwnership(session.institutionId, {
    categoryId,
    typeId,
    targetPositionIds,
  });
  if (catalogError) return failure(catalogError);

  const existingIds = new Set(course.lessons.map((lesson) => lesson.id));
  const keptIds = new Set(
    lessons.flatMap((lesson) => (lesson.id && existingIds.has(lesson.id) ? [lesson.id] : [])),
  );
  const removedIds = [...existingIds].filter((lessonId) => !keptIds.has(lessonId));

  if (removedIds.length > 0) {
    // Borrar una lección arrastra en cascada su evaluación y las entregas.
    // Se bloquea ante cualquier rastro de uso, no solo de visualización.
    const [watched, submitted] = await Promise.all([
      prisma.lessonProgress.findFirst({
        where: { lessonId: { in: removedIds } },
        select: { id: true },
      }),
      prisma.evaluationSubmission.findFirst({
        where: { evaluation: { lessonId: { in: removedIds } } },
        select: { id: true },
      }),
    ]);

    if (watched)
      return failure(
        "No puedes eliminar un video que algún funcionario ya comenzó a ver.",
      );
    if (submitted)
      return failure(
        "No puedes eliminar un video cuya evaluación ya tiene entregas registradas.",
      );
  }

  const tagConnections = await resolveTags(session.institutionId, tags);

  await prisma.$transaction(async (tx) => {
    await tx.course.update({
      where: { id },
      data: {
        ...data,
        description: data.description || null,
        categoryId: categoryId || null,
        typeId: typeId || null,
        tags: { set: tagConnections },
        targetPositions: {
          set: targetPositionIds.map((positionId) => ({ id: positionId })),
        },
      },
    });

    // Manejo de módulos (CourseModule)
    const modulesData = modules || [];
    const moduleMap = new Map<string, string>();

    // 1. Obtener módulos existentes
    const existingModules = await tx.courseModule.findMany({
      where: { courseId: id },
      select: { id: true },
    });
    const keptModuleIds = new Set(
      modulesData.flatMap((m) => (m.id ? [m.id] : [])),
    );
    const removedModuleIds = existingModules
      .map((m) => m.id)
      .filter((mId) => !keptModuleIds.has(mId));

    if (removedModuleIds.length > 0) {
      await tx.courseModule.deleteMany({
        where: { id: { in: removedModuleIds } },
      });
    }

    let mIdx = 0;
    for (const mod of modulesData) {
      const mPayload = {
        title: mod.title,
        description: mod.description || null,
        orderIndex: mod.orderIndex ?? mIdx,
      };

      if (mod.id && keptModuleIds.has(mod.id)) {
        const updated = await tx.courseModule.update({
          where: { id: mod.id },
          data: mPayload,
        });
        moduleMap.set(mod.id, updated.id);
        moduleMap.set(mod.title, updated.id);
        moduleMap.set(String(mIdx), updated.id);
      } else {
        const created = await tx.courseModule.create({
          data: { ...mPayload, courseId: id },
        });
        if (mod.id) moduleMap.set(mod.id, created.id);
        moduleMap.set(mod.title, created.id);
        moduleMap.set(String(mIdx), created.id);
      }
      mIdx++;
    }

    if (removedIds.length > 0) {
      await tx.lesson.deleteMany({ where: { id: { in: removedIds } } });
    }

    // El índice de orden es único por curso: se liberan primero con valores
    // negativos temporales para que un reordenamiento no choque consigo mismo.
    for (const [index, lessonId] of [...keptIds].entries()) {
      await tx.lesson.update({
        where: { id: lessonId },
        data: { orderIndex: -(index + 1) },
      });
    }

    for (const [index, lesson] of lessons.entries()) {
      const assignedModuleId =
        (lesson.moduleId && moduleMap.get(lesson.moduleId)) ||
        (lesson.moduleTitle && moduleMap.get(lesson.moduleTitle)) ||
        (lesson.moduleId && lesson.moduleId.length > 10 ? lesson.moduleId : null);

      const payload = {
        title: lesson.title,
        description: lesson.description || null,
        videoUrl: lesson.videoUrl,
        durationSeconds: lesson.durationSeconds,
        ...(assignedModuleId ? { moduleId: assignedModuleId } : {}),
        orderIndex: index,
        isActive: lesson.isActive ?? true,
      };

      if (lesson.id && keptIds.has(lesson.id)) {
        await tx.lesson.update({ where: { id: lesson.id }, data: payload });
      } else {
        await tx.lesson.create({ data: { ...payload, courseId: id } });
      }
    }
  });

  revalidatePath("/admin/cursos");
  revalidatePath(`/admin/cursos/${id}`);
  return success({ courseId: id }, "Curso actualizado.");
}

/** Activa o desactiva una cápsula/lección individualmente. */
export async function toggleLessonActiveAction(
  lessonId: string,
  isActive: boolean,
): Promise<ActionResult<{ id: string; isActive: boolean }>> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { course: { select: { id: true, institutionId: true } } },
  });

  if (!lesson) return failure("Cápsula no encontrada.");
  if (!session.institutionIds.includes(lesson.course.institutionId))
    return failure("No tienes acceso al colegio de este curso.");

  try {
    await prisma.lesson.update({
      where: { id: lessonId },
      data: { isActive },
      select: { id: true, isActive: true },
    });
  } catch {
    // Si la instancia en caliente del dev server aún no refrescó los metadatos de Prisma:
    await prisma.$executeRawUnsafe(
      "UPDATE `lessons` SET `isActive` = ?, `updatedAt` = NOW() WHERE `id` = ?",
      isActive ? 1 : 0,
      lessonId,
    );
    // Intentar invalidar el singleton en globalThis para que el próximo uso cree un PrismaClient nuevo con el schema actualizado
    const globalObj = globalThis as unknown as { prisma?: unknown };
    if (globalObj.prisma) {
      delete globalObj.prisma;
    }
  }

  // Recalcular el estado de progreso para todos los funcionarios inscritos en este curso
  try {
    const enrolledUsers = await prisma.courseProgress.findMany({
      where: { courseId: lesson.course.id },
      select: { userId: true },
    });
    for (const eu of enrolledUsers) {
      await recalculateCourseProgress(eu.userId, lesson.course.id).catch(() => {});
    }
  } catch (_e) {
    // Non-blocking
  }

  revalidatePath(`/admin/cursos/${lesson.course.id}`);
  revalidatePath(`/admin/cursos/${lesson.course.id}/preview`);
  revalidatePath(`/mis-inducciones/${lesson.course.id}`);
  revalidatePath("/admin/cursos");
  revalidatePath("/admin/funcionarios");
  revalidatePath("/mis-inducciones");

  return success(
    { id: lessonId, isActive },
    isActive ? "Cápsula activada correctamente." : "Cápsula desactivada correctamente.",
  );
}

export async function publishCourseAction(
  id: string,
  isPublished: boolean,
): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const parsed = publishCourseSchema.safeParse({ id, isPublished });
  if (!parsed.success) return fromZodError(parsed.error);

  if (parsed.data.isPublished) {
    const lessons = await prisma.lesson.count({
      where: { courseId: parsed.data.id },
    });
    if (lessons === 0)
      return failure("No puedes publicar un curso sin videos.");
  }

  const result = await prisma.course.updateMany({
    where: { id: parsed.data.id, institutionId: session.institutionId },
    data: { isPublished: parsed.data.isPublished },
  });
  if (result.count === 0) return failure("Curso no encontrado.");

  revalidatePath("/admin/cursos");
  return success(
    undefined,
    parsed.data.isPublished ? "Curso publicado." : "Curso despublicado.",
  );
}

export async function deleteCourseAction(id: string): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  // 1. Obtener el curso con sus lecciones para identificar archivos de video locales
  const course = await prisma.course.findFirst({
    where: { id, institutionId: session.institutionId },
    include: {
      lessons: {
        select: { videoUrl: true },
      },
    },
  });

  if (!course) return failure("Inducción no encontrada o no pertenece a este colegio.");

  // 2. Eliminar de la base de datos (por cascada de Prisma elimina lecciones, invitaciones, evaluaciones y progreso)
  await prisma.course.delete({
    where: { id: course.id },
  });

  // 3. Eliminar archivos de video físicos locales almacenados en /uploads/videos/
  for (const lesson of course.lessons) {
    if (lesson.videoUrl && lesson.videoUrl.startsWith("/uploads/videos/")) {
      try {
        const filename = lesson.videoUrl.replace("/uploads/videos/", "");
        const filePath = path.join(process.cwd(), "public", "uploads", "videos", filename);
        await unlink(filePath).catch(() => {});
      } catch {
        // Continuar si el archivo no existe
      }
    }
  }

  revalidatePath("/admin/cursos");
  revalidatePath("/admin/invitaciones");
  revalidatePath("/dashboard");
  return success(undefined, "Inducción y todos sus recursos eliminados correctamente.");
}

/**
 * Crea o reemplaza la evaluación de un curso o de una lección, junto con
 * sus preguntas (alternativas y/o abiertas).
 */
export async function upsertEvaluationAction(
  input: unknown,
): Promise<ActionResult<{ evaluationId: string }>> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const parsed = evaluationSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const { courseId, lessonId, questions, ...rest } = parsed.data;

  // Verificación de tenant sobre el curso dueño de la evaluación.
  const owner = courseId
    ? await prisma.course.findFirst({
        where: { id: courseId, institutionId: session.institutionId },
        select: { id: true },
      })
    : await prisma.lesson.findFirst({
        where: {
          id: lessonId,
          course: { institutionId: session.institutionId },
        },
        select: { id: true },
      });

  if (!owner) return failure("El curso o la lección no existe en este colegio.");

  const evaluation = await prisma.$transaction(async (tx) => {
    const existing = lessonId
      ? await tx.evaluation.findUnique({ where: { lessonId } })
      : await tx.evaluation.findFirst({ where: { courseId, lessonId: null } });

    if (existing) {
      await tx.question.deleteMany({ where: { evaluationId: existing.id } });
      return tx.evaluation.update({
        where: { id: existing.id },
        data: {
          ...rest,
          questions: { create: mapQuestions(questions) },
        },
        select: { id: true },
      });
    }

    return tx.evaluation.create({
      data: {
        ...rest,
        courseId: courseId ?? null,
        lessonId: lessonId ?? null,
        questions: { create: mapQuestions(questions) },
      },
      select: { id: true },
    });
  });

  revalidatePath("/admin/cursos");
  return success({ evaluationId: evaluation.id }, "Evaluación guardada.");
}

/**
 * Comprueba que categoría, tipo y cargos pertenezcan al colegio del curso.
 * Sin esto, un administrador con acceso a dos colegios podría mezclarlos.
 */
async function verifyCatalogOwnership(
  institutionId: string,
  refs: {
    categoryId?: string;
    typeId?: string;
    targetPositionIds?: string[];
  },
): Promise<string | null> {
  if (refs.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: refs.categoryId, institutionId },
      select: { id: true },
    });
    if (!category) return "La categoría no existe en el colegio seleccionado.";
  }

  if (refs.typeId) {
    const type = await prisma.courseType.findFirst({
      where: { id: refs.typeId, institutionId },
      select: { id: true },
    });
    if (!type) return "El tipo no existe en el colegio seleccionado.";
  }

  if (refs.targetPositionIds && refs.targetPositionIds.length > 0) {
    const count = await prisma.position.count({
      where: { id: { in: refs.targetPositionIds }, institutionId },
    });
    if (count !== refs.targetPositionIds.length)
      return "Alguno de los cargos no existe en el colegio seleccionado.";
  }

  return null;
}

/**
 * Elimina una evaluación y sus preguntas. Se bloquea si ya tiene entregas,
 * porque borrarla destruiría evidencia de cumplimiento.
 */
export async function deleteEvaluationAction(
  evaluationId: string,
): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const evaluation = await prisma.evaluation.findFirst({
    where: {
      id: evaluationId,
      OR: [
        { course: { institutionId: session.institutionId } },
        { lesson: { course: { institutionId: session.institutionId } } },
      ],
    },
    select: { id: true, _count: { select: { submissions: true } } },
  });

  if (!evaluation) return failure("Evaluación no encontrada.");
  if (evaluation._count.submissions > 0)
    return failure(
      "La evaluación ya tiene entregas registradas: edítala en vez de eliminarla.",
    );

  await prisma.evaluation.delete({ where: { id: evaluation.id } });

  revalidatePath("/admin/cursos");
  return success(undefined, "Evaluación eliminada.");
}

/**
 * Crea las etiquetas que aún no existan en el colegio y devuelve los ids para
 * conectar. Las etiquetas son libres, pero se deduplican por slug para que
 * "Convivencia" y "convivencia " no generen dos registros distintos.
 */
async function resolveTags(institutionId: string, tags: string[]) {
  if (tags.length === 0) return [];

  const normalized = tags
    .map((name) => ({ name: name.trim(), slug: slugify(name) }))
    .filter((tag) => tag.slug.length > 0);

  const unique = new Map(normalized.map((tag) => [tag.slug, tag]));

  await prisma.tag.createMany({
    data: Array.from(unique.values()).map((tag) => ({
      institutionId,
      name: tag.name,
      slug: tag.slug,
    })),
    skipDuplicates: true,
  });

  const rows = await prisma.tag.findMany({
    where: { institutionId, slug: { in: Array.from(unique.keys()) } },
    select: { id: true },
  });

  return rows.map((row) => ({ id: row.id }));
}

/** Crea una categoría dentro del colegio activo. */
export async function createCategoryAction(
  input: unknown,
): Promise<ActionResult<{ id: string; name: string }>> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  if (!session.institutionIds.includes(parsed.data.institutionId))
    return failure("No tienes acceso a ese colegio.");

  const slug = slugify(parsed.data.name);
  if (!slug) return failure("El nombre de la categoría no es válido.");

  const existing = await prisma.category.findUnique({
    where: {
      institutionId_slug: { institutionId: parsed.data.institutionId, slug },
    },
    select: { id: true, name: true },
  });
  if (existing) return failure("Ya existe una categoría con ese nombre.");

  const category = await prisma.category.create({
    data: {
      institutionId: parsed.data.institutionId,
      name: parsed.data.name,
      slug,
      color: parsed.data.color || null,
      description: parsed.data.description || null,
    },
    select: { id: true, name: true },
  });

  revalidatePath("/admin/cursos");
  return success(category, "Categoría creada.");
}

function mapQuestions(questions: QuestionInput[]) {
  return questions.map((question, index) => ({
    type: question.type,
    prompt: question.prompt,
    imageUrl: question.imageUrl || null,
    options:
      question.type === QuestionType.MULTIPLE_CHOICE
        ? question.options
        : undefined,
    correctAnswer:
      question.type === QuestionType.MULTIPLE_CHOICE
        ? question.correctAnswer || null
        : null,
    points: question.points,
    orderIndex: question.orderIndex ?? index,
  }));
}
