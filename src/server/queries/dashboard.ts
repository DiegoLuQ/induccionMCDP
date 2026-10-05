import "server-only";

import { cache } from "react";
import { ProgressStatus, QuestionType, SubmissionStatus } from "@prisma/client";
import { LIKERT_SCALE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

/** KPIs y monitoreo en tiempo real para RRHH. */
export const getAdminDashboard = cache(async (institutionId: string) => {
  const now = new Date();

  const [
    totalUsers,
    totalCourses,
    completed,
    inProgress,
    pending,
    activeInvitations,
    expiredInvitations,
    pendingReviews,
    recent,
    latestCourse,
  ] = await Promise.all([
    prisma.user.count({ where: { institutionId, isActive: true } }),
    prisma.course.count({ where: { institutionId, isPublished: true } }),
    prisma.courseProgress.count({
      where: { course: { institutionId }, status: ProgressStatus.COMPLETED },
    }),
    prisma.courseProgress.count({
      where: { course: { institutionId }, status: ProgressStatus.IN_PROGRESS },
    }),
    prisma.courseProgress.count({
      where: { course: { institutionId }, status: ProgressStatus.PENDING },
    }),
    prisma.invitation.count({
      where: { institutionId, isUsed: false, expiresAt: { gt: now } },
    }),
    prisma.invitation.count({
      where: { institutionId, isUsed: false, expiresAt: { lte: now } },
    }),
    prisma.evaluationSubmission.count({
      where: {
        status: SubmissionStatus.PENDING_REVIEW,
        user: { institutionId },
      },
    }),
    prisma.courseProgress.findMany({
      where: { course: { institutionId } },
      orderBy: { updatedAt: "desc" },
      take: 10,
      include: {
        user: {
          select: {
            name: true,
            rut: true,
            position: { select: { name: true } },
          },
        },
        course: { select: { title: true } },
      },
    }),
    prisma.course.findFirst({
      where: { institutionId, isPublished: true },
      orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
      select: { id: true, title: true },
    }),
  ]);

  // Funcionarios activos que NO han completado ninguna inducción
  const [totalPendingStaff, pendingStaff] = await Promise.all([
    prisma.user.count({
      where: {
        institutionId,
        isActive: true,
        role: "FUNCIONARIO",
        NOT: {
          courseProgress: {
            some: {
              status: ProgressStatus.COMPLETED,
            },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: {
        institutionId,
        isActive: true,
        role: "FUNCIONARIO",
        NOT: {
          courseProgress: {
            some: {
              status: ProgressStatus.COMPLETED,
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        rut: true,
        email: true,
        position: { select: { name: true } },
        area: { select: { name: true } },
        courseProgress: {
          where: latestCourse ? { courseId: latestCourse.id } : { courseId: "" },
          select: { status: true, updatedAt: true },
        },
      },
      orderBy: { name: "asc" },
      take: 50,
    }),
  ]);

  const totalProgress = completed + inProgress + pending;

  return {
    totalUsers,
    totalCourses,
    completed,
    inProgress,
    pending,
    completionRate:
      totalProgress > 0 ? Math.round((completed / totalProgress) * 100) : 0,
    activeInvitations,
    expiredInvitations,
    pendingReviews,
    recent,
    latestCourse,
    totalPendingStaff,
    pendingStaff,
  };
});

/** Resumen personal del funcionario. */
export const getUserDashboard = cache(
  async (userId: string, institutionId: string) => {
    const [progress, pendingInvitations] = await Promise.all([
      prisma.courseProgress.findMany({
        where: { userId, course: { institutionId } },
        include: { course: { select: { id: true, title: true, type: true } } },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.invitation.count({
        where: { userId, isUsed: false, expiresAt: { gt: new Date() } },
      }),
    ]);

    return {
      total: progress.length,
      completed: progress.filter((p) => p.status === ProgressStatus.COMPLETED)
        .length,
      inProgress: progress.filter(
        (p) => p.status === ProgressStatus.IN_PROGRESS,
      ).length,
      pending: progress.filter((p) => p.status === ProgressStatus.PENDING)
        .length,
      pendingInvitations,
      items: progress,
    };
  },
);

/**
 * Informe de las preguntas de escala de un curso: distribución de respuestas
 * por nivel. Se reporta aparte porque no puntúa ni afecta la aprobación.
 */
export const getLikertReport = cache(
  async (courseId: string, institutionId: string) => {
    const questions = await prisma.question.findMany({
      where: {
        type: QuestionType.LIKERT,
        evaluation: {
          OR: [
            { course: { id: courseId, institutionId } },
            { lesson: { courseId, course: { institutionId } } },
          ],
        },
      },
      orderBy: { orderIndex: "asc" },
      select: {
        id: true,
        prompt: true,
        evaluationId: true,
        evaluation: { select: { title: true } },
      },
    });

    if (questions.length === 0) return [];

    const submissions = await prisma.evaluationSubmission.findMany({
      where: { evaluationId: { in: questions.map((q) => q.evaluationId) } },
      select: { answers: true },
    });

    // Conteo por pregunta y nivel de la escala.
    const counts = new Map<string, Map<string, number>>();
    for (const submission of submissions) {
      if (!Array.isArray(submission.answers)) continue;
      for (const entry of submission.answers) {
        if (!entry || typeof entry !== "object") continue;
        const record = entry as Record<string, unknown>;
        const questionId = String(record.questionId ?? "");
        const answer = String(record.answer ?? "");
        if (!questionId || !answer) continue;

        const perQuestion = counts.get(questionId) ?? new Map<string, number>();
        perQuestion.set(answer, (perQuestion.get(answer) ?? 0) + 1);
        counts.set(questionId, perQuestion);
      }
    }

    return questions.map((question) => {
      const perQuestion = counts.get(question.id) ?? new Map<string, number>();
      const distribution = LIKERT_SCALE.map((level) => ({
        value: level.value,
        label: level.label,
        short: level.short,
        count: perQuestion.get(level.value) ?? 0,
      }));
      const total = distribution.reduce((sum, level) => sum + level.count, 0);
      const average =
        total > 0
          ? distribution.reduce(
              (sum, level) => sum + Number(level.value) * level.count,
              0,
            ) / total
          : null;

      return {
        id: question.id,
        prompt: question.prompt,
        evaluationTitle: question.evaluation.title,
        distribution,
        total,
        average,
      };
    });
  },
);

/** Entregas con preguntas abiertas esperando corrección. */
export const getPendingReviews = cache(async (institutionId: string) =>
  prisma.evaluationSubmission.findMany({
    where: {
      status: SubmissionStatus.PENDING_REVIEW,
      user: { institutionId },
    },
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          rut: true,
          position: { select: { name: true } },
        },
      },
      evaluation: {
        include: {
          questions: { orderBy: { orderIndex: "asc" } },
          course: { select: { title: true } },
          lesson: { select: { title: true, course: { select: { title: true } } } },
        },
      },
    },
  }),
);
