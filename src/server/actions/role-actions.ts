"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { hashSecret } from "@/lib/auth/password";
import { failure, success, type ActionResult } from "@/lib/validations/common";
import { passwordSchema } from "@/lib/validations/user";

/**
 * Gestión de roles y contraseñas de acceso. Exclusivo de SUPER_ADMIN.
 * Los roles administrativos entran por /login con contraseña; los funcionarios
 * por invitación + PIN.
 */

async function getSuperAdminSession() {
  const session = await getSession();
  return session?.role === Role.SUPER_ADMIN ? session : null;
}

function revalidateRoles() {
  revalidatePath("/configuracion/usuarios");
  revalidatePath("/admin/funcionarios");
}

export async function setUserRoleAction(input: {
  userId: string;
  role: Role;
  /** Obligatoria si el usuario pasa a un rol administrativo y aún no tiene contraseña. */
  password?: string;
}): Promise<ActionResult> {
  const session = await getSuperAdminSession();
  if (!session) return failure("Sólo un Super Administrador puede cambiar roles.");

  const { userId, role, password = "" } = input ?? {};
  if (!userId || !Object.values(Role).includes(role)) return failure("Datos inválidos.");
  if (userId === session.sub) return failure("No puedes cambiar tu propio rol.");

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      OR: [
        { institutionId: session.institutionId },
        { memberships: { some: { institutionId: session.institutionId } } },
      ],
    },
    select: { id: true, name: true, passwordHash: true },
  });
  if (!user) return failure("Usuario no encontrado en este colegio.");

  if (password) {
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Contraseña inválida.");
  }
  if (role !== Role.FUNCIONARIO && !user.passwordHash && !password) {
    return failure("Para dar un rol administrativo debes definir una contraseña de acceso.");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        role,
        isActive: true,
        ...(password ? { passwordHash: await hashSecret(password) } : {}),
      },
    }),
    prisma.institutionMembership.updateMany({
      where: { userId: user.id },
      data: { role },
    }),
  ]);

  revalidateRoles();
  return success(undefined, `${user.name} ahora tiene el rol seleccionado.`);
}

export async function setUserPasswordAction(input: {
  userId: string;
  password: string;
}): Promise<ActionResult> {
  const session = await getSuperAdminSession();
  if (!session) return failure("Sólo un Super Administrador puede cambiar contraseñas.");

  const parsed = passwordSchema.safeParse(input?.password);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Contraseña inválida.");

  const user = await prisma.user.findFirst({
    where: {
      id: input.userId,
      OR: [
        { institutionId: session.institutionId },
        { memberships: { some: { institutionId: session.institutionId } } },
      ],
    },
    select: { id: true, name: true },
  });
  if (!user) return failure("Usuario no encontrado en este colegio.");

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashSecret(parsed.data) },
  });

  revalidateRoles();
  return success(undefined, `Contraseña de ${user.name} actualizada.`);
}
