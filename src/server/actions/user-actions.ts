"use server";

import { revalidatePath } from "next/cache";
import { Role, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/rbac";
import { hashSecret } from "@/lib/auth/password";
import {
  bulkCreateUsersSchema,
  createUserSchema,
  resetPasswordSchema,
  toggleUserSchema,
  updateUserSchema,
} from "@/lib/validations/user";
import {
  failure,
  fromZodError,
  success,
  type ActionResult,
} from "@/lib/validations/common";

const NO_ACCESS = "No tienes permisos de administración o tu sesión expiró.";

async function getAdminSession() {
  const session = await getSession();
  if (!session || !isAdminRole(session.role)) return null;
  return session;
}

function revalidateUsers() {
  revalidatePath("/admin/funcionarios");
  revalidatePath("/admin");
}

/** Comprueba que cargo y área pertenezcan al colegio indicado. */
async function verifyCatalogs(
  institutionId: string,
  positionId?: string,
  areaId?: string,
): Promise<string | null> {
  if (positionId) {
    const position = await prisma.position.findFirst({
      where: { id: positionId, institutionId },
      select: { id: true },
    });
    if (!position) return "El cargo no existe en ese colegio.";
  }
  if (areaId) {
    const area = await prisma.area.findFirst({
      where: { id: areaId, institutionId },
      select: { id: true },
    });
    if (!area) return "El área no existe en ese colegio.";
  }
  return null;
}

/**
 * Sólo un SUPER_ADMIN puede crear o ascender a roles administrativos.
 * Un ADMIN_RRHH sólo administra funcionarios de su propio colegio.
 */
function canAssignRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === Role.SUPER_ADMIN) return true;
  return targetRole === Role.FUNCIONARIO;
}

