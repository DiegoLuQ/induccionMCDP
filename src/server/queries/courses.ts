import "server-only";

import { cache } from "react";
import { ProgressStatus, SubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeUnlockedLessons } from "@/server/services/progress-service";

/**
 * Obtiene el conjunto de IDs de lecciones activas leyendo directamente desde la base de datos,
 * garantizando que refleje el estado real incluso si el servidor de desarrollo no ha reiniciado su cliente.
 */
export async function getActiveLessonIdSet(courseId?: string): Promise<Set<string>> {
  try {
    const rows = courseId
      ? await prisma.$queryRawUnsafe<Array<{ id: string; isActive: number | boolean }>>(
          "SELECT id, isActive FROM `lessons` WHERE `courseId` = ?",
          courseId,
        )
      : await prisma.$queryRawUnsafe<Array<{ id: string; isActive: number | boolean }>>(
          "SELECT id, isActive FROM `lessons`",
        );
    const activeIds = new Set<string>();
    for (const row of rows) {
      if (
        row.isActive === 1 ||
        row.isActive === true ||
        row.isActive === null ||
        row.isActive === undefined
      ) {
        activeIds.add(row.id);
      }
    }
    return activeIds;
  } catch (_e) {
    return new Set<string>();
  }
}

/** Cursos asignados al funcionario dentro del colegio activo. */
export const getMyCourses = cache(
  async (userId: string, institutionId: string) => {
    const progress = await prisma.courseProgress.findMany({
      where: { userId, course: { institutionId, isPublished: true } },
      include: {
        course: {
          include: {
            lessons: {
              orderBy: { orderIndex: "asc" },
            },
            type: { select: { name: true } },
          },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    const lessonProgress = await prisma.lessonProgress.findMany({
      where: { userId, lesson: { course: { institutionId } } },
      select: { lessonId: true, isWatched: true, lesson: { select: { courseId: true } } },
    });

    const watchedByCourse = new Map<string, number>();
    for (const item of lessonProgress) {
      if (!item.isWatched) continue;
      const courseId = item.lesson.courseId;
      watchedByCourse.set(courseId, (watchedByCourse.get(courseId) ?? 0) + 1);
    }

    const activeIds = await getActiveLessonIdSet();

    return progress.map((entry) => {
      const activeLessons = entry.course.lessons.filter((l) => activeIds.has(l.id));
      const totalLessons = activeLessons.length;
      const rawWatched = watchedByCourse.get(entry.courseId) ?? 0;
      const watched =
        entry.status === ProgressStatus.COMPLETED
          ? totalLessons
          : Math.min(totalLessons, rawWatched);
      const totalSeconds = activeLessons.reduce(
        (sum, lesson) => sum + lesson.durationSeconds,
        0,
      );
      const progressPercent =
        entry.status === ProgressStatus.COMPLETED
          ? 100
          : totalLessons > 0
            ? Math.round((watched / totalLessons) * 100)
            : 0;

      return {
        id: entry.course.id,
        title: entry.course.title,
        description: entry.course.description,
        typeName: entry.course.type?.name ?? null,
        status: entry.status,
        finalScore: entry.finalScore,
        completedAt: entry.completedAt,
        totalLessons,
        watchedLessons: watched,
        totalSeconds,
        progressPercent,
      };
    });
  },
);

/**
 * Todo lo que el reproductor necesita: lecciones ordenadas, evaluaciones (sin
 * respuestas correctas), avance del usuario y bloqueo secuencial.
 */
export const getCoursePlayerData = cache(
  async (courseId: string, userId: string, institutionId: string) => {
    const course = await prisma.course.findFirst({
      where: { id: courseId, institutionId, isPublished: true },
      include: {
        institution: { select: { id: true, name: true, slug: true, domain: true, logoUrl: true } },
        type: { select: { name: true } },
        lessons: {
          orderBy: { orderIndex: "asc" },
          include: {
            module: { select: { id: true, title: true } },
            evaluation: {
              include: {
                questions: {
                  orderBy: { orderIndex: "asc" },
                  select: {
                    id: true,
                    type: true,
                    prompt: true,
                    imageUrl: true,
                    options: true,
                    points: true,
                    orderIndex: true,
                    // correctAnswer NUNCA se envía al cliente.
                  },
                },
              },
            },
          },
        },
        evaluations: {
          where: { lessonId: null },
          include: {
            questions: {
              orderBy: { orderIndex: "asc" },
              select: {
                id: true,
                type: true,
                prompt: true,
                imageUrl: true,
                options: true,
                points: true,
                orderIndex: true,
              },
            },
          },
        },
      },
    });

    if (!course) return null;

    const activeIds = await getActiveLessonIdSet(courseId);
    const activeLessons = course.lessons.filter((l) => activeIds.has(l.id));

    const [lessonProgress, submissions, courseProgress] = await Promise.all([
      prisma.lessonProgress.findMany({
        where: { userId, lesson: { courseId } },
        select: { lessonId: true, isWatched: true, watchedSeconds: true },
      }),
      prisma.evaluationSubmission.findMany({
        where: {
          userId,
          OR: [
            { evaluation: { courseId } },
            { evaluation: { lesson: { courseId } } },
          ],
        },
        orderBy: { attempt: "desc" },
        select: {
          id: true,
          evaluationId: true,
          score: true,
          status: true,
          attempt: true,
          createdAt: true,
        },
      }),
      prisma.courseProgress.findUnique({
        where: { userId_courseId: { userId, courseId } },
      }),
    ]);

    const progressByLesson = new Map(
      lessonProgress.map((p) => [p.lessonId, p]),
    );
    const watchedLessonIds = new Set(
      lessonProgress.filter((p) => p.isWatched).map((p) => p.lessonId),
    );
    const passedEvaluationIds = new Set(
      submissions
        .filter((s) => s.status === SubmissionStatus.PASSED)
        .map((s) => s.evaluationId),
    );
    const latestSubmissionByEvaluation = new Map<
      string,
      (typeof submissions)[number]
    >();
    for (const submission of submissions) {
      if (!latestSubmissionByEvaluation.has(submission.evaluationId)) {
        latestSubmissionByEvaluation.set(submission.evaluationId, submission);
      }
    }

    const unlocked = computeUnlockedLessons({
      lessons: activeLessons.map((l) => ({
        id: l.id,
        evaluationId: l.evaluation?.id ?? null,
      })),
      watchedLessonIds,
      passedEvaluationIds,
      isSequential: course.isSequential,
    });

    const lessons = activeLessons.map((lesson) => ({
      id: lesson.id,
      moduleId: lesson.moduleId ?? null,
      moduleTitle: lesson.module?.title ?? null,
      title: lesson.title,
      description: lesson.description,
      videoUrl: lesson.videoUrl,
      durationSeconds: lesson.durationSeconds,
      orderIndex: lesson.orderIndex,
      isWatched: watchedLessonIds.has(lesson.id),
      watchedSeconds: progressByLesson.get(lesson.id)?.watchedSeconds ?? 0,
      isUnlocked: unlocked.has(lesson.id),
      evaluation: lesson.evaluation
        ? {
            id: lesson.evaluation.id,
            title: lesson.evaluation.title,
            passingScore: lesson.evaluation.passingScore,
            maxAttempts: lesson.evaluation.maxAttempts,
            questions: lesson.evaluation.questions,
            isPassed: passedEvaluationIds.has(lesson.evaluation.id),
            attemptsUsed:
              latestSubmissionByEvaluation.get(lesson.evaluation.id)?.attempt ?? 0,
            lastSubmission:
              latestSubmissionByEvaluation.get(lesson.evaluation.id) ?? null,
          }
        : null,
    }));

    const finalEvaluation = course.evaluations[0]
      ? {
          id: course.evaluations[0].id,
          title: course.evaluations[0].title,
          passingScore: course.evaluations[0].passingScore,
          maxAttempts: course.evaluations[0].maxAttempts,
          questions: course.evaluations[0].questions,
          isPassed: passedEvaluationIds.has(course.evaluations[0].id),
          attemptsUsed:
            latestSubmissionByEvaluation.get(course.evaluations[0].id)?.attempt ??
            0,
          lastSubmission:
            latestSubmissionByEvaluation.get(course.evaluations[0].id) ?? null,
          /** Se habilita sólo cuando todos los videos fueron vistos. */
          isUnlocked: activeLessons.every((l) => watchedLessonIds.has(l.id)),
        }
      : null;

    return {
      id: course.id,
      title: course.title,
      description: course.description,
      typeName: course.type?.name ?? null,
      isSequential: course.isSequential,
      institution: course.institution,
      lessons,
      finalEvaluation,
      status: courseProgress?.status ?? ProgressStatus.PENDING,
      finalScore: courseProgress?.finalScore ?? null,
      completedAt: courseProgress?.completedAt ?? null,
    };
  },
);

export type CoursePlayerData = NonNullable<
  Awaited<ReturnType<typeof getCoursePlayerData>>
>;
export type PlayerLesson = CoursePlayerData["lessons"][number];
export type PlayerEvaluation = NonNullable<PlayerLesson["evaluation"]>;

/**
 * Vista previa para administradores: igual que getCoursePlayerData pero SIN
 * filtrar por isPublished, para poder previsualizar cursos en borrador.
 */
export const getCoursePreviewData = cache(
  async (courseId: string, userId: string, institutionId: string) => {
    const course = await prisma.course.findFirst({
      where: { id: courseId, institutionId },
      include: {
        institution: { select: { id: true, name: true, slug: true, domain: true, logoUrl: true } },
        type: { select: { name: true } },
        lessons: {
          orderBy: { orderIndex: "asc" },
          include: {
            module: { select: { id: true, title: true } },
            evaluation: {
              include: {
                questions: {
                  orderBy: { orderIndex: "asc" },
                  select: {
                    id: true,
                    type: true,
                    prompt: true,
                    imageUrl: true,
                    options: true,
                    points: true,
                    orderIndex: true,
                  },
                },
              },
            },
          },
        },
        evaluations: {
          where: { lessonId: null },
          include: {
            questions: {
              orderBy: { orderIndex: "asc" },
              select: {
                id: true,
                type: true,
                prompt: true,
                imageUrl: true,
                options: true,
                points: true,
                orderIndex: true,
              },
            },
          },
        },
      },
    });

    if (!course) return null;

    const activeIds = await getActiveLessonIdSet(courseId);
    const activeLessons = course.lessons.filter((l) => activeIds.has(l.id));

    // En preview no hay progreso real del admin, todo desbloqueado
    const lessons = activeLessons.map((lesson) => ({
      id: lesson.id,
      moduleId: lesson.moduleId ?? null,
      moduleTitle: lesson.module?.title ?? null,
      title: lesson.title,
      description: lesson.description,
      videoUrl: lesson.videoUrl,
      durationSeconds: lesson.durationSeconds,
      orderIndex: lesson.orderIndex,
      isWatched: false,
      watchedSeconds: 0,
      isUnlocked: true,
      evaluation: lesson.evaluation
        ? {
            id: lesson.evaluation.id,
            title: lesson.evaluation.title,
            passingScore: lesson.evaluation.passingScore,
            maxAttempts: lesson.evaluation.maxAttempts,
            questions: lesson.evaluation.questions,
            isPassed: false,
            attemptsUsed: 0,
            lastSubmission: null,
          }
        : null,
    }));

    const finalEvaluation = course.evaluations[0]
      ? {
          id: course.evaluations[0].id,
          title: course.evaluations[0].title,
          passingScore: course.evaluations[0].passingScore,
          maxAttempts: course.evaluations[0].maxAttempts,
          questions: course.evaluations[0].questions,
          isPassed: false,
          attemptsUsed: 0,
          lastSubmission: null,
          isUnlocked: true,
        }
      : null;

    return {
      id: course.id,
      title: course.title,
      description: course.description,
      typeName: course.type?.name ?? null,
      isSequential: course.isSequential,
      institution: course.institution,
      lessons,
      finalEvaluation,
      status: ProgressStatus.PENDING,
      finalScore: null,
      completedAt: null,
    };
  },
);

/** Listado administrativo de cursos del colegio activo. */
export const getAdminCourses = cache(async (institutionId: string) =>
  prisma.course.findMany({
    where: { institutionId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { lessons: true, invitations: true } },
      progress: {
        where: { user: { isActive: true } },
        select: { status: true },
      },
      category: { select: { id: true, name: true, color: true } },
      type: { select: { id: true, name: true, color: true } },
      tags: { select: { id: true, name: true } },
      lessons: { select: { durationSeconds: true } },
    },
  }),
);

/**
 * Detalle de un curso para el panel de administración. A diferencia de la
 * consulta del reproductor, aquí SÍ se incluye `correctAnswer`: es la vista de
 * RRHH, que necesita ver y editar la pauta de corrección.
 */
export const getCourseForAdmin = cache(
  async (courseId: string, institutionId: string) => {
    const course = await prisma.course.findFirst({
      where: { id: courseId, institutionId },
      include: {
        category: { select: { id: true, name: true, color: true } },
        type: { select: { id: true, name: true, color: true } },
        targetPositions: { select: { id: true, name: true } },
        tags: { select: { id: true, name: true } },
        modules: {
          orderBy: { orderIndex: "asc" },
          include: {
            lessons: {
              orderBy: { orderIndex: "asc" },
            },
          },
        },
        lessons: {
          orderBy: { orderIndex: "asc" },
          include: {
            module: { select: { id: true, title: true } },
            evaluation: {
              include: {
                questions: { orderBy: { orderIndex: "asc" } },
                _count: { select: { submissions: true } },
              },
            },
          },
        },
        evaluations: {
          where: { lessonId: null },
          include: {
            questions: { orderBy: { orderIndex: "asc" } },
            _count: { select: { submissions: true } },
          },
        },
      },
    });

    if (!course) return null;

    const activeIds = await getActiveLessonIdSet(courseId);
    for (const lesson of course.lessons) {
      lesson.isActive = activeIds.has(lesson.id);
    }

    return course;
  },
);

export type AdminCourseDetail = NonNullable<
  Awaited<ReturnType<typeof getCourseForAdmin>>
>;

/** Categorías del colegio, para el selector del formulario. */
export const getCategories = cache(async (institutionId: string) =>
  prisma.category.findMany({
    where: { institutionId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  }),
);

/** Etiquetas existentes, para sugerir autocompletado. */
export const getTags = cache(async (institutionId: string) =>
  prisma.tag.findMany({
    where: { institutionId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  }),
);

export const getPublishedCourseOptions = cache(async (institutionId: string) =>
  prisma.course.findMany({
    where: { institutionId, isPublished: true },
    orderBy: { title: "asc" },
    select: { id: true, title: true, type: true },
  }),
);
