import "server-only";

import { ProgressStatus, SubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail/mailer";
import { completionEmail } from "@/lib/mail/templates";

/**
 * Recalcula el estado del curso para un usuario.
 * Un curso está COMPLETED cuando:
 *  - todas sus lecciones están marcadas como vistas, y
 *  - toda evaluación asociada (por lección o de curso) tiene una entrega PASSED.
 */
export async function recalculateCourseProgress(
  userId: string,
  courseId: string,
): Promise<{ status: ProgressStatus; finalScore: number | null }> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      institution: { select: { name: true, domain: true } },
      lessons: {
        include: { evaluation: { include: { questions: true } } },
        orderBy: { orderIndex: "asc" },
      },
      evaluations: { where: { lessonId: null }, include: { questions: true } },
    },
  });

  if (!course) throw new Error("Curso no encontrado.");

  let activeIds: Set<string>;
  try {
    const rawRows = await prisma.$queryRawUnsafe<Array<{ id: string; isActive: number | boolean }>>(
      "SELECT id, isActive FROM `lessons` WHERE `courseId` = ?",
      courseId,
    );
    activeIds = new Set(
      rawRows
        .filter(
          (r) =>
            r.isActive === 1 ||
            r.isActive === true ||
            r.isActive === null ||
            r.isActive === undefined,
        )
        .map((r) => r.id),
    );
  } catch {
    activeIds = new Set(course.lessons.map((l) => l.id));
  }

  const activeLessons = course.lessons.filter((l) => activeIds.has(l.id));
  const lessonIds = activeLessons.map((l) => l.id);
  const evaluationIds = [
    ...activeLessons.flatMap((l) => (l.evaluation ? [l.evaluation.id] : [])),
    ...course.evaluations.map((e) => e.id),
  ];

  // Recopilar todas las preguntas del curso para cálculo exacto de puntaje ponderado
  const allQuestions = [
    ...activeLessons.flatMap((l) => l.evaluation?.questions ?? []),
    ...course.evaluations.flatMap((e) => e.questions ?? []),
  ];

  const totalCoursePoints = allQuestions.reduce((sum, q) => {
    return q.type === "MULTIPLE_CHOICE" ? sum + (q.points || 1) : sum;
  }, 0);

  const [watched, allUserSubmissions] = await Promise.all([
    prisma.lessonProgress.count({
      where: { userId, lessonId: { in: lessonIds }, isWatched: true },
    }),
    evaluationIds.length
      ? prisma.evaluationSubmission.findMany({
          where: {
            userId,
            evaluationId: { in: evaluationIds },
          },
          select: { evaluationId: true, score: true, status: true, answers: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  // Tomar la entrega más reciente por cada evaluación
  const latestSubmissionsByEval = new Map<string, typeof allUserSubmissions[0]>();
  for (const sub of allUserSubmissions) {
    if (!latestSubmissionsByEval.has(sub.evaluationId)) {
      latestSubmissionsByEval.set(sub.evaluationId, sub);
    }
  }

  const passedEvaluationIds = new Set(
    Array.from(latestSubmissionsByEval.values())
      .filter((s) => s.status === SubmissionStatus.PASSED)
      .map((s) => s.evaluationId),
  );

  const allLessonsWatched =
    lessonIds.length > 0 && watched >= lessonIds.length;
  const allEvaluationsPassed = evaluationIds.every((id) =>
    passedEvaluationIds.has(id),
  );

  const isCompleted = allLessonsWatched && allEvaluationsPassed;
  const hasStarted = watched > 0 || latestSubmissionsByEval.size > 0;

  // Cálculo proporcional de puntaje:
  // Suma los puntos ganados de todas las preguntas respondidas vs el total de puntos de la inducción
  let totalEarnedPoints = 0;
  let hasAnyAnswer = false;

  for (const sub of latestSubmissionsByEval.values()) {
    if (Array.isArray(sub.answers)) {
      for (const ans of sub.answers as Array<{ isCorrect?: boolean; earned?: unknown; points?: unknown }>) {
        hasAnyAnswer = true;
        if (ans.isCorrect && typeof ans.earned === "number") {
          totalEarnedPoints += ans.earned;
        } else if (ans.isCorrect && typeof ans.points === "number") {
          totalEarnedPoints += ans.points;
        }
      }
    }
  }

  let finalScore: number | null = null;
  if (totalCoursePoints > 0) {
    if (hasAnyAnswer) {
      finalScore = Math.round((totalEarnedPoints / totalCoursePoints) * 100);
    }
  } else if (evaluationIds.length > 0) {
    if (latestSubmissionsByEval.size > 0) {
      const sumScores = Array.from(latestSubmissionsByEval.values()).reduce(
        (acc, s) => acc + s.score,
        0,
      );
      finalScore = Math.round(sumScores / evaluationIds.length);
    }
  } else if (isCompleted) {
    finalScore = 100;
  }

  const status: ProgressStatus = isCompleted
    ? ProgressStatus.COMPLETED
    : hasStarted
      ? ProgressStatus.IN_PROGRESS
      : ProgressStatus.PENDING;

  const previous = await prisma.courseProgress.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { status: true },
  });

  await prisma.courseProgress.upsert({
    where: { userId_courseId: { userId, courseId } },
    create: {
      userId,
      courseId,
      status,
      finalScore,
      startedAt: hasStarted ? new Date() : null,
      completedAt: isCompleted ? new Date() : null,
    },
    update: {
      status,
      finalScore,
      // startedAt no se toca: la fecha de inicio original es evidencia.
      // completedAt se sella una única vez, al cruzar a COMPLETED.
      ...(isCompleted
        ? previous?.status === ProgressStatus.COMPLETED
          ? {}
          : { completedAt: new Date() }
        : { completedAt: null }),
    },
  });

  // Evidencia: se notifica una sola vez, al cruzar a COMPLETED.
  if (isCompleted && previous?.status !== ProgressStatus.COMPLETED) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (user) {
      const mail = completionEmail({
        name: user.name,
        courseTitle: course.title,
        score: finalScore ?? 100,
        institutionName: course.institution.name,
      });
      await sendMail({
        to: user.email,
        institutionDomain: course.institution.domain,
        ...mail,
      });
    }
  }

  return { status, finalScore };
}

/**
 * Determina qué lecciones puede ver el usuario.
 * En cursos secuenciales, la lección N se desbloquea cuando la N-1 está vista
 * y su evaluación (si existe) fue aprobada.
 */
export function computeUnlockedLessons(params: {
  lessons: Array<{ id: string; evaluationId: string | null }>;
  watchedLessonIds: Set<string>;
  passedEvaluationIds: Set<string>;
  isSequential: boolean;
}): Set<string> {
  const unlocked = new Set<string>();
  if (!params.isSequential) {
    params.lessons.forEach((lesson) => unlocked.add(lesson.id));
    return unlocked;
  }

  for (const lesson of params.lessons) {
    unlocked.add(lesson.id);
    const watched = params.watchedLessonIds.has(lesson.id);
    const evaluationOk =
      !lesson.evaluationId || params.passedEvaluationIds.has(lesson.evaluationId);
    if (!watched || !evaluationOk) break;
  }

  return unlocked;
}
