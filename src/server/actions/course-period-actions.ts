"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/rbac";
import { failure, success, type ActionResult } from "@/lib/validations/common";

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

/**
 * Cierra el período vigente del curso y abre uno nuevo para reutilizarlo:
 * 1. Guarda en el historial el estado/nota/fechas de cada funcionario.
 * 2. Archiva (no borra) las respuestas y las constancias firmadas del período.
 * 3. Reinicia avance, videos vistos e invitaciones, para que todos lo hagan de nuevo.
 */
export async function startNewCoursePeriodAction(input: {
  courseId: string;
  newPeriod: number;
}): Promise<ActionResult<{ archived: number; previousPeriod: number }>> {
  const course = await getAdminCourse(input?.courseId);
  if (!course) return failure("Curso no encontrado o sin permisos.");

  const previousPeriod = effectivePeriod(course);
  const newPeriod = Number(input.newPeriod);
  if (!Number.isInteger(newPeriod) || newPeriod <= previousPeriod || newPeriod > previousPeriod + 5) {
    return failure(`El nuevo período debe ser posterior a ${previousPeriod}.`);
  }

  const [lessons, evaluations] = await Promise.all([
    prisma.lesson.findMany({ where: { courseId: course.id }, select: { id: true } }),
    prisma.evaluation.findMany({
      where: { OR: [{ courseId: course.id }, { lesson: { courseId: course.id } }] },
      select: { id: true },
    }),
  ]);
  const lessonIds = lessons.map((l) => l.id);
  const evaluationIds = evaluations.map((e) => e.id);

  const archived = await prisma.$transaction(
    async (tx) => {
      const progress = await tx.courseProgress.findMany({
        where: { courseId: course.id },
        select: {
          userId: true,
          status: true,
          finalScore: true,
          startedAt: true,
          completedAt: true,
          user: { select: { institutionId: true } },
        },
      });

      await tx.courseProgressHistory.createMany({
        data: progress.map((p) => ({
          institutionId: p.user.institutionId,
          userId: p.userId,
          courseId: course.id,
          period: previousPeriod,
          status: p.status,
          finalScore: p.finalScore,
          startedAt: p.startedAt,
          completedAt: p.completedAt,
        })),
        skipDuplicates: true,
      });

      if (evaluationIds.length > 0) {
        await tx.evaluationSubmission.updateMany({
          where: { evaluationId: { in: evaluationIds }, archivedPeriod: 0 },
          data: { archivedPeriod: previousPeriod },
        });
      }
      await tx.signedCertificate.updateMany({
        where: { courseId: course.id, archivedPeriod: 0 },
        data: { archivedPeriod: previousPeriod },
      });

      if (lessonIds.length > 0) {
        await tx.lessonProgress.deleteMany({ where: { lessonId: { in: lessonIds } } });
      }
      await tx.courseProgress.deleteMany({ where: { courseId: course.id } });
      await tx.invitation.deleteMany({ where: { courseId: course.id } });

      await tx.course.update({ where: { id: course.id }, data: { currentPeriod: newPeriod, dueDate: null } });
      return progress.length;
    },
    { timeout: 60_000 },
  );

  revalidateCourses();
  revalidatePath("/admin/funcionarios");
  revalidatePath("/admin/constancias");
  return success(
    { archived, previousPeriod },
    `Período ${previousPeriod} cerrado (${archived} registro(s) guardados en el historial). "${course.title}" quedó vigente para ${newPeriod}.`,
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
    `Período ${period} eliminado: ${counts.history} resultado(s), ${counts.submissions} respuesta(s) y ${counts.certificates} constancia(s).`,
  );
}
