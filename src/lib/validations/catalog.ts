import { z } from "zod";
import { cuidSchema } from "./common";

/**
 * Catálogos administrables por colegio: cargos (`Position`) y tipos de curso
 * (`CourseType`). Comparten forma, así que comparten esquema.
 */
const catalogBase = z.object({
  name: z.string().trim().min(2, "Nombre requerido").max(80),
  description: z.string().trim().max(255).optional().or(z.literal("")),
  orderIndex: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const createPositionSchema = catalogBase.extend({
  institutionId: cuidSchema,
});

export const updatePositionSchema = catalogBase.partial().extend({
  id: cuidSchema,
});

export const createCourseTypeSchema = catalogBase.extend({
  institutionId: cuidSchema,
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color hex inválido (ej. #0ea5e9)")
    .optional()
    .or(z.literal("")),
});

export const updateCourseTypeSchema = createCourseTypeSchema
  .partial()
  .omit({ institutionId: true })
  .extend({ id: cuidSchema });

export const createAreaSchema = catalogBase.extend({
  institutionId: cuidSchema,
  jefeNombre: z.string().trim().max(500).optional().or(z.literal("")),
  jefeRut: z.string().trim().max(255).optional().or(z.literal("")),
  jefeEmail: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal("")),
  asistenteEmail: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal("")),
  positionIds: z.array(cuidSchema).optional(),
});

export const updateAreaSchema = createAreaSchema
  .partial()
  .omit({ institutionId: true })
  .extend({
    id: cuidSchema,
    positionIds: z.array(cuidSchema).optional(),
  });

export const deleteCatalogItemSchema = z.object({ id: cuidSchema });

export type CreatePositionInput = z.infer<typeof createPositionSchema>;
export type UpdatePositionInput = z.infer<typeof updatePositionSchema>;
export type CreateAreaInput = z.infer<typeof createAreaSchema>;
export type UpdateAreaInput = z.infer<typeof updateAreaSchema>;
export type CreateCourseTypeInput = z.infer<typeof createCourseTypeSchema>;
export type UpdateCourseTypeInput = z.infer<typeof updateCourseTypeSchema>;
