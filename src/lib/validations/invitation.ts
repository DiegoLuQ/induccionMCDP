import { z } from "zod";
import {
  MAX_INVITATION_TTL_HOURS,
  MIN_INVITATION_TTL_HOURS,
} from "@/lib/constants";
import { slugify } from "@/lib/utils";
import { cuidSchema, emailSchema, nameSchema, rutSchema } from "./common";

/** Un destinatario de invitación (funcionario nuevo o existente). */
export const inviteeSchema = z.object({
  userId: cuidSchema.optional().or(z.literal("")),
  rut: rutSchema,
  name: nameSchema,
  email: emailSchema,
  /** Id de un cargo del catálogo del colegio; vacío = sin cargo. */
  positionId: cuidSchema.optional().or(z.literal("")),
  areaId: cuidSchema.optional().or(z.literal("")),
  /** Datos de envío a jefatura y copias CC */
  sendToJefe: z.boolean().default(true),
  jefeNombre: z.string().optional().or(z.literal("")),
  jefeEmail: z.string().optional().or(z.literal("")),
  ccAsistente: z.boolean().default(true),
  asistenteEmail: z.string().optional().or(z.literal("")),
  ccFuncionario: z.boolean().default(false),
  customCcEmails: z.string().optional().or(z.literal("")),
});

/** RRHH selecciona la inducción e invita a 1..N funcionarios. */
export const createInvitationsSchema = z.object({
  courseId: cuidSchema,
  requiresPin: z.boolean().default(true),
  sendEmail: z.boolean().optional().default(true),
  expiresInHours: z.coerce
    .number()
    .int()
    .min(
      MIN_INVITATION_TTL_HOURS,
      `La vigencia mínima es de ${MIN_INVITATION_TTL_HOURS} horas`,
    )
    .max(
      MAX_INVITATION_TTL_HOURS,
      `La vigencia máxima es de ${MAX_INVITATION_TTL_HOURS} horas`,
    )
    .default(MAX_INVITATION_TTL_HOURS),
  invitees: z
    .array(inviteeSchema)
    .min(1, "Agrega al menos un funcionario")
    .max(200, "Máximo 200 invitaciones por lote")
    .superRefine((invitees, ctx) => {
      const seenRuts = new Set<string>();
      const seenEmails = new Set<string>();
      invitees.forEach((invitee, i) => {
        if (seenRuts.has(invitee.rut)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [i, "rut"],
            message: "RUT duplicado en la lista",
          });
        }
        if (seenEmails.has(invitee.email)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [i, "email"],
            message: "Correo duplicado en la lista",
          });
        }
        seenRuts.add(invitee.rut);
        seenEmails.add(invitee.email);
      });
    }),
});

export const resendInvitationSchema = z.object({
  invitationId: cuidSchema,
});

export const revokeInvitationSchema = z.object({
  invitationId: cuidSchema,
});

/**
 * Carga masiva pegando texto: una línea por funcionario
 * "RUT;Nombre;Correo;Cargo"
 */
export const bulkPasteSchema = z.object({
  raw: z.string().trim().min(1, "Pega al menos una línea"),
});

export type InviteeInput = z.infer<typeof inviteeSchema>;
export type CreateInvitationsInput = z.infer<typeof createInvitationsSchema>;

/**
 * `positionsBySlug` permite resolver el nombre del cargo escrito en el texto
 * pegado contra el catálogo del colegio (ej. "Docente" -> id del cargo).
 */
export function parseBulkPaste(
  raw: string,
  positionsBySlug: Map<string, string> = new Map(),
): {
  rows: Array<Partial<InviteeInput> & { rawLine: string; error?: string }>;
} {
  const rows = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((rawLine) => {
      const parts = rawLine.split(/[;,\t]/).map((p) => p.trim());
      const [rut, name, email, position] = parts;
      const parsed = inviteeSchema.safeParse({
        rut: rut ?? "",
        name: name ?? "",
        email: email ?? "",
        positionId: position ? (positionsBySlug.get(slugify(position)) ?? "") : "",
      });
      if (!parsed.success) {
        const first = parsed.error.errors[0];
        return { rawLine, error: first?.message ?? "Línea inválida" };
      }
      return { ...parsed.data, rawLine };
    });
  return { rows };
}

/** Grupo de funcionarios bajo una jefatura para envío consolidado */
export const jefaturaGroupSchema = z.object({
  areaId: z.string().optional().or(z.literal("")),
  areaName: z.string(),
  jefeNombre: z.string().optional().or(z.literal("")),
  jefeEmail: z.string().optional().or(z.literal("")),
  asistenteEmail: z.string().optional().or(z.literal("")),
  sendToJefe: z.boolean().default(true),
  ccAsistente: z.boolean().default(true),
  ccFuncionario: z.boolean().default(false),
  customCcEmails: z.string().optional().or(z.literal("")),
  invitees: z.array(inviteeSchema).min(1, "Debe incluir al menos un funcionario"),
});

export const consolidatedInvitationsSchema = z.object({
  courseId: cuidSchema,
  requiresPin: z.boolean().default(true),
  sendEmail: z.boolean().default(true),
  expiresInHours: z.coerce
    .number()
    .int()
    .min(
      MIN_INVITATION_TTL_HOURS,
      `La vigencia mínima es de ${MIN_INVITATION_TTL_HOURS} horas`,
    )
    .max(
      MAX_INVITATION_TTL_HOURS,
      `La vigencia máxima es de ${MAX_INVITATION_TTL_HOURS} horas`,
    )
    .default(MAX_INVITATION_TTL_HOURS),
  groups: z.array(jefaturaGroupSchema).min(1, "Debe seleccionar al menos un grupo"),
});

export type JefaturaGroupInput = z.infer<typeof jefaturaGroupSchema>;
export type ConsolidatedInvitationsInput = z.infer<typeof consolidatedInvitationsSchema>;

export const autoInvitationConfigSchema = z.object({
  isEnabled: z.boolean().default(false),
  scheduledTime: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:mm)")
    .default("09:00"),
  courseId: cuidSchema.optional().nullable().or(z.literal("")),
  sendToJefe: z.boolean().default(true),
  customCcEmails: z.string().optional().default(""),
});

export type AutoInvitationConfigInput = z.infer<typeof autoInvitationConfigSchema>;