export async function createUserAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const {
    institutionId,
    extraInstitutionIds,
    password,
    positionId,
    areaId,
    corporateEmail,
    username,
    phone,
    ...data
  } = parsed.data;

  if (!session.institutionIds.includes(institutionId))
    return failure("No tienes acceso a ese colegio.");
  if (session.role !== Role.SUPER_ADMIN && institutionId !== session.institutionId)
    return failure("Sólo puedes crear usuarios en el colegio que tienes activo.");
  if (!canAssignRole(session.role, data.role))
    return failure("Sólo un Super Administrador puede crear roles administrativos.");

  const invalidExtra = extraInstitutionIds.filter(
    (id) => !session.institutionIds.includes(id),
  );
  if (invalidExtra.length > 0)
    return failure("No tienes acceso a alguno de los colegios adicionales.");

  const catalogError = await verifyCatalogs(institutionId, positionId, areaId);
  if (catalogError) return failure(catalogError);

  const duplicate = await findDuplicate({
    institutionId,
    rut: data.rut,
    email: data.email,
    corporateEmail,
    username,
  });
  if (duplicate) return failure(duplicate);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          ...data,
          institutionId,
          corporateEmail: corporateEmail || null,
          username: username || null,
          phone: phone || null,
          positionId: positionId || null,
          areaId: areaId || null,
          passwordHash: password ? await hashSecret(password) : null,
        },
        select: { id: true },
      });

      if (extraInstitutionIds.length > 0) {
        await tx.institutionMembership.createMany({
          data: extraInstitutionIds.map((id) => ({
            userId: created.id,
            institutionId: id,
            role: data.role,
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    revalidateUsers();
    return success({ id: user.id }, "Usuario creado.");
  } catch (error) {
    console.error("[createUserAction]", error);
    return failure("No se pudo crear el usuario. Revisa los datos.");
  }
}

/** Devuelve el mensaje del conflicto, o null si no hay duplicados. */
async function findDuplicate(params: {
  institutionId: string;
  rut: string;
  email: string;
  corporateEmail?: string;
  username?: string;
  excludeUserId?: string;
}): Promise<string | null> {
  const notSelf: Prisma.UserWhereInput = params.excludeUserId
    ? { id: { not: params.excludeUserId } }
    : {};

  const sameInstitution = await prisma.user.findFirst({
    where: {
      ...notSelf,
      institutionId: params.institutionId,
      OR: [
        { rut: params.rut },
        { email: params.email },
        ...(params.corporateEmail
          ? [{ corporateEmail: params.corporateEmail }]
          : []),
      ],
    },
    select: { rut: true, email: true, corporateEmail: true },
  });

  if (sameInstitution) {
    if (sameInstitution.rut === params.rut)
      return "Ya existe un usuario con ese RUT en el colegio.";
    if (sameInstitution.email === params.email)
      return "Ya existe un usuario con ese correo en el colegio.";
    return "Ya existe un usuario con ese correo institucional en el colegio.";
  }

  // El username es único en toda la plataforma, no sólo por colegio.
  if (params.username) {
    const taken = await prisma.user.findFirst({
      where: { ...notSelf, username: params.username },
      select: { id: true },
    });
    if (taken) return "Ese nombre de usuario ya está en uso.";
  }

  return null;
}

export async function updateUserAction(input: unknown): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const { id, extraInstitutionIds, password, ...data } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { id, institutionId: session.institutionId },
    select: { id: true, institutionId: true, role: true, passwordHash: true },
  });
  if (!user) return failure("Usuario no encontrado en este colegio.");

  if (id === session.sub && data.role && data.role !== user.role)
    return failure("No puedes cambiar tu propio rol.");
  // Los roles que entran por /login necesitan contraseña.
  if (data.role && data.role !== Role.FUNCIONARIO && !user.passwordHash && !password)
    return failure("Para dar un rol con acceso a la plataforma debes definir una contraseña.");

  if (data.role && !canAssignRole(session.role, data.role))
    return failure("Sólo un Super Administrador puede asignar roles administrativos.");
  if (!canAssignRole(session.role, user.role))
    return failure("No tienes permisos para editar a este usuario.");

  const catalogError = await verifyCatalogs(
    user.institutionId,
    data.positionId,
    data.areaId,
  );
  if (catalogError) return failure(catalogError);

  if (data.rut || data.email || data.corporateEmail || data.username) {
    const duplicate = await findDuplicate({
      institutionId: user.institutionId,
      rut: data.rut ?? "",
      email: data.email ?? "",
      corporateEmail: data.corporateEmail,
      username: data.username,
      excludeUserId: id,
    });
    if (duplicate) return failure(duplicate);
  }

  await prisma.user.update({
    where: { id },
    data: {
      ...data,
      ...(data.corporateEmail !== undefined
        ? { corporateEmail: data.corporateEmail || null }
        : {}),
      ...(data.username !== undefined
        ? { username: data.username || null }
        : {}),
      ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
      ...(data.positionId !== undefined
        ? { positionId: data.positionId || null }
        : {}),
      ...(data.areaId !== undefined ? { areaId: data.areaId || null } : {}),
      ...(password ? { passwordHash: await hashSecret(password) } : {}),
    },
  });

  if (extraInstitutionIds) {
    const allowed = extraInstitutionIds.filter((institutionId) =>
      session.institutionIds.includes(institutionId),
    );
    await prisma.institutionMembership.deleteMany({ where: { userId: id } });
    if (allowed.length > 0) {
      await prisma.institutionMembership.createMany({
        data: allowed.map((institutionId) => ({
          userId: id,
          institutionId,
          role: data.role ?? user.role,
        })),
        skipDuplicates: true,
      });
    }
  }

  revalidateUsers();
  return success(undefined, "Usuario actualizado.");
}

export async function deleteUserAction(id: string): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  if (id === session.sub) {
    return failure("No puedes eliminar tu propia cuenta.");
  }

  const user = await prisma.user.findFirst({
    where: { id, institutionId: session.institutionId },
    select: { id: true, name: true },
  });
  if (!user) return failure("Usuario no encontrado en este colegio.");

  await prisma.user.delete({
    where: { id },
  });

  revalidateUsers();
  return success(undefined, `Funcionario ${user.name} eliminado.`);
}

