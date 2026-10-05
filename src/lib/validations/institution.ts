import { z } from "zod";
import { SOCIAL_PLATFORMS } from "@/lib/constants";
import { isValidRut, normalizeRut } from "@/lib/rut";
import { cuidSchema } from "./common";

const PLATFORM_VALUES = SOCIAL_PLATFORMS.map((p) => p.value);

export const socialLinkSchema = z
  .object({
    id: cuidSchema.optional(),
    platform: z
      .string()
      .trim()
      .refine(
        (value) => PLATFORM_VALUES.includes(value as (typeof PLATFORM_VALUES)[number]),
        "Plataforma no admitida",
      ),
    label: z.string().trim().max(80).default(""),
    url: z.string().trim().url("URL inválida").max(512),
  })
  .superRefine((link, ctx) => {
    // "Otro" sin nombre quedaría como una fila anónima en la ficha pública.
    if (link.platform === "otro" && !link.label) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["label"],
        message: "Indica el nombre de la red cuando eliges «Otro»",
      });
    }
  });

/**
 * Campo de texto opcional con validación propia. Se evita
 * `.optional().or(z.literal(""))` porque convierte el campo en una unión y
 * Zod reporta "Invalid input" en vez del mensaje escrito.
 */
function optionalText(
  predicate: (value: string) => boolean,
  message: string,
  max = 255,
) {
  return z
    .string()
    .trim()
    .max(max)
    .refine((value) => !value || predicate(value), message)
    .default("");
}

/** RUT institucional: mismo algoritmo que el de personas. */
const institutionRutSchema = optionalText(isValidRut, "El RUT no es válido", 12)
  .transform((value) => (value ? normalizeRut(value) : ""));

export const institutionSchema = z.object({
  name: z.string().trim().min(3, "Nombre requerido").max(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{3,80}$/, "Slug inválido (sólo a-z, 0-9 y guiones)"),
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9.-]+\.[a-z]{2,}$/,
      "Dominio inválido (ej. colegiomacaya.cl)",
    ),
  logoUrl: optionalText(
    (value) =>
      z.string().url().safeParse(value).success || value.startsWith("/"),
    "URL de imagen inválida",
    512,
  ),
  rbd: optionalText(
    (value) => /^[0-9-]{1,20}$/.test(value),
    "El RBD sólo admite números y guion",
    20,
  ),
  rut: institutionRutSchema,
  phone: optionalText(
    (value) => /^[0-9+()\s-]+$/.test(value),
    "Teléfono inválido",
    40,
  ),
  address: z.string().trim().max(255).default(""),
  isActive: z.boolean().default(true),
});

export const updateInstitutionSchema = institutionSchema.extend({
  id: cuidSchema,
  socialLinks: z
    .array(socialLinkSchema)
    .max(12, "Máximo 12 enlaces")
    .default([]),
});

export const switchInstitutionSchema = z.object({
  institutionId: cuidSchema,
});

export type InstitutionInput = z.infer<typeof institutionSchema>;
export type UpdateInstitutionInput = z.infer<typeof updateInstitutionSchema>;
export type SocialLinkInput = z.infer<typeof socialLinkSchema>;
export type SwitchInstitutionInput = z.infer<typeof switchInstitutionSchema>;
