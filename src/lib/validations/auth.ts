import { z } from "zod";
import { emailSchema, pinSchema, tokenSchema } from "./common";

/**
 * Login unificado:
 * Admite RUT, correo o nombre de usuario.
 * Para funcionarios, la contraseña es su clave numérica de 6 dígitos.
 * Para administradores, es su contraseña tradicional.
 */
export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Ingresa tu RUT o correo"),
  password: z
    .string()
    .min(6, "Ingresa tu clave de 6 dígitos o contraseña"),
});

/** Canje de invitación: token del enlace + PIN de 6 dígitos (opcional según la invitación). */
export const redeemInvitationSchema = z.object({
  token: tokenSchema,
  pin: pinSchema.optional().or(z.literal("")),
});

/**
 * Configuración de primer acceso:
 * Creación de clave de 6 dígitos y registro/confirmación de correo institucional.
 */
export const setupInitialAccessSchema = z
  .object({
    pin: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "La clave debe contener exactamente 6 dígitos numéricos"),
    confirmPin: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "La confirmación debe contener 6 dígitos numéricos"),
    corporateEmail: z
      .string()
      .trim()
      .toLowerCase()
      .email("Ingresa un formato de correo válido")
      .optional()
      .or(z.literal("")),
  })
  .refine((data) => data.pin === data.confirmPin, {
    message: "Las claves no coinciden",
    path: ["confirmPin"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(6, "Contraseña o clave actual requerida"),
    newPassword: z
      .string()
      .min(6, "Mínimo 6 dígitos o caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RedeemInvitationInput = z.infer<typeof redeemInvitationSchema>;
export type SetupInitialAccessInput = z.infer<typeof setupInitialAccessSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
