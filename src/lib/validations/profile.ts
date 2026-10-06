import { z } from "zod";
import { emailSchema, rutSchema } from "./common";

/** Datos que el usuario puede editar desde "Mi cuenta". */
export const updateProfileSchema = z.object({
  /** Sólo se aplica si el rol puede editar su RUT (ver updateProfileAction). */
  rut: rutSchema.optional(),
  email: emailSchema,
  corporateEmail: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => !value || z.string().email().safeParse(value).success, "Correo institucional inválido")
    .default(""),
});

export type UpdateProfileInput = z.input<typeof updateProfileSchema>;
