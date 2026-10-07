"use server";

import { revalidatePath } from "next/cache";
import { Prisma, ProgressStatus, SubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/rbac";
import {
  reviewSubmissionSchema,
  submitEvaluationSchema,
} from "@/lib/validations/evaluation";
import {
  failure,
  fromZodError,
  success,
  type ActionResult,
} from "@/lib/validations/common";
import { gradeSubmission } from "@/server/services/grading-service";
import { recalculateCourseProgress } from "@/server/services/progress-service";

export interface SubmissionResultData {
  submissionId: string;
  score: number;
  status: SubmissionStatus;
  passingScore: number;
  hasOpenQuestions: boolean;
  attemptsLeft: number;
  courseCompleted: boolean;
}

/** Envío de una evaluación por parte del funcionario. */
export async function submitEvaluationAction(
  input: unknown,
): Promise<ActionResult<SubmissionResultData>> {
  const session = await getSession();
  if (!session) return failure("Sesión expirada.");

  const parsed = submitEvaluationSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const evaluation = await prisma.evaluation.findFirst({
    where: {
      id: parsed.data.evaluationId,
      OR: [
        { course: { institutionId: session.institutionId } },
        { lesson: { course: { institutionId: session.institutionId } } },
      ],
    },
    include: {
      questions: { orderBy: { orderIndex: "asc" } },
      lesson: { select: { courseId: true } },
    },
  });

  if (!evaluation) return failure("Evaluación no encontrada.");

  const courseId = evaluation.courseId ?? evaluation.lesson?.courseId;
  if (!courseId) return failure("La evaluación no está asociada a un curso.");

  const previousAttempts = await prisma.evaluationSubmission.findMany({
    // Sólo intentos del período vigente (los archivados no cuentan).
    where: { userId: session.sub, evaluationId: evaluation.id, archivedPeriod: 0 },
    orderBy: { attempt: "desc" },
    select: { attempt: true, status: true },
  });

  if (previousAttempts.some((a) => a.status === SubmissionStatus.PASSED))
    return failure("Ya aprobaste esta evaluación.");

  if (previousAttempts.length >= evaluation.maxAttempts)
    return failure(
      "Agotaste los intentos disponibles. Contacta a RRHH de tu colegio.",
    );

  // Todas las preguntas deben venir respondidas.
  const answeredIds = new Set(parsed.data.answers.map((a) => a.questionId));
  const missing = evaluation.questions.filter((q) => !answeredIds.has(q.id));
  if (missing.length > 0)
    return failure(`Faltan ${missing.length} pregunta(s) por responder.`);

  const grading = gradeSubmission(
    evaluation.questions,
    parsed.data.answers,
    evaluation.passingScore,
  );

  const attempt = (previousAttempts[0]?.attempt ?? 0) + 1;

  const submission = await prisma.evaluationSubmission.create({
    data: {
      userId: session.sub,
      evaluationId: evaluation.id,
      score: grading.score,
      // Las interfaces no satisfacen el índice de firma de InputJsonValue,
      // aunque su forma sea JSON válido: se convierte explícitamente.
      answers: grading.answers as unknown as Prisma.InputJsonArray,
      status: grading.status,
      attempt,
    },
  });

  const { status: courseStatus } = await recalculateCourseProgress(
    session.sub,
    courseId,
  );

  revalidatePath(`/mis-inducciones/${courseId}`);
  revalidatePath("/mis-inducciones");
  revalidatePath("/admin");

  return success({
    submissionId: submission.id,
    score: grading.score,
    status: grading.status,
    passingScore: evaluation.passingScore,
    hasOpenQuestions: grading.hasOpenQuestions,
    attemptsLeft: Math.max(0, evaluation.maxAttempts - attempt),
    courseCompleted: courseStatus === ProgressStatus.COMPLETED,
  });
}

/** Corrección manual de preguntas abiertas (RRHH / Directivo). */
export async function reviewSubmissionAction(
  input: unknown,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return failure("Sesión expirada.");
  if (!isAdminRole(session.role)) return failure("Sin permisos.");

  const parsed = reviewSubmissionSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const submission = await prisma.evaluationSubmission.findFirst({
    where: {
      id: parsed.data.submissionId,
      user: { institutionId: session.institutionId },
    },
    include: {
      evaluation: {
        include: { lesson: { select: { courseId: true } } },
      },
    },
  });

  if (!submission) return failure("Entrega no encontrada.");
  if (submission.status !== SubmissionStatus.PENDING_REVIEW)
    return failure("Esta entrega ya fue corregida.");

  await prisma.evaluationSubmission.update({
    where: { id: submission.id },
    data: {
      status: parsed.data.approved
        ? SubmissionStatus.PASSED
        : SubmissionStatus.FAILED,
      reviewedById: session.sub,
      reviewedAt: new Date(),
      reviewNotes: parsed.data.reviewNotes || null,
    },
  });

  const courseId =
    submission.evaluation.courseId ?? submission.evaluation.lesson?.courseId;
  if (courseId) {
    await recalculateCourseProgress(submission.userId, courseId);
  }

  revalidatePath("/admin/revisiones");
  revalidatePath("/admin");

  return success(
    undefined,
    parsed.data.approved ? "Entrega aprobada." : "Entrega reprobada.",
  );
}
