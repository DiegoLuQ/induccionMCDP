"use server";

import { revalidatePath } from "next/cache";
import { ProgressStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { LESSON_COMPLETION_THRESHOLD } from "@/lib/constants";
import {
  startCourseSchema,
  trackProgressSchema,
} from "@/lib/validations/progress";
import {
  failure,
  fromZodError,
  success,
  type ActionResult,
} from "@/lib/validations/common";
import { recalculateCourseProgress } from "@/server/services/progress-service";

/**
 * Heartbeat del reproductor. El cliente propone el avance, pero el servidor
 * decide si la lección queda vista: nunca confía en `reachedEnd` a secas, lo
 * contrasta con la duración real registrada en la lección.
 */
export async function trackLessonProgressAction(
  input: unknown,
): Promise<ActionResult<{ isWatched: boolean; courseCompleted: boolean }>> {
  const session = await getSession();
  if (!session) return failure("Sesión expirada.");

  const parsed = trackProgressSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const lesson = await prisma.lesson.findFirst({
    where: {
      id: parsed.data.lessonId,
      course: { institutionId: session.institutionId },
    },
    select: { id: true, courseId: true, durationSeconds: true },
  });
  if (!lesson) return failure("Lección no encontrada.");

  const existing = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId: session.sub, lessonId: lesson.id } },
    select: { watchedSeconds: true, isWatched: true },
  });

  // El avance nunca retrocede: evita que un seek hacia atrás borre progreso.
  const watchedSeconds = Math.max(
    existing?.watchedSeconds ?? 0,
    Math.min(parsed.data.watchedSeconds, lesson.durationSeconds || Number.MAX_SAFE_INTEGER),
  );

  const threshold = lesson.durationSeconds
    ? lesson.durationSeconds * LESSON_COMPLETION_THRESHOLD
    : Number.POSITIVE_INFINITY;

  const isWatched =
    existing?.isWatched === true ||
    (parsed.data.reachedEnd && watchedSeconds >= threshold);

  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId: session.sub, lessonId: lesson.id } },
    create: {
      userId: session.sub,
      lessonId: lesson.id,
      watchedSeconds,
      isWatched,
      completedAt: isWatched ? new Date() : null,
    },
    update: {
      watchedSeconds,
      isWatched,
      ...(isWatched && !existing?.isWatched ? { completedAt: new Date() } : {}),
    },
  });

  let courseCompleted = false;
  if (isWatched && !existing?.isWatched) {
    const result = await recalculateCourseProgress(session.sub, lesson.courseId);
    courseCompleted = result.status === ProgressStatus.COMPLETED;
    revalidatePath(`/mis-inducciones/${lesson.courseId}`);
  }

  return success({ isWatched, courseCompleted });
}

/** Marca el inicio del curso (primer ingreso al reproductor). */
export async function startCourseAction(
  courseId: string,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return failure("Sesión expirada.");

  const parsed = startCourseSchema.safeParse({ courseId });
  if (!parsed.success) return fromZodError(parsed.error);

  const course = await prisma.course.findFirst({
    where: { id: parsed.data.courseId, institutionId: session.institutionId },
    select: { id: true },
  });
  if (!course) return failure("Curso no encontrado.");

  // Sólo promueve PENDING -> IN_PROGRESS; nunca revierte un curso completado
  // ni pisa la fecha de inicio original (es evidencia auditable).
  await prisma.courseProgress.upsert({
    where: { userId_courseId: { userId: session.sub, courseId: course.id } },
    create: {
      userId: session.sub,
      courseId: course.id,
      status: ProgressStatus.IN_PROGRESS,
      startedAt: new Date(),
    },
    update: {},
  });

  await prisma.courseProgress.updateMany({
    where: {
      userId: session.sub,
      courseId: course.id,
      status: ProgressStatus.PENDING,
    },
    data: { status: ProgressStatus.IN_PROGRESS, startedAt: new Date() },
  });

  return success();
}

