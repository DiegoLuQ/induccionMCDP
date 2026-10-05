import { QuestionType } from "@prisma/client";
import { z } from "zod";
import { LIKERT_SCALE } from "@/lib/constants";
import { cuidSchema } from "./common";

/** URL opcional (imagen). Acepta cadena vacía como "sin imagen". */
const imageUrlSchema = z
  .string()
  .trim()
  .url("URL de imagen inválida")
  .max(512)
  .optional()
  .or(z.literal(""));

/**
 * Alternativa de una pregunta de selección. El `id` es estable dentro de la
 * pregunta y es lo que se guarda como respuesta correcta y como respuesta del
 * funcionario: así renombrar el texto de una opción no rompe la corrección.
 */
export const questionOptionSchema = z.object({
  id: z.string().trim().min(1).max(40),
  text: z.string().trim().max(500),
  imageUrl: imageUrlSchema,
});

export type QuestionOption = z.infer<typeof questionOptionSchema>;

/** Normaliza el JSON de `options` que viene de la BD. */
export function parseQuestionOptions(raw: unknown): QuestionOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry, index) => {
    // Formato antiguo: string[]. Se tolera por si queda algún registro.
    if (typeof entry === "string") {
      return [{ id: `opt-${index}`, text: entry, imageUrl: "" }];
    }
    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      return [
        {
          id: String(record.id ?? `opt-${index}`),
          text: String(record.text ?? ""),
          imageUrl:
            typeof record.imageUrl === "string" ? record.imageUrl : "",
        },
      ];
    }
    return [];
  });
}

const LIKERT_VALUES = LIKERT_SCALE.map((level) => level.value);

export const questionSchema = z
  .object({
    id: cuidSchema.optional(),
    type: z.nativeEnum(QuestionType),
    prompt: z.string().trim().min(5, "El enunciado es muy corto").max(2000),
    imageUrl: imageUrlSchema,
    options: z.array(questionOptionSchema).default([]),
    correctAnswer: z.string().trim().max(500).optional().or(z.literal("")),
    points: z.coerce.number().int().min(0).max(100).default(1),
    orderIndex: z.coerce.number().int().min(0),
  })
  .superRefine((question, ctx) => {
    if (question.type === QuestionType.MULTIPLE_CHOICE) {
      if (question.options.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options"],
          message: "Una pregunta de alternativas requiere al menos 2 opciones",
        });
      }
      // Una alternativa vale si tiene texto O imagen.
      const vacias = question.options.filter(
        (option) => !option.text && !option.imageUrl,
      );
      if (vacias.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options"],
          message: "Cada alternativa necesita texto o imagen",
        });
      }
      if (!question.correctAnswer) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correctAnswer"],
          message: "Debes marcar la alternativa correcta",
        });
      } else if (
        !question.options.some((option) => option.id === question.correctAnswer)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correctAnswer"],
          message: "La respuesta correcta debe ser una de las alternativas",
        });
      }
    }

    if (
      question.type !== QuestionType.MULTIPLE_CHOICE &&
      question.options.length > 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Este tipo de pregunta no lleva alternativas",
      });
    }
  });

export const evaluationSchema = z
  .object({
    courseId: cuidSchema.optional(),
    lessonId: cuidSchema.optional(),
    title: z.string().trim().min(3, "Título requerido").max(200),
    passingScore: z.coerce.number().int().min(1).max(100).default(80),
    maxAttempts: z.coerce.number().int().min(1).max(10).default(3),
    questions: z.array(questionSchema).min(1, "Agrega al menos una pregunta"),
  })
  .refine(
    (data) => Boolean(data.courseId) !== Boolean(data.lessonId),
    "La evaluación debe pertenecer a un curso O a una lección, no a ambos",
  );

export const updateEvaluationSchema = z.object({
  id: cuidSchema,
  title: z.string().trim().min(3).max(200).optional(),
  passingScore: z.coerce.number().int().min(1).max(100).optional(),
  maxAttempts: z.coerce.number().int().min(1).max(10).optional(),
  questions: z.array(questionSchema).min(1).optional(),
});

// ---------------------------------------------------------------------------
// EDITOR DE RRHH
// ---------------------------------------------------------------------------

const editorOptionSchema = z.object({
  text: z.string().trim().max(500),
  imageUrl: imageUrlSchema,
});

