"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { failure, fromZodError, success, type ActionResult } from "@/lib/validations/common";
import { tutorialSchema } from "@/lib/validations/tutorial";

const NO_ACCESS = "Sólo el Super Administrador puede administrar los tutoriales.";

async function isSuperAdmin(): Promise<boolean> {
  const session = await getSession();
  return session?.role === Role.SUPER_ADMIN;
}

function revalidateTutorials() {
  revalidatePath("/tutoriales");
  revalidatePath("/configuracion/videos");
}

/** Crea o actualiza (si trae `id`) un tutorial. */
export async function saveTutorialAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  if (!(await isSuperAdmin())) return failure(NO_ACCESS);

  const parsed = tutorialSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const { id, description, roles, positionSlugs, ...rest } = parsed.data;
  const data = {
    ...rest,
    description: description || null,
    roles: [...new Set(roles)],
    positionSlugs: [...new Set(positionSlugs)],
  };

  if (id) {
    const exists = await prisma.tutorial.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return failure("El tutorial ya no existe.");
    await prisma.tutorial.update({ where: { id }, data });
    revalidateTutorials();
    return success({ id }, `Tutorial "${data.title}" actualizado.`);
  }

  const created = await prisma.tutorial.create({ data, select: { id: true } });
  revalidateTutorials();
  return success({ id: created.id }, `Tutorial "${data.title}" creado.`);
}

export async function deleteTutorialAction(id: string): Promise<ActionResult> {
  if (!(await isSuperAdmin())) return failure(NO_ACCESS);
  if (typeof id !== "string" || !id) return failure("Tutorial inválido.");

  const deleted = await prisma.tutorial.deleteMany({ where: { id } });
  if (deleted.count === 0) return failure("El tutorial ya no existe.");
  revalidateTutorials();
  return success(undefined, "Tutorial eliminado.");
}