/** Confirma formalmente que el funcionario terminó la inducción. */
export async function confirmCourseCompletionAction(
  courseId: string,
): Promise<ActionResult<{ completedAt: Date }>> {
  const session = await getSession();
  if (!session) return failure("Sesión expirada.");

  // Recalcular y consolidar el progreso
  await recalculateCourseProgress(session.sub, courseId);

  const completedAt = new Date();
  await prisma.courseProgress.upsert({
    where: {
      userId_courseId: {
        userId: session.sub,
        courseId,
      },
    },
    create: {
      userId: session.sub,
      courseId,
      status: ProgressStatus.COMPLETED,
      completedAt,
    },
    update: {
      status: ProgressStatus.COMPLETED,
      completedAt,
    },
  });

  // Asegurar que todas las lecciones activas queden registradas como vistas
  try {
    const rawActive = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      "SELECT id FROM `lessons` WHERE `courseId` = ? AND (isActive = 1 OR isActive IS NULL)",
      courseId,
    );
    for (const l of rawActive) {
      await prisma.lessonProgress.upsert({
        where: { userId_lessonId: { userId: session.sub, lessonId: l.id } },
        create: {
          userId: session.sub,
          lessonId: l.id,
          isWatched: true,
          watchedSeconds: 9999,
          completedAt,
        },
        update: {
          isWatched: true,
          completedAt,
        },
      });
    }
  } catch (_e) {
    // Non-blocking
  }

  revalidatePath(`/mis-inducciones/${courseId}`);
  revalidatePath("/mis-inducciones");
  revalidatePath(`/admin/cursos/${courseId}`);
  revalidatePath("/admin/cursos");

  return success(
    { completedAt },
    "Inducción confirmada y registrada exitosamente.",
  );
}

/** Elimina un registro puntual de seguimiento / avance de un funcionario en un curso. */
export async function deleteCourseProgressAction(
  progressId: string,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return failure("Sesión expirada.");

  try {
    const progress = await prisma.courseProgress.findFirst({
      where: {
        id: progressId,
        course: { institutionId: session.institutionId },
      },
      select: { userId: true, courseId: true },
    });

    if (!progress) return failure("Registro no encontrado.");

    // Eliminar avances de lecciones, envíos de evaluación y el progreso del curso
    await prisma.$transaction([
      prisma.lessonProgress.deleteMany({
        where: {
          userId: progress.userId,
          lesson: { courseId: progress.courseId },
        },
      }),
      prisma.evaluationSubmission.deleteMany({
        where: {
          userId: progress.userId,
          archivedPeriod: 0, // sólo el período vigente
          OR: [
            { evaluation: { courseId: progress.courseId } },
            { evaluation: { lesson: { courseId: progress.courseId } } },
          ],
        },
      }),
      prisma.courseProgress.delete({
        where: { id: progressId },
      }),
    ]);

    revalidatePath("/admin");
    return success(undefined, "Registro de avance eliminado.");
  } catch (error) {
    console.error("[deleteCourseProgressAction]", error);
    return failure("No se pudo eliminar el registro de avance.");
  }
}

/** Reinicia o elimina todo el seguimiento de pruebas del colegio activo. */
export async function resetAllCourseProgressAction(): Promise<ActionResult<{ deleted: number }>> {
  const session = await getSession();
  if (!session) return failure("Sesión expirada.");

  try {
    const [delLessonProgress, delSubmissions, delCourseProgress] =
      await prisma.$transaction([
        prisma.lessonProgress.deleteMany({
          where: { lesson: { course: { institutionId: session.institutionId } } },
        }),
        prisma.evaluationSubmission.deleteMany({
          where: {
            archivedPeriod: 0, // sólo el período vigente
            OR: [
              { evaluation: { course: { institutionId: session.institutionId } } },
              {
                evaluation: {
                  lesson: { course: { institutionId: session.institutionId } },
                },
              },
            ],
          },
        }),
        prisma.courseProgress.deleteMany({
          where: { course: { institutionId: session.institutionId } },
        }),
      ]);

    revalidatePath("/admin");
    return success(
      { deleted: delCourseProgress.count },
      `Se eliminaron ${delCourseProgress.count} registros de seguimiento.`,
    );
  } catch (error) {
    console.error("[resetAllCourseProgressAction]", error);
    return failure("Error al reiniciar el seguimiento.");
  }
}

