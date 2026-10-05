"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QuestionType } from "@prisma/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import {
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Image as ImageIcon,
  ListChecks,
  MessageSquareText,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LIKERT_SCALE } from "@/lib/constants";
import {
  evaluationEditorSchema,
  parseQuestionOptions,
  toEvaluationPayload,
  type EvaluationEditorInput,
} from "@/lib/validations/evaluation";
import {
  deleteEvaluationAction,
  upsertEvaluationAction,
} from "@/server/actions/course-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

export interface ExistingQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  imageUrl: string | null;
  options: unknown;
  correctAnswer: string | null;
  points: number;
}

export interface ExistingEvaluation {
  id: string;
  title: string;
  passingScore: number;
  maxAttempts: number;
  questions: ExistingQuestion[];
  submissionCount: number;
}

interface EvaluationEditorProps {
  /** Uno de los dos: evaluación final del curso o de una cápsula. */
  target: { courseId?: string; lessonId?: string };
  label: string;
  hint: string;
  existing: ExistingEvaluation | null;
}

const emptyOption = () => ({ text: "", imageUrl: "" });

const emptyQuestion = (type: QuestionType) => ({
  type,
  prompt: "",
  imageUrl: "",
  options:
    type === QuestionType.MULTIPLE_CHOICE ? [emptyOption(), emptyOption()] : [],
  correctIndex: -1,
  points: type === QuestionType.LIKERT ? 0 : 1,
});

function toDefaults(
  existing: ExistingEvaluation | null,
  label: string,
): EvaluationEditorInput {
  if (!existing) {
    return {
      title: label,
      passingScore: 80,
      maxAttempts: 3,
      questions: [emptyQuestion(QuestionType.MULTIPLE_CHOICE)],
    };
  }

  return {
    title: existing.title,
    passingScore: existing.passingScore,
    maxAttempts: existing.maxAttempts,
    questions: existing.questions.map((question) => {
      const parsed = parseQuestionOptions(question.options);
      const options =
        parsed.length > 0
          ? parsed.map((option) => ({
              text: option.text,
              imageUrl: option.imageUrl ?? "",
            }))
          : [emptyOption(), emptyOption()];

      return {
        type: question.type,
        prompt: question.prompt,
        imageUrl: question.imageUrl ?? "",
        options,
        correctIndex: question.correctAnswer
          ? parsed.findIndex((option) => option.id === question.correctAnswer)
          : -1,
        points: question.points,
      };
    }),
  };
}

