import "server-only";

import { cache } from "react";
import { ProgressStatus, QuestionType, SubmissionStatus } from "@prisma/client";
import { LIKERT_SCALE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { STAFF_ROLES } from "@/lib/auth/rbac";

/**
 * KPIs y monitoreo en tiempo real para RRHH.
 * - `courseId`: inducción de referencia para "pendientes" (la "Inducción activa");
 *   si no se indica, se usa la última publicada.
 * - `recentLimit`: cuántos movimientos recientes traer.
 */
export const getAdminDashboard = cache(async (
  institutionId: string,
  options: { courseId?: string | null; recentLimit?: number } = {},
) => {
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
        archivedPeriod: 0, // sólo el período vigente
      },
    }),
    prisma.courseProgress.findMany({
      where: { course: { institutionId } },
      orderBy: { updatedAt: "desc" },
      take: options.recentLimit ?? 10,
      include: {
        user: {
          select: {
            name: true,
            rut: true,
            position: { select: { name: true } },
            area: { select: { name: true } },
          },
        },
        course: { select: { title: true } },
      },
    }),
    prisma.course.findFirst({
      where: {
        institutionId,
        isPublished: true,
        ...(options.courseId ? { id: options.courseId } : {}),
      },
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
        role: { in: STAFF_ROLES },
        NOT: {
          courseProgress: {
            some: {
              status: ProgressStatus.COMPLETED,
              ...(latestCourse ? { courseId: latestCourse.id } : {}),
            },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: {
        institutionId,
        isActive: true,
        role: { in: STAFF_ROLES },
        NOT: {
          courseProgress: {
            some: {
              status: ProgressStatus.COMPLETED,
              ...(latestCourse ? { courseId: latestCourse.id } : {}),
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
      where: { evaluationId: { in: questions.map((q) => q.evaluationId) }, archivedPeriod: 0 },
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
      archivedPeriod: 0, // sólo el período vigente
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

export const COMPLIANCE_PAGE_SIZE = 10;

export type ComplianceTab = "pendientes" | "actividad";
/** NONE = sin asignar (sólo en pendientes). */
export type ComplianceStatusFilter = "ALL" | "NONE" | ProgressStatus;

export interface ComplianceQuery {
  tab: ComplianceTab;
  /** id de área, "none" = sin área, "" = todas. */
  areaId: string;
  status: ComplianceStatusFilter;
  page: number;
}

/**
 * Tabla "Inducciones y Cumplimiento" del Inicio, paginada en la base de datos
 * (10 por página) con filtros de área y estado aplicados en la consulta.
 */
export async function getComplianceTable(
  institutionId: string,
  courseId: string | null,
  query: ComplianceQuery,
) {
  const skip = (Math.max(1, query.page) - 1) * COMPLIANCE_PAGE_SIZE;
  const areaWhere =
    query.areaId === "none" ? { areaId: null } : query.areaId ? { areaId: query.areaId } : {};

  // Pendientes: funcionarios activos que NO completaron la inducción de referencia.
  const pendingWhere = {
    institutionId,
    isActive: true,
    role: { in: STAFF_ROLES },
    ...areaWhere,
    NOT: {
      courseProgress: {
        some: { status: ProgressStatus.COMPLETED, ...(courseId ? { courseId } : {}) },
      },
    },
    ...(query.status === "NONE"
      ? { courseProgress: { none: courseId ? { courseId } : {} } }
      : query.status === "PENDING" || query.status === "IN_PROGRESS"
        ? { courseProgress: { some: { status: query.status, ...(courseId ? { courseId } : {}) } } }
        : {}),
  };

  // Movimientos: avance más reciente del colegio.
  const recentWhere = {
    course: { institutionId },
    ...(query.areaId === "none"
      ? { user: { areaId: null } }
      : query.areaId
        ? { user: { areaId: query.areaId } }
        : {}),
    ...(query.status !== "ALL" && query.status !== "NONE" ? { status: query.status } : {}),
  };

  const [areas, pendingTotal, recentTotal] = await Promise.all([
    prisma.area.findMany({
      where: { institutionId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.count({ where: pendingWhere }),
    prisma.courseProgress.count({ where: recentWhere }),
  ]);

  const [pending, recent] = await Promise.all([
    query.tab === "pendientes"
      ? prisma.user.findMany({
          where: pendingWhere,
          orderBy: { name: "asc" },
          skip,
          take: COMPLIANCE_PAGE_SIZE,
          select: {
            id: true,
            name: true,
            rut: true,
            email: true,
            position: { select: { name: true } },
            area: { select: { name: true } },
            courseProgress: {
              where: { courseId: courseId ?? "" },
              select: { status: true },
            },
          },
        })
      : Promise.resolve([]),
    query.tab === "actividad"
      ? prisma.courseProgress.findMany({
          where: recentWhere,
          orderBy: { updatedAt: "desc" },
          skip,
          take: COMPLIANCE_PAGE_SIZE,
          select: {
            id: true,
            status: true,
            updatedAt: true,
            course: { select: { title: true } },
            user: {
              select: {
                name: true,
                rut: true,
                position: { select: { name: true } },
                area: { select: { name: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  return {
    areas,
    pendingTotal,
    recentTotal,
    pending: pending.map((u) => ({
      id: u.id,
      name: u.name,
      rut: u.rut,
      email: u.email,
      positionName: u.position?.name ?? null,
      areaName: u.area?.name ?? null,
      status: u.courseProgress[0]?.status ?? null,
    })),
    recent: recent.map((r) => ({
      id: r.id,
      name: r.user.name,
      rut: r.user.rut,
      positionName: r.user.position?.name ?? null,
      areaName: r.user.area?.name ?? null,
      courseTitle: r.course.title,
      status: r.status,
      updatedAt: r.updatedAt,
    })),
  };
}
