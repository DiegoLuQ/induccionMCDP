import { VideoFormat } from "@prisma/client";
import { z } from "zod";
import { slugify } from "@/lib/utils";
import { cuidSchema } from "./common";

export const lessonSchema = z.object({
  id: cuidSchema.optional(),
  moduleId: cuidSchema.optional().or(z.literal("")),
  moduleTitle: z.string().trim().max(200).optional().or(z.literal("")),
  title: z.string().trim().min(3, "Título requerido").max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  videoUrl: z
    .string()
    .trim()
    .min(1, "Debes subir un video o ingresar una URL")
    .max(512)
    .refine(
      (val) => val.startsWith("/") || /^https?:\/\//.test(val),
      "Debe ser una URL válida (http/https) o un archivo subido"
    ),
  durationSeconds: z
    .coerce.number()
    .int("Debe ser un entero")
    .min(1, "La duración debe ser mayor a 0")
    .max(60 * 60 * 4, "Duración máxima: 4 horas"),
  orderIndex: z.coerce.number().int().min(0),
  isActive: z.boolean().default(true),
});

export const courseModuleSchema = z.object({
  id: cuidSchema.optional(),
  title: z.string().trim().min(2, "Título del tema requerido").max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  orderIndex: z.coerce.number().int().min(0),
  lessons: z.array(lessonSchema).min(1, "Cada tema debe tener al menos un video"),
});

export const categorySchema = z.object({
  institutionId: cuidSchema,
  name: z.string().trim().min(2, "Nombre requerido").max(80),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color hex inválido (ej. #0ea5e9)")
    .optional()
    .or(z.literal("")),
  description: z.string().trim().max(255).optional().or(z.literal("")),
});

/**
 * Etiquetas libres. Se deduplican sin distinguir mayúsculas ni acentos, para
 * que "Convivencia", "convivencia " y "CONVIVENCIA" sean una sola etiqueta;
 * se conserva la grafía de la primera aparición.
 */
export const tagsSchema = z
  .array(z.string().trim().min(2, "Etiqueta muy corta").max(60))
  .max(15, "Máximo 15 etiquetas")
  .default([])
  .transform((tags) => {
    const seen = new Map<string, string>();
    for (const raw of tags) {
      const name = raw.trim();
      const key = slugify(name);
      if (!key || seen.has(key)) continue;
      seen.set(key, name);
    }
    return Array.from(seen.values());
  });

export const courseSchema = z.object({
  title: z.string().trim().min(3, "Título requerido").max(200),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  /** Id de un tipo del catálogo del colegio; vacío = sin tipo. */
  typeId: cuidSchema.optional().or(z.literal("")),
  videoFormat: z.nativeEnum(VideoFormat).default(VideoFormat.FORMATO_LARGO),
  categoryId: cuidSchema.optional().or(z.literal("")),
  tags: tagsSchema,
  isSequential: z.boolean().default(true),
  /** Ids de cargos del catálogo. Vacío = aplica a todos. */
  targetPositionIds: z.array(cuidSchema).default([]),
  isPublished: z.boolean().default(false),
});

/**
 * Un curso puede tener lecciones directas o agrupadas por temas/módulos.
 */
const courseWithLessons = courseSchema.extend({
  institutionId: cuidSchema,
  modules: z.array(courseModuleSchema).optional().default([]),
  lessons: z.array(lessonSchema).min(1, "Agrega al menos un video o tema con videos"),
});

type CourseWithLessons = z.infer<typeof courseWithLessons>;

/** Reglas compartidas por creación y edición. */
function refineCourse(course: CourseWithLessons, ctx: z.RefinementCtx) {
  const indexes = new Set<number>();
  course.lessons.forEach((lesson, i) => {
    if (indexes.has(lesson.orderIndex)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lessons", i, "orderIndex"],
        message: "El orden de los videos no puede repetirse",
      });
    }
    indexes.add(lesson.orderIndex);
  });

  if (
    course.videoFormat === VideoFormat.FORMATO_LARGO &&
    course.lessons.length !== 1
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lessons"],
      message: "El formato largo admite exactamente un video",
    });
  }

  if (
    course.videoFormat === VideoFormat.MICRO_VIDEOS &&
    course.lessons.length < 1
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lessons"],
      message: "El curso debe contener al menos un video",
    });
  }
}

export const createCourseSchema = courseWithLessons.superRefine(refineCourse);

/** Edición completa: mismos campos que la creación, más el id del curso. */
export const updateCourseFullSchema = courseWithLessons
  .extend({ id: cuidSchema })
  .superRefine(refineCourse);

/** Edición parcial de metadatos (sin tocar videos). */
export const updateCourseSchema = courseSchema.partial().extend({
  id: cuidSchema,
});

export const publishCourseSchema = z.object({
  id: cuidSchema,
  isPublished: z.boolean(),
});

export type LessonInput = z.infer<typeof lessonSchema>;
export type CourseInput = z.infer<typeof courseSchema>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type UpdateCourseFullInput = z.infer<typeof updateCourseFullSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