/**
 * Esquema del editor. La alternativa correcta se identifica por índice: al
 * guardar se traduce al id de la opción, de modo que reordenar o renombrar en
 * el formulario no deje huérfana la respuesta correcta.
 */
export const editorQuestionSchema = z
  .object({
    type: z.nativeEnum(QuestionType),
    prompt: z.string().trim().min(5, "El enunciado es muy corto").max(2000),
    imageUrl: imageUrlSchema,
    options: z.array(editorOptionSchema).default([]),
    correctIndex: z.coerce.number().int().min(-1).default(-1),
    points: z.coerce.number().int().min(0).max(100).default(1),
  })
  .superRefine((question, ctx) => {
    if (question.type !== QuestionType.MULTIPLE_CHOICE) return;

    const llenas = question.options.filter(
      (option) => option.text.trim() || option.imageUrl,
    );
    if (llenas.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Escribe al menos 2 alternativas (texto o imagen)",
      });
    }

    const textos = llenas.map((option) => option.text.trim()).filter(Boolean);
    if (new Set(textos).size !== textos.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Las alternativas no pueden repetirse",
      });
    }

    const correcta = question.options[question.correctIndex];
    if (!correcta || (!correcta.text.trim() && !correcta.imageUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correctIndex"],
        message: "Marca cuál es la alternativa correcta",
      });
    }
  });

export const evaluationEditorSchema = z.object({
  title: z.string().trim().min(3, "Título requerido").max(200),
  passingScore: z.coerce.number().int().min(1).max(100).default(80),
  maxAttempts: z.coerce.number().int().min(1).max(10).default(3),
  questions: z.array(editorQuestionSchema).min(1, "Agrega al menos una pregunta"),
});

export type EvaluationEditorInput = z.infer<typeof evaluationEditorSchema>;

/** Convierte lo del editor al payload que espera `upsertEvaluationAction`. */
export function toEvaluationPayload(
  values: EvaluationEditorInput,
  target: { courseId?: string; lessonId?: string },
) {
  return {
    ...target,
    title: values.title,
    passingScore: values.passingScore,
    maxAttempts: values.maxAttempts,
    questions: values.questions.map((question, index) => {
      const isChoice = question.type === QuestionType.MULTIPLE_CHOICE;

      // El id se asigna por posición en el array original, ANTES de descartar
      // las alternativas vacías, para que `correctIndex` siga apuntando bien.
      const options = isChoice
        ? question.options
            .map((option, optionIndex) => ({
              id: `opt-${optionIndex}`,
              text: option.text.trim(),
              imageUrl: option.imageUrl ?? "",
            }))
            .filter((option) => option.text || option.imageUrl)
        : [];

      const correctId = isChoice ? `opt-${question.correctIndex}` : "";
      const correctAnswer = options.some((option) => option.id === correctId)
        ? correctId
        : "";

      return {
        type: question.type,
        prompt: question.prompt,
        imageUrl: question.imageUrl ?? "",
        options,
        correctAnswer,
        // Las preguntas LIKERT no puntúan.
        points: question.type === QuestionType.LIKERT ? 0 : question.points,
        orderIndex: index,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// ENVÍO Y CORRECCIÓN
// ---------------------------------------------------------------------------

/** Respuestas enviadas por el funcionario. */
export const submitEvaluationSchema = z.object({
  evaluationId: cuidSchema,
  answers: z
    .array(
      z.object({
        questionId: cuidSchema,
        answer: z.string().trim().min(1, "Debes responder esta pregunta").max(5000),
      }),
    )
    .min(1, "No hay respuestas para enviar"),
});

/** Valores admitidos por una pregunta de escala. */
export function isValidLikertValue(value: string): boolean {
  return LIKERT_VALUES.includes(value as (typeof LIKERT_VALUES)[number]);
}

/** Corrección manual de preguntas abiertas por RRHH. */
export const reviewSubmissionSchema = z.object({
  submissionId: cuidSchema,
  approved: z.boolean(),
  reviewNotes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type QuestionInput = z.infer<typeof questionSchema>;
export type EvaluationInput = z.infer<typeof evaluationSchema>;
export type SubmitEvaluationInput = z.infer<typeof submitEvaluationSchema>;
export type ReviewSubmissionInput = z.infer<typeof reviewSubmissionSchema>;
