"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QuestionType, type QuestionType as QuestionTypeEnum } from "@prisma/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { AlertCircle, CheckCircle2, Lock, XCircle } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { LIKERT_SCALE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { parseQuestionOptions } from "@/lib/validations/evaluation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { submitEvaluationAction } from "@/server/actions/evaluation-actions";

export interface EvaluationQuestion {
  id: string;
  type: QuestionTypeEnum;
  prompt: string;
  imageUrl: string | null;
  options: unknown;
  points: number;
  orderIndex: number;
}

export interface EvaluationViewModel {
  id: string;
  title: string;
  passingScore: number;
  maxAttempts: number;
  attemptsUsed: number;
  isPassed: boolean;
  questions: EvaluationQuestion[];
}

interface EvaluationFormProps {
  evaluation: EvaluationViewModel;
  isUnlocked: boolean;
  lockedMessage?: string;
  onPassed?: (data?: { courseCompleted?: boolean }) => void;
}


export function EvaluationForm({
  evaluation,
  isUnlocked,
  lockedMessage = "Termina de ver el video para habilitar las preguntas de repaso.",
  onPassed,
}: EvaluationFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    score: number;
    passed: boolean;
    pendingReview: boolean;
    attemptsLeft: number;
  } | null>(null);

  // Esquema dinámico: toda pregunta es obligatoria.
  const schema = useMemo(() => {
    const shape: Record<string, z.ZodString> = {};
    for (const question of evaluation.questions) {
      const isOpen = question.type === QuestionType.OPEN_TEXT;
      const isLikert = question.type === QuestionType.LIKERT;
      shape[question.id] = z
        .string()
        .trim()
        .min(
          isOpen ? 10 : 1,
          isOpen
            ? "Desarrolla tu respuesta (mínimo 10 caracteres)"
            : isLikert
              ? "Selecciona un nivel de la escala"
              : "Selecciona una alternativa",
        );
    }
    return z.object(shape);
  }, [evaluation.questions]);

  type FormValues = Record<string, string>;

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: Object.fromEntries(
      evaluation.questions.map((question) => [question.id, ""]),
    ),
  });

  const attemptsLeft = Math.max(
    0,
    evaluation.maxAttempts - evaluation.attemptsUsed,
  );

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const response = await submitEvaluationAction({
        evaluationId: evaluation.id,
        answers: Object.entries(values).map(([questionId, answer]) => ({
          questionId,
          answer,
        })),
      });

      if (!response.success) {
        toast.error(response.message);
        return;
      }

      const data = response.data!;
      const passed = data.status === "PASSED";
      const pendingReview = data.status === "PENDING_REVIEW";

      setResult({
        score: data.score,
        passed,
        pendingReview,
        attemptsLeft: data.attemptsLeft,
      });

      if (passed) {
        toast.success("¡Preguntas completadas con éxito!");
        onPassed?.({ courseCompleted: data.courseCompleted });
      } else if (pendingReview) {
        toast.info("Respuestas enviadas. Quedan en revisión.");
      } else {
        toast.error("No has superado las preguntas de repaso. Puedes intentarlo nuevamente.");
      }

      router.refresh();
    });
  }

  if (evaluation.isPassed) {
    return (
      <Card className="border-success/40">
        <CardContent className="flex items-center gap-3 pt-6">
          <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />
          <div>
            <p className="text-sm font-medium">Preguntas completadas</p>
            <p className="text-xs text-muted-foreground">
              Ya cumpliste con estas preguntas; tu resultado quedó registrado.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isUnlocked) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 pt-6">
          <Lock className="h-5 w-5 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">{lockedMessage}</p>
        </CardContent>
      </Card>
    );
  }

  if (attemptsLeft === 0) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex items-center gap-3 pt-6">
          <XCircle className="h-5 w-5 text-destructive" aria-hidden />
          <div>
            <p className="text-sm font-medium">Sin intentos disponibles</p>
            <p className="text-xs text-muted-foreground">
              Contacta a RRHH de tu colegio para habilitar un nuevo intento.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>{evaluation.title}</CardTitle>
          </div>
          <Badge variant="secondary">
            {attemptsLeft} intento(s) disponible(s)
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        {result && (
          <div
            className={
              result.passed
                ? "mb-5 flex items-start gap-3 rounded-md border border-success/40 bg-success/10 p-4"
                : result.pendingReview
                  ? "mb-5 flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 p-4"
                  : "mb-5 flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4"
            }
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="text-sm">
              <p className="font-medium">
                {result.passed
                  ? "Aprobado"
                  : result.pendingReview
                    ? "Enviado: en revisión"
                    : "No aprobado"}
              </p>
              <p className="text-muted-foreground">
                {result.pendingReview
                  ? "Tus preguntas abiertas serán corregidas por RRHH; te avisaremos del resultado."
                  : result.passed
                    ? "Tu resultado quedó registrado como evidencia."
                    : `Te quedan ${result.attemptsLeft} intento(s).`}
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8" noValidate>
          {evaluation.questions.map((question, index) => {
            const options = parseQuestionOptions(question.options);
            const error = errors[question.id]?.message as string | undefined;

            return (
              <fieldset key={question.id} className="space-y-3">
                <legend className="text-sm font-medium">
                  <span className="mr-2 text-muted-foreground">
                    {index + 1}.
                  </span>
                  {question.prompt}
                </legend>

                {question.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={question.imageUrl}
                    alt={`Imagen de apoyo de la pregunta ${index + 1}`}
                    className="max-h-72 rounded-md border object-contain"
                  />
                )}

                {question.type === QuestionType.MULTIPLE_CHOICE ? (
                  <Controller
                    control={control}
                    name={question.id}
                    render={({ field }) => (
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="gap-2"
                      >
                        {options.map((option) => {
                          const id = `${question.id}-${option.id}`;
                          return (
                            <div
                              key={option.id}
                              className="flex items-center gap-3 rounded-md border p-3 transition-colors hover:bg-accent"
                            >
                              {/* El valor enviado es el id, no el texto. */}
                              <RadioGroupItem value={option.id} id={id} />
                              <Label
                                htmlFor={id}
                                className="flex flex-1 cursor-pointer items-center gap-3 font-normal"
                              >
                                {option.imageUrl && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={option.imageUrl}
                                    alt=""
                                    className="h-20 w-20 rounded border object-cover"
                                  />
                                )}
                                {option.text && <span>{option.text}</span>}
                              </Label>
                            </div>
                          );
                        })}
                      </RadioGroup>
                    )}
                  />
                ) : question.type === QuestionType.LIKERT ? (
                  <Controller
                    control={control}
                    name={question.id}
                    render={({ field }) => (
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="gap-2 sm:grid-cols-5"
                      >
                        {LIKERT_SCALE.map((level) => {
                          const id = `${question.id}-${level.value}`;
                          const selected = field.value === level.value;
                          return (
                            <Label
                              key={level.value}
                              htmlFor={id}
                              className={cn(
                                "flex cursor-pointer flex-col items-center gap-2 rounded-md border p-3 text-center text-xs font-normal transition-colors hover:bg-accent",
                                selected && "border-primary bg-accent",
                              )}
                            >
                              <RadioGroupItem value={level.value} id={id} />
                              <span>{level.label}</span>
                            </Label>
                          );
                        })}
                      </RadioGroup>
                    )}
                  />
                ) : (
                  <Controller
                    control={control}
                    name={question.id}
                    render={({ field }) => (
                      <Textarea
                        {...field}
                        placeholder="Escribe tu respuesta con tus propias palabras…"
                        aria-invalid={Boolean(error)}
                      />
                    )}
                  />
                )}

                {question.type === QuestionType.OPEN_TEXT && (
                  <p className="text-xs text-muted-foreground">
                    Pregunta abierta: será revisada por RRHH.
                  </p>
                )}

                {question.type === QuestionType.LIKERT && (
                  <p className="text-xs text-muted-foreground">
                    Escala de opinión: no hay respuesta correcta ni afecta tu
                    aprobación.
                  </p>
                )}

                {error && <p className="text-xs text-destructive">{error}</p>}
              </fieldset>
            );
          })}

          <Button type="submit" isLoading={isPending} className="w-full sm:w-auto">
            Enviar respuestas
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
