"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSession, getSession } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/rbac";
import { failure, fromZodError, success, type ActionResult } from "@/lib/validations/common";
import { updateProfileSchema } from "@/lib/validations/profile";
import { isProvisionalEmail, PROVISIONAL_EMAIL_MESSAGE } from "@/lib/provisional-email";

/**
 * Actualiza los datos de contacto del usuario en sesión. El RUT sólo lo
 * cambian roles administrativos: la sincronización con la base central
 * identifica a cada funcionario por su RUT, y un cambio hecho por el propio
 * funcionario lo haría aparecer como otra persona (duplicado + baja).
 */
export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return failure("Sesión expirada.");

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      rut: true,
      corporateEmail: true,
      institutionId: true,
      institution: { select: { domain: true } },
    },
  });
  if (!user) return failure("Usuario no encontrado.");

  const { email, corporateEmail } = parsed.data;
  const canEditRut = isAdminRole(session.role);
  const rut = canEditRut && parsed.data.rut ? parsed.data.rut : user.rut;

  const domain = user.institution.domain.toLowerCase();
  // Sólo se rechaza un provisorio NUEVO (el que ya tenía no impide guardar otros datos).
  if (corporateEmail && isProvisionalEmail(corporateEmail) && corporateEmail !== user.corporateEmail) {
    return failure(PROVISIONAL_EMAIL_MESSAGE, { corporateEmail: [PROVISIONAL_EMAIL_MESSAGE] });
  }
  if (corporateEmail && !corporateEmail.endsWith(`@${domain}`)) {
    return failure(`El correo institucional debe pertenecer al dominio @${domain}.`, {
      corporateEmail: [`Debe terminar en @${domain}`],
    });
  }

  // Unicidad dentro del colegio (RUT, correo y correo institucional).
  const duplicate = await prisma.user.findFirst({
    where: {
      institutionId: user.institutionId,
      id: { not: user.id },
      OR: [
        { rut },
        { email },
        { corporateEmail: email },
        ...(corporateEmail ? [{ email: corporateEmail }, { corporateEmail }] : []),
      ],
    },
    select: { rut: true, email: true, corporateEmail: true },
  });
  if (duplicate) {
    if (duplicate.rut === rut) return failure("Ese RUT ya pertenece a otro usuario del colegio.");
    return failure("Ese correo ya pertenece a otro usuario del colegio.");
  }

  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { rut, email, corporateEmail: corporateEmail || null },
      select: { email: true, corporateEmail: true },
    });

    // La sesión guarda el correo: se renueva para que el cambio se vea al tiro.
    const { iat: _iat, exp: _exp, ...payload } = session;
    await createSession({ ...payload, email: updated.corporateEmail || updated.email });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return failure("El RUT o correo ya pertenece a otro usuario del colegio.");
    }
    console.error("[updateProfileAction]", error);
    return failure("No se pudieron guardar los cambios.");
  }

  revalidatePath("/perfil");
  revalidatePath("/", "layout");
  return success(undefined, "Datos actualizados.");
}