export async function bulkDeleteUsersAction(ids: string[]): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const filteredIds = ids.filter((id) => id !== session.sub);
  if (filteredIds.length === 0) {
    return failure("No hay funcionarios válidos seleccionados para eliminar.");
  }

  const deleted = await prisma.user.deleteMany({
    where: {
      id: { in: filteredIds },
      institutionId: session.institutionId,
    },
  });

  revalidateUsers();
  return success(
    undefined,
    `Se eliminaron ${deleted.count} funcionario(s) exitosamente.`,
  );
}

export async function assignCoursesToUsersAction({
  userIds,
  courseIds,
}: {
  userIds: string[];
  courseIds: string[];
}): Promise<ActionResult<{ assignedCount: number }>> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  if (userIds.length === 0 || courseIds.length === 0) {
    return failure("Debes seleccionar al menos un funcionario y una inducción/curso.");
  }

  // Obtener cursos con sus lecciones y duraciones
  const courses = await prisma.course.findMany({
    where: {
      id: { in: courseIds },
      institutionId: session.institutionId,
    },
    include: {
      lessons: {
        select: { id: true, durationSeconds: true },
      },
    },
  });

  if (courses.length === 0) {
    return failure("No se encontraron cursos válidos.");
  }

  const now = new Date();
  let assignedCount = 0;

  for (const userId of userIds) {
    for (const course of courses) {
      // 1. Marcar todas las lecciones del curso como vistas por el funcionario
      if (course.lessons.length > 0) {
        for (const lesson of course.lessons) {
          await prisma.lessonProgress.upsert({
            where: {
              userId_lessonId: { userId, lessonId: lesson.id },
            },
            create: {
              userId,
              lessonId: lesson.id,
              isWatched: true,
              watchedSeconds: lesson.durationSeconds || 60,
              completedAt: now,
            },
            update: {
              isWatched: true,
              watchedSeconds: lesson.durationSeconds || 60,
              completedAt: now,
            },
          });
        }
      }

      // 2. Marcar el progreso del curso como COMPLETED (100% aprobado)
      await prisma.courseProgress.upsert({
        where: {
          userId_courseId: { userId, courseId: course.id },
        },
        create: {
          userId,
          courseId: course.id,
          status: "COMPLETED",
          finalScore: 100,
          startedAt: now,
          completedAt: now,
        },
        update: {
          status: "COMPLETED",
          finalScore: 100,
          completedAt: now,
        },
      });
      assignedCount++;
    }
  }

  revalidateUsers();
  return success(
    { assignedCount },
    `Se asignaron los cursos marcándolos como completados (100%) exitosamente.`,
  );
}

/**
 * Quita la asignación de un curso a uno o varios funcionarios y reinicia su progreso
 * para que puedan realizarlo nuevamente desde cero.
 */
export async function removeCourseFromUsersAction({
  userIds,
  courseId,
}: {
  userIds: string[];
  courseId: string;
}): Promise<ActionResult<{ removedCount: number }>> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  if (userIds.length === 0 || !courseId) {
    return failure("Faltan parámetros para quitar la asignación.");
  }

  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      institutionId: session.institutionId,
    },
    select: { id: true, lessons: { select: { id: true } } },
  });

  if (!course) return failure("Curso no encontrado.");

  const lessonIds = course.lessons.map((l) => l.id);
  // Evaluaciones del curso: la final (courseId) y las de cada lección.
  const evaluations = await prisma.evaluation.findMany({
    where: { OR: [{ courseId }, { lesson: { courseId } }] },
    select: { id: true },
  });
  const evaluationIds = evaluations.map((e) => e.id);

  await prisma.$transaction([
    // Eliminar respuestas de evaluaciones: sin esto, al reasignar el curso el
    // funcionario vería "Ya aprobaste" o "Agotaste los intentos".
    ...(evaluationIds.length > 0
      ? [
          prisma.evaluationSubmission.deleteMany({
            where: {
              userId: { in: userIds },
              evaluationId: { in: evaluationIds },
              archivedPeriod: 0, // sólo el período vigente
            },
          }),
        ]
      : []),
    // Eliminar progreso de lecciones asociadas
    ...(lessonIds.length > 0
      ? [
          prisma.lessonProgress.deleteMany({
            where: {
              userId: { in: userIds },
              lessonId: { in: lessonIds },
            },
          }),
        ]
      : []),
    // Eliminar invitaciones activas de este curso para estos usuarios
    prisma.invitation.deleteMany({
      where: {
        userId: { in: userIds },
        courseId,
      },
    }),
    // Eliminar el progreso general del curso
    prisma.courseProgress.deleteMany({
      where: {
        userId: { in: userIds },
        courseId,
      },
    }),
  ]);

  revalidateUsers();
  return success(
    { removedCount: userIds.length },
    "Asignación quitada: se eliminaron su avance y sus respuestas. Puede realizar el curso de nuevo.",
  );
}

