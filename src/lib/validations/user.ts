import { Role } from "@prisma/client";
import { z } from "zod";
import { slugify } from "@/lib/utils";
import { cuidSchema, emailSchema, nameSchema, rutSchema } from "./common";

export const roleSchema = z.nativeEnum(Role);

/** Id de un elemento de catálogo del colegio; vacío = sin asignar. */
const catalogIdSchema = cuidSchema.optional().or(z.literal(""));

/** Campo opcional que conserva su mensaje de error (sin uniones). */
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

export const usernameSchema = optionalText(
  (value) => /^[a-z0-9._-]{3,60}$/.test(value),
  "Usuario inválido: sólo minúsculas, números, punto, guion y guion bajo",
  60,
);

export const passwordSchema = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .regex(/[A-Za-z]/, "Debe incluir al menos una letra")
  .regex(/\d/, "Debe incluir al menos un número");

export const userBaseSchema = z.object({
  rut: rutSchema,
  name: nameSchema,
  email: emailSchema,
  corporateEmail: optionalText(
    (value) => z.string().email().safeParse(value).success,
    "Correo institucional inválido",
    180,
  ),
  username: usernameSchema,
  phone: optionalText(
    (value) => /^[0-9+()\s-]+$/.test(value),
    "Teléfono inválido",
    40,
  ),
  role: roleSchema.default(Role.FUNCIONARIO),
  positionId: catalogIdSchema,
  areaId: catalogIdSchema,
});

export const createUserSchema = userBaseSchema
  .extend({
    /** Colegio principal del usuario. */
    institutionId: cuidSchema,
    /** Colegios adicionales que podrá administrar (selector global). */
    extraInstitutionIds: z.array(cuidSchema).default([]),
    password: z.string().default(""),
  })
  .superRefine((user, ctx) => {
    // Los roles administrativos entran con contraseña; los funcionarios por PIN.
    const needsPassword = user.role !== Role.FUNCIONARIO;

    if (needsPassword) {
      if (!user.password) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["password"],
          message: "Los roles administrativos requieren contraseña",
        });
      } else {
        const parsed = passwordSchema.safeParse(user.password);
        if (!parsed.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["password"],
            message: parsed.error.errors[0]?.message ?? "Contraseña inválida",
          });
        }
      }
    }

    if (user.password && !user.username) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["username"],
        message: "Define un usuario para poder iniciar sesión con contraseña",
      });
    }

    if (user.extraInstitutionIds.includes(user.institutionId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["extraInstitutionIds"],
        message: "El colegio principal no debe repetirse en los adicionales",
      });
    }
  });

export const updateUserSchema = userBaseSchema.partial().extend({
  id: cuidSchema,
  extraInstitutionIds: z.array(cuidSchema).optional(),
  /** Vacío = no cambiar la contraseña. */
  password: z.string().default(""),
});

export const toggleUserSchema = z.object({
  id: cuidSchema,
  isActive: z.boolean(),
});

export const resetPasswordSchema = z.object({
  id: cuidSchema,
  password: passwordSchema,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// ---------------------------------------------------------------------------
// CARGA MASIVA
// ---------------------------------------------------------------------------

/** Orden de columnas admitido en el pegado masivo. */
export const BULK_USER_COLUMNS = [
  "RUT",
  "Nombre completo",
  "Correo",
  "Correo institucional",
  "Usuario",
  "Teléfono",
  "Rol",
  "Cargo",
  "Área",
] as const;

const ROLE_ALIASES: Record<string, Role> = {
  "super-admin": Role.SUPER_ADMIN,
  superadmin: Role.SUPER_ADMIN,
  super_admin: Role.SUPER_ADMIN,
  "admin-rrhh": Role.ADMIN_RRHH,
  adminrrhh: Role.ADMIN_RRHH,
  admin_rrhh: Role.ADMIN_RRHH,
  admin: Role.ADMIN_RRHH,
  rrhh: Role.ADMIN_RRHH,
  funcionario: Role.FUNCIONARIO,
};

export interface BulkUserRow {
  rawLine: string;
  error?: string;
  data?: {
    rut: string;
    name: string;
    email: string;
    corporateEmail: string;
    username: string;
    phone: string;
    role: Role;
    positionId: string;
    areaId: string;
  };
}

/**
 * Interpreta el pegado masivo. Los catálogos (cargo y área) se resuelven por
 * nombre contra el colegio, para que RRHH escriba "Docente" y no un id.
 */
export function parseBulkUsers(
  raw: string,
  catalogs: {
    positions: Map<string, string>;
    areas: Map<string, string>;
  },
): BulkUserRow[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((rawLine) => {
      const parts = rawLine.split(/[;\t]/).map((part) => part.trim());
      const [rut, name, email, corporateEmail, username, phone, role, position, area] =
        parts;

      const roleValue = role
        ? ROLE_ALIASES[slugify(role)] ?? undefined
        : Role.FUNCIONARIO;

      if (role && !roleValue) {
        return { rawLine, error: `Rol no reconocido: "${role}"` };
      }

      const parsed = userBaseSchema.safeParse({
        rut: rut ?? "",
        name: name ?? "",
        email: email ?? "",
        corporateEmail: corporateEmail ?? "",
        username: username ?? "",
        phone: phone ?? "",
        role: roleValue,
        positionId: position ? catalogs.positions.get(slugify(position)) ?? "" : "",
        areaId: area ? catalogs.areas.get(slugify(area)) ?? "" : "",
      });

      if (!parsed.success) {
        return {
          rawLine,
          error: parsed.error.errors[0]?.message ?? "Línea inválida",
        };
      }

      return {
        rawLine,
        data: {
          rut: parsed.data.rut,
          name: parsed.data.name,
          email: parsed.data.email,
          corporateEmail: parsed.data.corporateEmail,
          username: parsed.data.username,
          phone: parsed.data.phone,
          role: parsed.data.role,
          positionId: parsed.data.positionId ?? "",
          areaId: parsed.data.areaId ?? "",
        },
      };
    });
}

/** Payload del alta masiva ya validada en el cliente. */
export const bulkCreateUsersSchema = z.object({
  institutionId: cuidSchema,
  users: z
    .array(
      userBaseSchema.extend({
        positionId: catalogIdSchema,
        areaId: catalogIdSchema,
      }),
    )
    .min(1, "No hay usuarios que crear")
    .max(300, "Máximo 300 usuarios por lote"),
});

export type BulkCreateUsersInput = z.infer<typeof bulkCreateUsersSchema>;