/** Forma de las alternativas guardadas en `Question.options` (JSON). */
type StoredOption = { id?: string; text?: string; imageUrl?: string };

/** Forma de cada respuesta guardada en `EvaluationSubmission.answers` (JSON). */
type StoredAnswer = {
  questionId?: string;
  answer?: string | null;
  answerLabel?: string | null;
  isCorrect?: boolean;
  earned?: number;
};

export interface ProgressDetailEvaluationQuestion {
  id: string;
  prompt: string;
  type: string;
  points: number;
  options: Array<{ id: string; text: string; imageUrl?: string }>;
  userAnswer: string | null;
  userAnswerLabel: string | null;
  isCorrect: boolean | null;
  correctAnswer: string | null;
  correctAnswerLabel: string | null;
  earned: number;
}

export interface ProgressDetailEvaluation {
  id: string;
  title: string;
  lessonTitle: string | null;
  passingScore: number;
  submission: {
    id: string;
    score: number;
    status: string;
    createdAt: Date;
  } | null;
  questions: ProgressDetailEvaluationQuestion[];
}

export interface CourseProgressDetailData {
  progressId: string;
  user: {
    id: string;
    name: string;
    rut: string;
    email: string;
    corporateEmail: string | null;
    position: string | null;
    area: string | null;
  };
  course: {
    id: string;
    title: string;
    description: string | null;
  };
  progress: {
    status: ProgressStatus;
    finalScore: number | null;
    startedAt: Date | null;
    completedAt: Date | null;
    updatedAt: Date;
  };
  lessons: Array<{
    id: string;
    title: string;
    orderIndex: number;
    durationSeconds: number;
    isWatched: boolean;
    watchedSeconds: number;
    completedAt: Date | null;
  }>;
  evaluations: ProgressDetailEvaluation[];
}

