"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/rbac";
import { failure, success, type ActionResult } from "@/lib/validations/common";
import { formatPeriod, nextPeriodCode, periodOrder, periodSeq, periodYear } from "@/lib/periods";

/** Año del período vigente: el configurado o, si no hay, el año de creación del curso. */
function effectivePeriod(course: { currentPeriod: number | null; createdAt: Date }): number {
  return course.currentPeriod ?? course.createdAt.getFullYear();
}

async function getAdminCourse(courseId: string) {
  const session = await getSession();
  if (!session || !isAdminRole(session.role)) return null;
  return prisma.course.findFirst({
    where: { id: courseId, institutionId: session.institutionId },
    select: { id: true, title: true, currentPeriod: true, createdAt: true },
  });
}

function revalidateCourses() {
  revalidatePath("/admin/cursos");
  revalidatePath("/admin/invitaciones");
  revalidatePath("/dashboard");
  revalidatePath("/reportes");
}

/** Marca/desmarca el curso como obligatorio y fija su fecha límite (opcional). */
export async function updateCourseMandatoryAction(input: {
  courseId: string;
  isMandatory: boolean;
  /** "YYYY-MM-DD" o vacío para quitarla. */
  dueDate?: string;
}): Promise<ActionResult> {
  const course = await getAdminCourse(input?.courseId);
  if (!course) return failure("Curso no encontrado o sin permisos.");

  let dueDate: Date | null = null;
  if (input.dueDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) return failure("Fecha límite inválida.");
    dueDate = new Date(`${input.dueDate}T00:00:00Z`);
  }

  await prisma.course.update({
    where: { id: course.id },
    data: {
      isMandatory: Boolean(input.isMandatory),
      dueDate,
      // Al marcarlo por primera vez queda fijado el período vigente.
      currentPeriod: course.currentPeriod ?? effectivePeriod(course),
    },
  });

  revalidateCourses();
  return success(
    undefined,
    input.isMandatory ? `"${course.title}" quedó como obligatorio.` : `"${course.title}" ya no es obligatorio.`,
  );
}

type Tx = Prisma.TransactionClient;

interface CourseScope {
  courseId: string;
  lessons: Array<{ id: string; durationSeconds: number }>;
  evaluationIds: string[];
}

async function getCourseScope(courseId: string): Promise<CourseScope> {
  const [lessons, evaluations] = await Promise.all([
    prisma.lesson.findMany({ where: { courseId }, select: { id: true, durationSeconds: true } }),
    prisma.evaluation.findMany({
      where: { OR: [{ courseId }, { lesson: { courseId } }] },
      select: { id: true },
    }),
  ]);
  return { courseId, lessons, evaluationIds: evaluations.map((e) => e.id) };
}

/** Períodos archivados del curso (historial, respuestas o constancias). */
async function getArchivedPeriods(scope: CourseScope): Promise<number[]> {
  const [history, certs, submissions] = await Promise.all([
    prisma.courseProgressHistory.findMany({
      where: { courseId: scope.courseId },
      distinct: ["period"],
      select: { period: true },
    }),
    prisma.signedCertificate.findMany({
      where: { courseId: scope.courseId, archivedPeriod: { gt: 0 } },
      distinct: ["archivedPeriod"],
      select: { archivedPeriod: true },
    }),
    scope.evaluationIds.length > 0
      ? prisma.evaluationSubmission.findMany({
          where: { evaluationId: { in: scope.evaluationIds }, archivedPeriod: { gt: 0 } },
          distinct: ["archivedPeriod"],
          select: { archivedPeriod: true },
        })
      : Promise.resolve([]),
  ]);
  return [
    ...new Set([
      ...history.map((h) => h.period),
      ...certs.map((c) => c.archivedPeriod),
      ...submissions.map((x) => x.archivedPeriod),
    ]),
  ];
}

/**
 * Archiva TODO lo del período vigente (no borra nada que no quede guardado):
 * avance + videos vistos en el historial, respuestas y constancias marcadas con
 * el período. Luego deja el curso limpio (avance, videos e invitaciones).
 */
