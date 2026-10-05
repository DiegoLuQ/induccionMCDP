"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QuestionType } from "@prisma/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { reviewSubmissionAction } from "@/server/actions/evaluation-actions";

export interface ReviewQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
}

export interface ReviewItem {
  submissionId: string;
  userName: string;
  userRut: string;
  positionLabel: string;
  contextTitle: string;
  score: number;
  submittedAt: string;
  questions: ReviewQuestion[];
  answers: Array<{ questionId: string; answer: string }>;
}

export function ReviewPanel({ item }: { item: ReviewItem }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  const answerMap = new Map(item.answers.map((a) => [a.questionId, a.answer]));
  const openQuestions = item.questions.filter(
    (question) => question.type === QuestionType.OPEN_TEXT,
  );

  function decide(approved: boolean) {
    startTransition(async () => {
      const result = await reviewSubmissionAction({
        submissionId: item.submissionId,
        approved,
        reviewNotes: notes,
      });
      if (result.success) {
        toast.success(result.message ?? "Corrección registrada");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{item.userName}</CardTitle>
        <CardDescription>
          {item.userRut} · {item.positionLabel} · {item.contextTitle} · Enviado{" "}
          {item.submittedAt} · Parte objetiva: {item.score}%
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {openQuestions.map((question, index) => (
          <div key={question.id} className="space-y-1">
            <p className="text-sm font-medium">
              <span className="mr-2 text-muted-foreground">{index + 1}.</span>
              {question.prompt}
            </p>
            <p className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
              {answerMap.get(question.id) || "(sin respuesta)"}
            </p>
          </div>
        ))}

        <div className="space-y-2">
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Observaciones para el funcionario (opcional)"
            rows={3}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="success"
              disabled={isPending}
              onClick={() => decide(true)}
            >
              Aprobar
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => decide(false)}
            >
              Reprobar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