/** Obtiene todo el detalle, estadísticas, timestamps y respuestas de preguntas de un funcionario. */
export async function getCourseProgressDetailAction(
  progressId: string,
): Promise<ActionResult<CourseProgressDetailData>> {
  const session = await getSession();
  if (!session) return failure("Sesión expirada.");

  try {
    const cp = await prisma.courseProgress.findFirst({
      where: {
        id: progressId,
        course: { institutionId: session.institutionId },
      },
      include: {
        user: {
          include: {
            position: { select: { name: true } },
            area: { select: { name: true } },
          },
        },
        course: {
          include: {
            lessons: {
              orderBy: { orderIndex: "asc" },
              include: {
                evaluation: {
                  include: {
                    questions: { orderBy: { orderIndex: "asc" } },
                  },
                },
              },
            },
            evaluations: {
              where: { lessonId: null },
              include: {
                questions: { orderBy: { orderIndex: "asc" } },
              },
            },
          },
        },
      },
    });

    if (!cp) return failure("Registro de progreso no encontrado.");

    const lessonIds = cp.course.lessons.map((l) => l.id);
    const lessonProgresses = await prisma.lessonProgress.findMany({
      where: {
        userId: cp.userId,
        lessonId: { in: lessonIds },
      },
    });
    const lessonProgressMap = new Map(lessonProgresses.map((lp) => [lp.lessonId, lp]));

    const lessonsData = cp.course.lessons.map((lesson) => {
      const lp = lessonProgressMap.get(lesson.id);
      return {
        id: lesson.id,
        title: lesson.title,
        orderIndex: lesson.orderIndex,
        durationSeconds: lesson.durationSeconds,
        isWatched: lp?.isWatched ?? false,
        watchedSeconds: lp?.watchedSeconds ?? 0,
        completedAt: lp?.completedAt ?? null,
      };
    });

    const allEvals: Array<{
      evaluation: (typeof cp.course.evaluations)[number];
      lessonTitle: string | null;
    }> = [];

    for (const l of cp.course.lessons) {
      if (l.evaluation) {
        allEvals.push({ evaluation: l.evaluation, lessonTitle: l.title });
      }
    }
    for (const e of cp.course.evaluations) {
      allEvals.push({ evaluation: e, lessonTitle: null });
    }

    const evalIds = allEvals.map((e) => e.evaluation.id);

    const submissions = await prisma.evaluationSubmission.findMany({
      where: {
        userId: cp.userId,
        evaluationId: { in: evalIds },
        archivedPeriod: 0, // sólo el período vigente
      },
      orderBy: { createdAt: "desc" },
    });

    const submissionMap = new Map<string, (typeof submissions)[0]>();
    for (const sub of submissions) {
      if (!submissionMap.has(sub.evaluationId)) {
        submissionMap.set(sub.evaluationId, sub);
      }
    }

    const evaluationsData: ProgressDetailEvaluation[] = allEvals.map(
      ({ evaluation, lessonTitle }) => {
        const sub = submissionMap.get(evaluation.id) ?? null;
        const subAnswers = Array.isArray(sub?.answers)
          ? (sub.answers as StoredAnswer[])
          : [];
        const answerByQuestionId = new Map(
          subAnswers.map((a) => [a.questionId, a]),
        );

        const questions = evaluation.questions.map((q) => {
          const rawOptions = Array.isArray(q.options)
            ? (q.options as StoredOption[])
            : [];
          const options = rawOptions.map((opt) => ({
            id: opt.id || "",
            text: opt.text || "",
            imageUrl: opt.imageUrl,
          }));

          const submittedAns = answerByQuestionId.get(q.id);

          let correctAnswerLabel: string | null = null;
          if (q.correctAnswer) {
            const correctOpt = options.find(
              (opt) => opt.id === q.correctAnswer,
            );
            correctAnswerLabel = correctOpt?.text || q.correctAnswer;
          }

          return {
            id: q.id,
            prompt: q.prompt,
            type: q.type,
            points: q.points || 1,
            options,
            userAnswer: submittedAns?.answer ?? null,
            userAnswerLabel:
              submittedAns?.answerLabel ?? submittedAns?.answer ?? null,
            isCorrect: submittedAns ? Boolean(submittedAns.isCorrect) : null,
            correctAnswer: q.correctAnswer ?? null,
            correctAnswerLabel,
            earned:
              submittedAns?.earned ??
              (submittedAns?.isCorrect ? q.points || 1 : 0),
          };
        });

        return {
          id: evaluation.id,
          title: evaluation.title,
          lessonTitle,
          passingScore: evaluation.passingScore,
          submission: sub
            ? {
                id: sub.id,
                score: sub.score,
                status: sub.status,
                createdAt: sub.createdAt,
              }
            : null,
          questions,
        };
      },
    );

    return success({
      progressId: cp.id,
      user: {
        id: cp.user.id,
        name: cp.user.name,
        rut: cp.user.rut,
        email: cp.user.email,
        corporateEmail: cp.user.corporateEmail,
        position: cp.user.position?.name ?? null,
        area: cp.user.area?.name ?? null,
      },
      course: {
        id: cp.course.id,
        title: cp.course.title,
        description: cp.course.description,
      },
      progress: {
        status: cp.status,
        finalScore: cp.finalScore,
        startedAt: cp.startedAt,
        completedAt: cp.completedAt,
        updatedAt: cp.updatedAt,
      },
      lessons: lessonsData,
      evaluations: evaluationsData,
    });
  } catch (error) {
    console.error("[getCourseProgressDetailAction]", error);
    return failure("Error al obtener el detalle del funcionario.");
  }
}