async function archiveLivePeriod(tx: Tx, scope: CourseScope, period: number): Promise<number> {
  const lessonIds = scope.lessons.map((l) => l.id);
  const [progress, lessonProgress] = await Promise.all([
    tx.courseProgress.findMany({
      where: { courseId: scope.courseId },
      select: {
        userId: true,
        status: true,
        finalScore: true,
        startedAt: true,
        completedAt: true,
        user: { select: { institutionId: true } },
      },
    }),
    lessonIds.length > 0
      ? tx.lessonProgress.findMany({
          where: { lessonId: { in: lessonIds } },
          select: { userId: true, lessonId: true, isWatched: true, watchedSeconds: true, completedAt: true },
        })
      : Promise.resolve([]),
  ]);

  const lessonsByUser = new Map<string, typeof lessonProgress>();
  for (const lp of lessonProgress) {
    const list = lessonsByUser.get(lp.userId) ?? [];
    list.push(lp);
    lessonsByUser.set(lp.userId, list);
  }

  if (progress.length > 0) {
    await tx.courseProgressHistory.createMany({
      data: progress.map((p) => ({
        institutionId: p.user.institutionId,
        userId: p.userId,
        courseId: scope.courseId,
        period,
        status: p.status,
        finalScore: p.finalScore,
        startedAt: p.startedAt,
        completedAt: p.completedAt,
        lessonProgress: (lessonsByUser.get(p.userId) ?? []).map((lp) => ({
          lessonId: lp.lessonId,
          isWatched: lp.isWatched,
          watchedSeconds: lp.watchedSeconds,
          completedAt: lp.completedAt?.toISOString() ?? null,
        })),
      })),
      skipDuplicates: true,
    });
  }
  if (scope.evaluationIds.length > 0) {
    await tx.evaluationSubmission.updateMany({
      where: { evaluationId: { in: scope.evaluationIds }, archivedPeriod: 0 },
      data: { archivedPeriod: period },
    });
  }
  await tx.signedCertificate.updateMany({
    where: { courseId: scope.courseId, archivedPeriod: 0 },
    data: { archivedPeriod: period },
  });
  if (lessonIds.length > 0) await tx.lessonProgress.deleteMany({ where: { lessonId: { in: lessonIds } } });
  await tx.courseProgress.deleteMany({ where: { courseId: scope.courseId } });
  await tx.invitation.deleteMany({ where: { courseId: scope.courseId } });
  return progress.length;
}

type ArchivedLesson = { lessonId: string; isWatched: boolean; watchedSeconds: number; completedAt: string | null };

/** Restaura un período archivado como vigente (avance, videos, respuestas y constancias). */
async function restoreArchivedPeriod(tx: Tx, scope: CourseScope, period: number): Promise<number> {
  const history = await tx.courseProgressHistory.findMany({
    where: { courseId: scope.courseId, period },
    select: {
      userId: true,
      status: true,
      finalScore: true,
      startedAt: true,
      completedAt: true,
      lessonProgress: true,
    },
  });
  const validLessons = new Set(scope.lessons.map((l) => l.id));

  if (history.length > 0) {
    await tx.courseProgress.createMany({
      data: history.map((h) => ({
        userId: h.userId,
        courseId: scope.courseId,
        status: h.status,
        finalScore: h.finalScore,
        startedAt: h.startedAt,
        completedAt: h.completedAt,
      })),
      skipDuplicates: true,
    });

    const lessonRows = history.flatMap((h) => {
      const saved = Array.isArray(h.lessonProgress) ? (h.lessonProgress as ArchivedLesson[]) : null;
      if (saved) {
        return saved
          .filter((lp) => validLessons.has(lp.lessonId))
          .map((lp) => ({
            userId: h.userId,
            lessonId: lp.lessonId,
            isWatched: lp.isWatched,
            watchedSeconds: lp.watchedSeconds,
            completedAt: lp.completedAt ? new Date(lp.completedAt) : null,
          }));
      }
      // Historial antiguo sin detalle de videos: quien completó, los vio todos.
      return h.status === "COMPLETED"
        ? scope.lessons.map((lesson) => ({
            userId: h.userId,
            lessonId: lesson.id,
            isWatched: true,
            watchedSeconds: lesson.durationSeconds,
            completedAt: h.completedAt,
          }))
        : [];
    });
    if (lessonRows.length > 0) await tx.lessonProgress.createMany({ data: lessonRows, skipDuplicates: true });
    await tx.courseProgressHistory.deleteMany({ where: { courseId: scope.courseId, period } });
  }
  if (scope.evaluationIds.length > 0) {
    await tx.evaluationSubmission.updateMany({
      where: { evaluationId: { in: scope.evaluationIds }, archivedPeriod: period },
      data: { archivedPeriod: 0 },
    });
  }
  await tx.signedCertificate.updateMany({
    where: { courseId: scope.courseId, archivedPeriod: period },
    data: { archivedPeriod: 0 },
  });
  return history.length;
}