export function EvaluationEditor({
  target,
  label,
  hint,
  existing,
}: EvaluationEditorProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<EvaluationEditorInput>({
    resolver: zodResolver(evaluationEditorSchema),
    defaultValues: toDefaults(existing, label),
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "questions",
  });

  const questions = watch("questions");
  const locked = (existing?.submissionCount ?? 0) > 0;

  function onSubmit(values: EvaluationEditorInput) {
    startTransition(async () => {
      const result = await upsertEvaluationAction(
        toEvaluationPayload(values, target),
      );
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message ?? "Evaluación guardada.");
      setIsOpen(false);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!existing) return;
    startTransition(async () => {
      const result = await deleteEvaluationAction(existing.id);
      if (result.success) {
        toast.success(result.message ?? "Evaluación eliminada.");
        setIsOpen(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  // ---------------------------------------------------------------- resumen
  if (!isOpen) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium">
              {label}
              {existing ? (
                <Badge variant="success">
                  {existing.questions.length} pregunta(s)
                </Badge>
              ) : (
                <Badge variant="secondary">Sin evaluación</Badge>
              )}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {existing
                ? `Aprobación ${existing.passingScore}% · ${existing.maxAttempts} intento(s)` +
                  (locked
                    ? ` · ${existing.submissionCount} entrega(s) registradas`
                    : "")
                : hint}
            </p>
          </div>
          <Button
            variant={existing ? "outline" : "default"}
            onClick={() => {
              reset(toDefaults(existing, label));
              setIsOpen(true);
            }}
          >
            {existing ? "Editar" : "Crear evaluación"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ---------------------------------------------------------------- editor
  return (
    <Card className="border-primary/40">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{label}</CardTitle>
            <CardDescription>{hint}</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
            aria-label="Cerrar editor"
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {locked && (
          <div className="mb-5 flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              Esta evaluación ya tiene{" "}
              <strong>{existing?.submissionCount} entrega(s)</strong>. Si cambias
              las preguntas, las entregas anteriores conservan las respuestas
              que se dieron, pero dejarán de coincidir con la pauta actual.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-3">
              <Label htmlFor={`title-${label}`}>Título</Label>
              <Input id={`title-${label}`} {...register("title")} />
              {errors.title && (
                <p className="text-xs text-destructive">
                  {errors.title.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`score-${label}`}>Puntaje de aprobación (%)</Label>
              <Input
                id={`score-${label}`}
                type="number"
                min={1}
                max={100}
                {...register("passingScore")}
              />
              {errors.passingScore && (
                <p className="text-xs text-destructive">
                  {errors.passingScore.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`attempts-${label}`}>Intentos permitidos</Label>
              <Input
                id={`attempts-${label}`}
                type="number"
                min={1}
                max={10}
                {...register("maxAttempts")}
              />
              {errors.maxAttempts && (
                <p className="text-xs text-destructive">
                  {errors.maxAttempts.message}
                </p>
              )}
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Preguntas ({fields.length})</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    append(emptyQuestion(QuestionType.MULTIPLE_CHOICE))
                  }
                >
                  <ListChecks className="h-4 w-4" aria-hidden />
                  Alternativas
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append(emptyQuestion(QuestionType.OPEN_TEXT))}
                >
                  <MessageSquareText className="h-4 w-4" aria-hidden />
                  Pregunta abierta
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append(emptyQuestion(QuestionType.LIKERT))}
                >
                  <Gauge className="h-4 w-4" aria-hidden />
                  Escala de opinión
                </Button>
              </div>
            </div>

            {fields.map((field, index) => {
              const question = questions[index];
              if (!question) return null;
              const isChoice = question.type === QuestionType.MULTIPLE_CHOICE;
              const isLikert = question.type === QuestionType.LIKERT;

              return (
                <div key={field.id} className="space-y-3 rounded-md border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      variant={
                        isChoice ? "default" : isLikert ? "warning" : "secondary"
                      }
                    >
                      {isChoice
                        ? "Alternativas"
                        : isLikert
                          ? "Escala de opinión"
                          : "Pregunta abierta"}
                    </Badge>
                    <div className="flex items-center gap-2">
                      {/* La escala no puntúa: no se ofrece el campo. */}
                      {!isLikert && (
                        <>
                          <Label
                            htmlFor={`points-${label}-${index}`}
                            className="text-xs text-muted-foreground"
                          >
                            Puntaje
                          </Label>
                          <Input
                            id={`points-${label}-${index}`}
                            type="number"
                            min={1}
                            max={100}
                            className="h-8 w-16"
                            {...register(`questions.${index}.points`)}
                          />
                        </>
                      )}
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(index)}
                          aria-label={`Quitar pregunta ${index + 1}`}
                        >
                          <Trash2
                            className="h-4 w-4 text-destructive"
                            aria-hidden
                          />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label
                      htmlFor={`prompt-${label}-${index}`}
                      className="text-xs"
                    >
                      Enunciado
                    </Label>
                    <Textarea
                      id={`prompt-${label}-${index}`}
                      rows={2}
                      placeholder="¿Qué debe hacer un funcionario ante…?"
                      {...register(`questions.${index}.prompt`)}
                    />
                    {errors.questions?.[index]?.prompt && (
                      <p className="text-xs text-destructive">
                        {errors.questions[index]?.prompt?.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label
                      htmlFor={`image-${label}-${index}`}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                      Imagen del enunciado (opcional)
                    </Label>
                    <Input
                      id={`image-${label}-${index}`}
                      placeholder="https://…/senaletica.png"
                      {...register(`questions.${index}.imageUrl`)}
                    />
                    {errors.questions?.[index]?.imageUrl && (
                      <p className="text-xs text-destructive">
                        {errors.questions[index]?.imageUrl?.message}
                      </p>
                    )}
                    {question.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={question.imageUrl}
                        alt="Vista previa del enunciado"
                        className="mt-1 max-h-32 rounded-md border object-contain"
                      />
                    )}
                  </div>

                  {isChoice ? (
                    <div className="space-y-2">
                      <Label className="text-xs">
                        Alternativas (marca la correcta)
                      </Label>
                      {question.options.map((_, optionIndex) => {
                        const isCorrect = question.correctIndex === optionIndex;
                        return (
                          <div
                            key={optionIndex}
                            className="flex items-start gap-2"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setValue(
                                  `questions.${index}.correctIndex`,
                                  optionIndex,
                                )
                              }
                              aria-label={`Marcar alternativa ${optionIndex + 1} como correcta`}
                              aria-pressed={isCorrect}
                              className={cn(
                                "shrink-0 rounded-full border p-1 transition-colors",
                                isCorrect
                                  ? "border-success bg-success text-success-foreground"
                                  : "text-muted-foreground hover:bg-accent",
                              )}
                            >
                              <CheckCircle2 className="h-4 w-4" aria-hidden />
                            </button>

                            <div className="flex-1 space-y-1">
                              <Input
                                placeholder={`Alternativa ${optionIndex + 1}`}
                                {...register(
                                  `questions.${index}.options.${optionIndex}.text`,
                                )}
                              />
                              <div className="flex items-center gap-2">
                                <ImageIcon
                                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                  aria-hidden
                                />
                                <Input
                                  placeholder="URL de imagen (opcional)"
                                  className="h-8 text-xs"
                                  {...register(
                                    `questions.${index}.options.${optionIndex}.imageUrl`,
                                  )}
                                />
                                {question.options[optionIndex]?.imageUrl && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={question.options[optionIndex]?.imageUrl}
                                    alt=""
                                    className="h-8 w-8 shrink-0 rounded border object-cover"
                                  />
                                )}
                              </div>
                            </div>

                            {question.options.length > 2 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const next = question.options.filter(
                                    (_, i) => i !== optionIndex,
                                  );
                                  setValue(`questions.${index}.options`, next);
                                  // Reajusta el índice correcto tras eliminar.
                                  if (question.correctIndex === optionIndex) {
                                    setValue(
                                      `questions.${index}.correctIndex`,
                                      -1,
                                    );
                                  } else if (
                                    question.correctIndex > optionIndex
                                  ) {
                                    setValue(
                                      `questions.${index}.correctIndex`,
                                      question.correctIndex - 1,
                                    );
                                  }
                                }}
                                aria-label={`Quitar alternativa ${optionIndex + 1}`}
                              >
                                <X className="h-4 w-4" aria-hidden />
                              </Button>
                            )}
                          </div>
                        );
                      })}

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setValue(`questions.${index}.options`, [
                            ...question.options,
                            emptyOption(),
                          ])
                        }
                      >
                        <Plus className="h-4 w-4" aria-hidden />
                        Agregar alternativa
                      </Button>

                      {errors.questions?.[index]?.options && (
                        <p className="text-xs text-destructive">
                          {errors.questions[index]?.options?.message}
                        </p>
                      )}
                      {errors.questions?.[index]?.correctIndex && (
                        <p className="text-xs text-destructive">
                          {errors.questions[index]?.correctIndex?.message}
                        </p>
                      )}
                    </div>
                  ) : isLikert ? (
                    <div className="space-y-2 rounded-md bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">
                        El funcionario verá esta escala fija. No tiene respuesta
                        correcta ni puntaje: mide percepción y se informa aparte,
                        sin afectar la aprobación del curso.
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {LIKERT_SCALE.map((level) => (
                          <span
                            key={level.value}
                            className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground"
                          >
                            {level.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                      Las preguntas abiertas no se corrigen solas: la entrega
                      queda en <strong>revisión</strong> hasta que RRHH la
                      apruebe en «Revisión de respuestas».
                    </p>
                  )}
                </div>
              );
            })}

            {errors.questions?.message && (
              <p className="text-xs text-destructive">
                {errors.questions.message}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" isLoading={isPending}>
              Guardar evaluación
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsOpen(false)}
            >
              Cancelar
            </Button>
            {existing && !locked && (
              <Button
                type="button"
                variant="destructive"
                className="ml-auto"
                disabled={isPending}
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Eliminar
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
