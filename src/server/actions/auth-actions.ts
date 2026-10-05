"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifySecret, hashSecret } from "@/lib/auth/password";
import {
  buildInstitutionIds,
  createSession,
  destroySession,
  getSession,
  setActiveInstitution,
} from "@/lib/auth/session";
import {
  changePasswordSchema,
  loginSchema,
  redeemInvitationSchema,
  setupInitialAccessSchema,
} from "@/lib/validations/auth";
import { switchInstitutionSchema } from "@/lib/validations/institution";
import {
  failure,
  fromZodError,
  success,
  type ActionResult,
} from "@/lib/validations/common";
import { redeemInvitation } from "@/server/services/invitation-service";
import { tryNormalizeRut } from "@/lib/rut";

/** Login unificado: RUT o correo + contraseña o clave de 6 dígitos. */
export async function loginAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) return fromZodError(parsed.error);

  const { identifier } = parsed.data;
  const potentialRut = tryNormalizeRut(identifier);

  const orConditions: Array<{
    email?: string;
    corporateEmail?: string;
    username?: string;
    rut?: string;
  }> = [
    { email: identifier },
    { corporateEmail: identifier },
    { username: identifier },
  ];

  if (potentialRut) {
    orConditions.push({ rut: potentialRut });
  }

  const user = await prisma.user.findFirst({
    where: {
      isActive: true,
      OR: orConditions,
    },
    include: {
      institution: true,
      position: { select: { slug: true, name: true } },
    },
  });

  const invalid = failure("Credenciales inválidas.");
  if (!user) return invalid;

  if (!user.passwordHash) {
    return failure(
      "Tu cuenta aún no tiene una clave creada. Ingresa mediante el enlace de invitación recibido para crear tu clave de 6 dígitos.",
    );
  }

  if (!user.institution.isActive) {
    return failure("El colegio se encuentra deshabilitado.");
  }

  const ok = await verifySecret(parsed.data.password, user.passwordHash);
  if (!ok) return invalid;

  const institutionIds = await buildInstitutionIds(user.id, user.institutionId);

  await createSession({
    sub: user.id,
    name: user.name,
    email: user.corporateEmail || user.email,
    role: user.role,
    positionSlug: user.position?.slug ?? null,
    positionName: user.position?.name ?? null,
    institutionId: user.institutionId,
    institutionIds,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return success({ redirectTo: "/dashboard" });
}

/**
 * Configuración de primer acceso para funcionarios:
 * Permite definir una clave de 6 dígitos numéricos y registrar/confirmar su correo institucional.
 */
export async function setupInitialAccessAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return failure("Sesión expirada o no iniciada.");

  const parsed = setupInitialAccessSchema.safeParse({
    pin: formData.get("pin"),
    confirmPin: formData.get("confirmPin"),
    corporateEmail: formData.get("corporateEmail") || undefined,
  });
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    include: { institution: true },
  });

  if (!user) return failure("Usuario no encontrado.");

  let validatedCorporateEmail: string | undefined = undefined;
  if (parsed.data.corporateEmail) {
    const rawEmail = parsed.data.corporateEmail.trim().toLowerCase();
    const parts = rawEmail.split("@");
    if (parts.length !== 2) {
      return failure("El correo ingresado no es válido.");
    }

    const allowedDomain = user.institution.domain.toLowerCase();
    if (parts[1] !== allowedDomain) {
      return failure(
        `El correo institucional debe pertenecer al dominio @${allowedDomain}`,
      );
    }

    // Verificar unicidad en la institución
    const existing = await prisma.user.findFirst({
      where: {
        institutionId: user.institutionId,
        id: { not: user.id },
        OR: [{ corporateEmail: rawEmail }, { email: rawEmail }],
      },
    });

    if (existing) {
      return failure(
        "Este correo institucional ya está asignado a otro usuario en este colegio.",
      );
    }

    validatedCorporateEmail = rawEmail;
  }

  const passwordHash = await hashSecret(parsed.data.pin);

  const updateData: {
    passwordHash: string;
    corporateEmail?: string;
    email?: string;
  } = {
    passwordHash,
  };

  if (validatedCorporateEmail) {
    updateData.corporateEmail = validatedCorporateEmail;
    // Si su email era genérico/placeholder o contenía el RUT, actualizarlo al oficial
    if (!user.email || user.email.startsWith(user.rut.replace(/[^0-9]/g, ""))) {
      updateData.email = validatedCorporateEmail;
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: updateData,
  });

  revalidatePath("/", "layout");
  return success(
    undefined,
    "¡Tu clave de 6 dígitos y correo institucional fueron configurados con éxito!",
  );
}

/**
 * Canje de invitación: valida token + PIN, abre sesión de funcionario y lo
 * lleva directo a su inducción.
 */
export async function redeemInvitationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = redeemInvitationSchema.safeParse({
    token: formData.get("token"),
    pin: formData.get("pin"),
  });
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await redeemInvitation(parsed.data.token, parsed.data.pin);
  if (!result.ok) return failure(result.reason);

  const institutionIds = await buildInstitutionIds(
    result.user.id,
    result.user.institutionId,
  );

  await createSession({
    sub: result.user.id,
    name: result.user.name,
    email: result.user.email,
    role: result.user.role,
    positionSlug: result.user.positionSlug,
    positionName: result.user.positionName,
    institutionId: result.user.institutionId,
    institutionIds,
  });

  return success({ redirectTo: `/mis-inducciones/${result.courseId}` });
}

export async function logoutAction(): Promise<never> {
  await destroySession();
  redirect("/login");
}

/** Selector global de colegio (multi-tenancy). */
export async function switchInstitutionAction(
  institutionId: string,
): Promise<ActionResult> {
  const parsed = switchInstitutionSchema.safeParse({ institutionId });
  if (!parsed.success) return fromZodError(parsed.error);

  const ok = await setActiveInstitution(parsed.data.institutionId);
  if (!ok) return failure("No tienes acceso a ese colegio.");

  revalidatePath("/", "layout");
  return success(undefined, "Colegio cambiado.");
}

export async function changePasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return failure("Sesión expirada.");

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user?.passwordHash)
    return failure("Tu cuenta no usa contraseña. Ingresa con tu invitación.");

  const ok = await verifySecret(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return failure("La contraseña actual no es correcta.");

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashSecret(parsed.data.newPassword) },
  });

  return success(undefined, "Contraseña actualizada.");
}

/** Helper para páginas de servidor que necesitan el rol activo. */
export async function assertAdmin(): Promise<boolean> {
  const session = await getSession();
  return (
    session?.role === Role.SUPER_ADMIN || session?.role === Role.ADMIN_RRHH
  );
}