/**
 * Abre un período nuevo para reutilizar el curso: archiva el vigente completo
 * (avance, videos, respuestas, constancias) y deja el curso listo para que todos
 * lo hagan de nuevo.
 */
export async function startNewCoursePeriodAction(input: {
  courseId: string;
  /** Año del nuevo período. Puede ser el mismo año del vigente (ej. "2026 · 2"). */
  year: number;
}): Promise<ActionResult<{ archived: number; previousPeriod: number; newPeriod: number }>> {
  const course = await getAdminCourse(input?.courseId);
  if (!course) return failure("Curso no encontrado o sin permisos.");

  const previousPeriod = effectivePeriod(course);
  const year = Number(input.year);
  const scope = await getCourseScope(course.id);
  const newPeriod = nextPeriodCode(previousPeriod, year, await getArchivedPeriods(scope));
  if (newPeriod === null || year > new Date().getFullYear() + 5) {
    return failure(`El año debe ser ${formatPeriod(previousPeriod).slice(0, 4)} o posterior.`);
  }

  const archived = await prisma.$transaction(
    async (tx) => {
      const count = await archiveLivePeriod(tx, scope, previousPeriod);
      await tx.course.update({ where: { id: course.id }, data: { currentPeriod: newPeriod, dueDate: null } });
      return count;
    },
    { timeout: 60_000 },
  );

  revalidateCourses();
  revalidatePath("/admin/funcionarios");
  revalidatePath("/admin/constancias");
  return success(
    { archived, previousPeriod, newPeriod },
    `Período ${formatPeriod(previousPeriod)} archivado (${archived} resultado(s)). "${course.title}" quedó vigente en el período ${formatPeriod(newPeriod)}.`,
  );
}

/**
 * Cambia el período vigente a uno archivado SIN PERDER DATOS: el vigente se
 * archiva completo y el elegido se restaura (avance, videos, respuestas y
 * constancias). Se puede ir y volver entre períodos cuantas veces se quiera.
 */
export async function switchCoursePeriodAction(input: {
  courseId: string;
  period: number;
}): Promise<ActionResult<{ restored: number; archived: number }>> {
  const course = await getAdminCourse(input?.courseId);
  if (!course) return failure("Curso no encontrado o sin permisos.");

  const current = effectivePeriod(course);
  const target = Number(input.period);
  if (target === current) return failure("Ese período ya está vigente.");

  const scope = await getCourseScope(course.id);
  if (!(await getArchivedPeriods(scope)).includes(target)) {
    return failure(`No hay datos archivados del período ${formatPeriod(target)}.`);
  }

  const { restored, archived } = await prisma.$transaction(
    async (tx) => {
      const archivedCount = await archiveLivePeriod(tx, scope, current);
      const restoredCount = await restoreArchivedPeriod(tx, scope, target);
      await tx.course.update({ where: { id: course.id }, data: { currentPeriod: target } });
      return { restored: restoredCount, archived: archivedCount };
    },
    { timeout: 60_000 },
  );

  revalidateCourses();
  revalidatePath("/admin/funcionarios");
  revalidatePath("/admin/constancias");
  return success(
    { restored, archived },
    `"${course.title}" quedó en el período ${formatPeriod(target)} (${restored} resultado(s) restaurados). El período ${formatPeriod(current)} quedó archivado con ${archived} resultado(s); puedes volver a activarlo cuando quieras.`,
  );
}

/**
 * Elimina por completo un período ya cerrado de un curso: su historial de
 * resultados, las respuestas archivadas y las constancias firmadas de ese año
 * (registro y archivo). No se puede eliminar el período vigente.
 */
