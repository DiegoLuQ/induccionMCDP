"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/rbac";
import { updateInstitutionSchema } from "@/lib/validations/institution";
import {
  failure,
  fromZodError,
  success,
  type ActionResult,
} from "@/lib/validations/common";

/**
 * Edita los datos del establecimiento y sincroniza sus redes sociales.
 * Un SUPER_ADMIN puede editar cualquiera de sus colegios; un ADMIN_RRHH sólo
 * el que tenga activo.
 */
export async function updateInstitutionAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role))
    return failure("No tienes permisos de administración o tu sesión expiró.");

  const parsed = updateInstitutionSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const { id, socialLinks, ...data } = parsed.data;

  if (!session.institutionIds.includes(id))
    return failure("No tienes acceso a ese colegio.");
  if (session.role !== Role.SUPER_ADMIN && id !== session.institutionId)
    return failure("Sólo puedes editar el colegio que tienes activo.");

  const current = await prisma.institution.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!current) return failure("El colegio no existe.");

  // slug y domain son únicos globalmente: se valida antes para dar un mensaje
  // claro en vez de un error de restricción de la base de datos.
  const clash = await prisma.institution.findFirst({
    where: {
      id: { not: id },
      OR: [{ slug: data.slug }, { domain: data.domain }],
    },
    select: { slug: true, domain: true },
  });
  if (clash) {
    return failure(
      clash.slug === data.slug
        ? "Ya existe otro colegio con ese slug."
        : "Ya existe otro colegio con ese dominio.",
    );
  }

  const keptIds = socialLinks.flatMap((link) => (link.id ? [link.id] : []));

  // Los ids vienen del cliente: se comprueba que sean de ESTE colegio antes de
  // actualizarlos, o se podría editar el enlace de otro establecimiento.
  if (keptIds.length > 0) {
    const owned = await prisma.institutionSocialLink.count({
      where: { id: { in: keptIds }, institutionId: id },
    });
    if (owned !== keptIds.length)
      return failure("Alguno de los enlaces no pertenece a este colegio.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.institution.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug,
        domain: data.domain,
        logoUrl: data.logoUrl || null,
        rbd: data.rbd || null,
        rut: data.rut || null,
        phone: data.phone || null,
        address: data.address || null,
        isActive: data.isActive,
      },
    });

    // Los enlaces que desaparecieron del formulario se eliminan.
    await tx.institutionSocialLink.deleteMany({
      where: {
        institutionId: id,
        ...(keptIds.length > 0 ? { id: { notIn: keptIds } } : {}),
      },
    });

    for (const [index, link] of socialLinks.entries()) {
      const payload = {
        platform: link.platform,
        label: link.label || null,
        url: link.url,
        orderIndex: index,
      };

      if (link.id) {
        await tx.institutionSocialLink.update({
          where: { id: link.id },
          data: payload,
        });
      } else {
        await tx.institutionSocialLink.create({
          data: { ...payload, institutionId: id },
        });
      }
    }
  });

  revalidatePath("/configuracion");
  revalidatePath("/configuracion/colegios");
  revalidatePath(`/configuracion/colegios/${id}/editar`);
  revalidatePath("/", "layout");

  return success({ id }, "Colegio actualizado.");
}
