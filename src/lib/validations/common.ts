import { z } from "zod";
import { isValidRut, normalizeRut } from "@/lib/rut";

export const cuidSchema = z.string().min(1, "Identificador requerido");

export const rutSchema = z
  .string()
  .trim()
  .min(8, "RUT incompleto")
  .refine(isValidRut, "El RUT ingresado no es válido")
  .transform(normalizeRut);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Correo electrónico inválido");

export const nameSchema = z
  .string()
  .trim()
  .min(3, "El nombre debe tener al menos 3 caracteres")
  .max(160, "Máximo 160 caracteres");

export const pinSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "El PIN debe tener exactamente 6 dígitos");

export const tokenSchema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{64}$/i, "Token de invitación inválido");

/** Resultado estándar de todos los Server Actions. */
export type ActionResult<T = undefined> =
  | { success: true; message?: string; data?: T }
  | { success: false; message: string; fieldErrors?: Record<string, string[]> };

export function failure(
  message: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> {
  return { success: false, message, fieldErrors };
}

export function success<T>(data?: T, message?: string): ActionResult<T> {
  return { success: true, data, message };
}

/** Convierte un ZodError en el formato de ActionResult. */
export function fromZodError(error: z.ZodError): ActionResult<never> {
  return failure(
    "Revisa los datos ingresados.",
    error.flatten().fieldErrors as Record<string, string[]>,
  );
}