export async function deleteCoursePeriodAction(input: {
  courseId: string;
  period: number;
}): Promise<ActionResult<{ history: number; submissions: number; certificates: number }>> {
  const course = await getAdminCourse(input?.courseId);
  if (!course) return failure("Curso no encontrado o sin permisos.");

  const period = Number(input.period);
  if (!Number.isInteger(period) || period <= 0) return failure("Período inválido.");
  if (period === effectivePeriod(course)) return failure("No se puede eliminar el período vigente.");

  const evaluations = await prisma.evaluation.findMany({
    where: { OR: [{ courseId: course.id }, { lesson: { courseId: course.id } }] },
    select: { id: true },
  });

  const { counts, fileNames } = await prisma.$transaction(async (tx) => {
    const certificates = await tx.signedCertificate.findMany({
      where: { courseId: course.id, archivedPeriod: period },
      select: { fileName: true },
    });
    const history = await tx.courseProgressHistory.deleteMany({ where: { courseId: course.id, period } });
    const submissions =
      evaluations.length > 0
        ? await tx.evaluationSubmission.deleteMany({
            where: { evaluationId: { in: evaluations.map((e) => e.id) }, archivedPeriod: period },
          })
        : { count: 0 };
    const certs = await tx.signedCertificate.deleteMany({ where: { courseId: course.id, archivedPeriod: period } });
    return {
      counts: { history: history.count, submissions: submissions.count, certificates: certs.count },
      fileNames: certificates.map((c) => c.fileName),
    };
  });

  // Archivos de las constancias firmadas de ese período (tras confirmar el borrado en la BD).
  const { deleteSignedCertificateFile } = await import("@/server/services/signed-certificate-files");
  for (const fileName of fileNames) await deleteSignedCertificateFile(fileName);

  revalidateCourses();
  revalidatePath("/admin/constancias");
  return success(
    counts,
    `Período ${formatPeriod(period)} eliminado: ${counts.history} resultado(s), ${counts.submissions} respuesta(s) y ${counts.certificates} constancia(s).`,
  );
}

/**
 * Vuelve al período archivado más reciente anterior al vigente. NO descarta el
 * vigente: lo archiva, así se puede volver a activar después.
 */
export async function revertCoursePeriodAction(input: {
  courseId: string;
}): Promise<ActionResult<{ restored: number; archived: number }>> {
  const course = await getAdminCourse(input?.courseId);
  if (!course) return failure("Curso no encontrado o sin permisos.");

  const current = effectivePeriod(course);
  const previous = (await getArchivedPeriods(await getCourseScope(course.id)))
    .filter((p) => periodOrder(p) < periodOrder(current))
    .sort((x, y) => periodOrder(y) - periodOrder(x))[0];
  if (previous === undefined) return failure("No hay un período anterior archivado al que volver.");
  return switchCoursePeriodAction({ courseId: course.id, period: previous });
}

/**
 * Corrige el año del período vigente (ej. se abrió 2027 por error y debía ser
 * 2026). Conserva toda la actividad del período: sólo cambia su año.
 */
export async function correctCurrentPeriodAction(input: {
  courseId: string;
  year: number;
}): Promise<ActionResult> {
  const course = await getAdminCourse(input?.courseId);
  if (!course) return failure("Curso no encontrado o sin permisos.");

  const year = Number(input.year);
  if (!Number.isInteger(year) || year < 2000 || year > new Date().getFullYear() + 5) {
    return failure("Año inválido.");
  }

  const current = effectivePeriod(course);
  if (periodYear(current) === year) return failure(`El período vigente ya es del año ${year}.`);

  // Los datos vigentes (avance, respuestas, constancias) no guardan el año: sólo
  // se etiquetan al archivarse. Por eso basta con cambiar la etiqueta, sin tocar
  // la actividad. Si ese año ya tiene períodos archivados, se usa el siguiente
  // número libre (ej. "2026 · 2") para no mezclarlos.
  const archived = (await getArchivedPeriods(await getCourseScope(course.id))).filter(
    (p) => periodYear(p) === year,
  );
  const nextSeq = archived.length > 0 ? Math.max(...archived.map(periodSeq)) + 1 : 1;
  if (nextSeq > 99) return failure(`No quedan períodos disponibles en ${year}.`);
  const code = nextSeq === 1 ? year : year * 100 + nextSeq;

  await prisma.course.update({ where: { id: course.id }, data: { currentPeriod: code } });
  revalidateCourses();
  revalidatePath("/admin/funcionarios");
  return success(undefined, `El período vigente de "${course.title}" ahora es ${formatPeriod(code)}.`);
}
