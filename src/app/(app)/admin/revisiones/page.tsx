import type { Metadata } from "next";
import { Role } from "@prisma/client";
import { ClipboardCheck } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { SIN_ASIGNAR } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import { formatRut } from "@/lib/rut";
import { getPendingReviews } from "@/server/queries/dashboard";
import { PageHeader } from "@/components/shared/page-header";
import { ReviewPanel, type ReviewItem } from "@/components/admin/review-panel";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Revisión de respuestas" };

interface StoredAnswer {
  questionId: string;
  answer: string;
}

function parseAnswers(raw: unknown): StoredAnswer[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (
      entry &&
      typeof entry === "object" &&
      "questionId" in entry &&
      "answer" in entry
    ) {
      const record = entry as Record<string, unknown>;
      return [
        {
          questionId: String(record.questionId),
          answer: String(record.answer ?? ""),
        },
      ];
    }
    return [];
  });
}

export default async function ReviewsPage() {
  const session = await requireRole(Role.SUPER_ADMIN, Role.ADMIN_RRHH);
  const submissions = await getPendingReviews(session.institutionId);

  const items: ReviewItem[] = submissions.map((submission) => ({
    submissionId: submission.id,
    userName: submission.user.name,
    userRut: formatRut(submission.user.rut),
    positionLabel: submission.user.position?.name ?? SIN_ASIGNAR,
    contextTitle:
      submission.evaluation.course?.title ??
      submission.evaluation.lesson?.course.title ??
      "Evaluación",
    score: submission.score,
    submittedAt: formatDateTime(submission.createdAt),
    questions: submission.evaluation.questions.map((question) => ({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
    })),
    answers: parseAnswers(submission.answers),
  }));

  return (
    <>
      <PageHeader
        title="Revisión de respuestas"
        description="Corrige las preguntas abiertas que quedaron pendientes."
      />

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardCheck className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-medium">Nada pendiente</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Todas las entregas con preguntas abiertas están corregidas.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <ReviewPanel key={item.submissionId} item={item} />
          ))}
        </div>
      )}
    </>
  );
}