export async function toggleUserActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const parsed = toggleUserSchema.safeParse({ id, isActive });
  if (!parsed.success) return fromZodError(parsed.error);

  if (parsed.data.id === session.sub)
    return failure("No puedes desactivar tu propia cuenta.");

  const result = await prisma.user.updateMany({
    where: { id: parsed.data.id, institutionId: session.institutionId },
    data: { isActive: parsed.data.isActive },
  });
  if (result.count === 0) return failure("Usuario no encontrado.");

  revalidateUsers();
  return success(
    undefined,
    parsed.data.isActive ? "Usuario activado." : "Usuario desactivado.",
  );
}

export async function resetUserPasswordAction(
  input: unknown,
): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await prisma.user.findFirst({
    where: { id: parsed.data.id, institutionId: session.institutionId },
    select: { id: true, role: true, username: true },
  });
  if (!user) return failure("Usuario no encontrado.");
  if (!canAssignRole(session.role, user.role))
    return failure("No tienes permisos sobre este usuario.");
  if (!user.username)
    return failure("El usuario no tiene nombre de usuario para iniciar sesión.");

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashSecret(parsed.data.password) },
  });

  revalidateUsers();
  return success(undefined, "Contraseña restablecida.");
}

export interface BulkUserSummary {
  created: number;
  failed: number;
  errors: Array<{ email: string; reason: string }>;
}

/** Alta masiva. Cada usuario se crea aparte para que un error no anule el lote. */
export async function bulkCreateUsersAction(
  input: unknown,
): Promise<ActionResult<BulkUserSummary>> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const parsed = bulkCreateUsersSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const { institutionId, users } = parsed.data;

  if (!session.institutionIds.includes(institutionId))
    return failure("No tienes acceso a ese colegio.");
  if (session.role !== Role.SUPER_ADMIN && institutionId !== session.institutionId)
    return failure("Sólo puedes crear usuarios en el colegio que tienes activo.");

  const noPermitido = users.find((user) => !canAssignRole(session.role, user.role));
  if (noPermitido)
    return failure(
      "El lote incluye roles administrativos y sólo un Super Administrador puede crearlos.",
    );

  const errors: BulkUserSummary["errors"] = [];
  let created = 0;

  for (const user of users) {
    const catalogError = await verifyCatalogs(
      institutionId,
      user.positionId,
      user.areaId,
    );
    if (catalogError) {
      errors.push({ email: user.email, reason: catalogError });
      continue;
    }

    const duplicate = await findDuplicate({
      institutionId,
      rut: user.rut,
      email: user.email,
      corporateEmail: user.corporateEmail,
      username: user.username,
    });
    if (duplicate) {
      errors.push({ email: user.email, reason: duplicate });
      continue;
    }

    try {
      await prisma.user.create({
        data: {
          rut: user.rut,
          name: user.name,
          email: user.email,
          corporateEmail: user.corporateEmail || null,
          username: user.username || null,
          phone: user.phone || null,
          role: user.role,
          institutionId,
          positionId: user.positionId || null,
          areaId: user.areaId || null,
        },
      });
      created += 1;
    } catch (error) {
      console.error("[bulkCreateUsersAction]", error);
      errors.push({ email: user.email, reason: "No se pudo crear." });
    }
  }

  revalidateUsers();

  if (created === 0)
    return failure("No se creó ningún usuario. Revisa los errores del lote.");

  return success(
    { created, failed: errors.length, errors },
    `Se crearon ${created} usuario(s).` +
      (errors.length ? ` ${errors.length} con problemas.` : ""),
  );
}
