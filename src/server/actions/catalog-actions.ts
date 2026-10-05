"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/rbac";
import { slugify } from "@/lib/utils";
import {
  createAreaSchema,
  createCourseTypeSchema,
  createPositionSchema,
  deleteCatalogItemSchema,
  updateAreaSchema,
  updateCourseTypeSchema,
  updatePositionSchema,
} from "@/lib/validations/catalog";
import {
  failure,
  fromZodError,
  success,
  type ActionResult,
} from "@/lib/validations/common";

const NO_ACCESS = "No tienes permisos de administración o tu sesión expiró.";

async function getAdminSession() {
  const session = await getSession();
  if (!session || !isAdminRole(session.role)) return null;
  return session;
}

function revalidateCatalogs() {
  revalidatePath("/configuracion/catalogos");
  revalidatePath("/admin/cursos");
  revalidatePath("/admin/invitaciones");
  revalidatePath("/admin/funcionarios");
}

// ---------------------------------------------------------------------------
// CARGOS
// ---------------------------------------------------------------------------

export async function createPositionAction(
  input: unknown,
): Promise<ActionResult<{ id: string; name: string }>> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const parsed = createPositionSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  if (!session.institutionIds.includes(parsed.data.institutionId))
    return failure("No tienes acceso a ese colegio.");

  const slug = slugify(parsed.data.name);
  if (!slug) return failure("El nombre del cargo no es válido.");

  const existing = await prisma.position.findUnique({
    where: {
      institutionId_slug: { institutionId: parsed.data.institutionId, slug },
    },
    select: { id: true },
  });
  if (existing) return failure("Ya existe un cargo con ese nombre.");

  const position = await prisma.position.create({
    data: {
      institutionId: parsed.data.institutionId,
      name: parsed.data.name,
      slug,
      description: parsed.data.description || null,
      orderIndex: parsed.data.orderIndex,
      isActive: parsed.data.isActive,
    },
    select: { id: true, name: true },
  });

  revalidateCatalogs();
  return success(position, "Cargo creado.");
}

export async function updatePositionAction(
  input: unknown,
): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const parsed = updatePositionSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const { id, name, ...rest } = parsed.data;

  const current = await prisma.position.findFirst({
    where: { id, institutionId: session.institutionId },
    select: { id: true },
  });
  if (!current) return failure("Cargo no encontrado.");

  // El slug se regenera al renombrar: es el identificador de las reglas RBAC.
  let slug: string | undefined;
  if (name) {
    slug = slugify(name);
    if (!slug) return failure("El nombre del cargo no es válido.");
    const clash = await prisma.position.findFirst({
      where: {
        institutionId: session.institutionId,
        slug,
        id: { not: id },
      },
      select: { id: true },
    });
    if (clash) return failure("Ya existe otro cargo con ese nombre.");
  }

  await prisma.position.update({
    where: { id },
    data: {
      ...rest,
      ...(name ? { name, slug } : {}),
      ...(rest.description !== undefined
        ? { description: rest.description || null }
        : {}),
    },
  });

  revalidateCatalogs();
  return success(undefined, "Cargo actualizado.");
}

export async function deletePositionAction(
  id: string,
): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const parsed = deleteCatalogItemSchema.safeParse({ id });
  if (!parsed.success) return fromZodError(parsed.error);

  const position = await prisma.position.findFirst({
    where: { id: parsed.data.id, institutionId: session.institutionId },
    select: {
      id: true,
      _count: { select: { users: true, targetedBy: true } },
    },
  });
  if (!position) return failure("Cargo no encontrado.");

  // Borrar dejaría usuarios sin cargo (SetNull) y cursos sin destinatario:
  // se exige reasignar antes, para no perder el dato en silencio.
  if (position._count.users > 0)
    return failure(
      `${position._count.users} funcionario(s) tienen este cargo. Reasígnalos o desactiva el cargo en vez de eliminarlo.`,
    );
  if (position._count.targetedBy > 0)
    return failure(
      `${position._count.targetedBy} curso(s) apuntan a este cargo. Quítalo de esos cursos primero.`,
    );

  await prisma.position.delete({ where: { id: parsed.data.id } });

  revalidateCatalogs();
  return success(undefined, "Cargo eliminado.");
}

// ---------------------------------------------------------------------------
// ÁREAS
// ---------------------------------------------------------------------------

export async function createAreaAction(
  input: unknown,
): Promise<ActionResult<{ id: string; name: string }>> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const parsed = createAreaSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  if (!session.institutionIds.includes(parsed.data.institutionId))
    return failure("No tienes acceso a ese colegio.");

  const slug = slugify(parsed.data.name);
  if (!slug) return failure("El nombre del área no es válido.");

  const existing = await prisma.area.findUnique({
    where: {
      institutionId_slug: { institutionId: parsed.data.institutionId, slug },
    },
    select: { id: true },
  });
  if (existing) return failure("Ya existe un área con ese nombre.");

  const { positionIds, ...areaData } = parsed.data;

  const area = await prisma.area.create({
    data: {
      institutionId: areaData.institutionId,
      name: areaData.name,
      slug,
      description: areaData.description || null,
      jefeNombre: areaData.jefeNombre || null,
      jefeRut: areaData.jefeRut || null,
      jefeEmail: areaData.jefeEmail || null,
      asistenteEmail: areaData.asistenteEmail || null,
      orderIndex: areaData.orderIndex,
      isActive: areaData.isActive,
    },
    select: { id: true, name: true },
  });

  // Si se seleccionaron cargos para vincular a esta jefatura, actualizar a los funcionarios de esos cargos
  if (positionIds && positionIds.length > 0) {
    await prisma.user.updateMany({
      where: {
        institutionId: session.institutionId,
        positionId: { in: positionIds },
      },
      data: {
        areaId: area.id,
      },
    });
  }

  revalidateCatalogs();
  return success(area, "Área creada.");
}

export async function updateAreaAction(input: unknown): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const parsed = updateAreaSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const { id, name, positionIds, ...rest } = parsed.data;

  const current = await prisma.area.findFirst({
    where: { id, institutionId: session.institutionId },
    select: { id: true },
  });
  if (!current) return failure("Área no encontrada.");

  let slug: string | undefined;
  if (name) {
    slug = slugify(name);
    if (!slug) return failure("El nombre del área no es válido.");
    const clash = await prisma.area.findFirst({
      where: { institutionId: session.institutionId, slug, id: { not: id } },
      select: { id: true },
    });
    if (clash) return failure("Ya existe otra área con ese nombre.");
  }

  await prisma.area.update({
    where: { id },
    data: {
      ...rest,
      ...(name ? { name, slug } : {}),
      ...(rest.description !== undefined
        ? { description: rest.description || null }
        : {}),
      ...(rest.jefeNombre !== undefined
        ? { jefeNombre: rest.jefeNombre || null }
        : {}),
      ...(rest.jefeRut !== undefined ? { jefeRut: rest.jefeRut || null } : {}),
      ...(rest.jefeEmail !== undefined
        ? { jefeEmail: rest.jefeEmail || null }
        : {}),
      ...(rest.asistenteEmail !== undefined
        ? { asistenteEmail: rest.asistenteEmail || null }
        : {}),
    },
  });

  // Si se pasaron cargos específicos seleccionados para esta jefatura:
  if (positionIds !== undefined) {
    if (positionIds.length > 0) {
      // 1. Asignar los funcionarios de los cargos marcados a esta área
      await prisma.user.updateMany({
        where: {
          institutionId: session.institutionId,
          positionId: { in: positionIds },
        },
        data: {
          areaId: id,
        },
      });

      // 2. Si un funcionario pertenecía a esta área pero su cargo fue desmarcado, desacoplarlo
      await prisma.user.updateMany({
        where: {
          institutionId: session.institutionId,
          areaId: id,
          positionId: { notIn: positionIds, not: null },
        },
        data: {
          areaId: null,
        },
      });
    } else {
      // Si se desmarcaron todos los cargos, desvincular a los funcionarios de esta área que tenían cargo
      await prisma.user.updateMany({
        where: {
          institutionId: session.institutionId,
          areaId: id,
          positionId: { not: null },
        },
        data: {
          areaId: null,
        },
      });
    }
  }

  revalidateCatalogs();
  return success(undefined, "Área actualizada.");
}

export async function deleteAreaAction(id: string): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const parsed = deleteCatalogItemSchema.safeParse({ id });
  if (!parsed.success) return fromZodError(parsed.error);

  const area = await prisma.area.findFirst({
    where: { id: parsed.data.id, institutionId: session.institutionId },
    select: { id: true, _count: { select: { users: true } } },
  });
  if (!area) return failure("Área no encontrada.");

  if (area._count.users > 0)
    return failure(
      `${area._count.users} funcionario(s) pertenecen a esta área. Reasígnalos o desactívala en vez de eliminarla.`,
    );

  await prisma.area.delete({ where: { id: parsed.data.id } });

  revalidateCatalogs();
  return success(undefined, "Área eliminada.");
}

// ---------------------------------------------------------------------------
// TIPOS DE CURSO
// ---------------------------------------------------------------------------

export async function createCourseTypeAction(
  input: unknown,
): Promise<ActionResult<{ id: string; name: string }>> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const parsed = createCourseTypeSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  if (!session.institutionIds.includes(parsed.data.institutionId))
    return failure("No tienes acceso a ese colegio.");

  const slug = slugify(parsed.data.name);
  if (!slug) return failure("El nombre del tipo no es válido.");

  const existing = await prisma.courseType.findUnique({
    where: {
      institutionId_slug: { institutionId: parsed.data.institutionId, slug },
    },
    select: { id: true },
  });
  if (existing) return failure("Ya existe un tipo con ese nombre.");

  const courseType = await prisma.courseType.create({
    data: {
      institutionId: parsed.data.institutionId,
      name: parsed.data.name,
      slug,
      color: parsed.data.color || null,
      description: parsed.data.description || null,
      orderIndex: parsed.data.orderIndex,
      isActive: parsed.data.isActive,
    },
    select: { id: true, name: true },
  });

  revalidateCatalogs();
  return success(courseType, "Tipo creado.");
}

export async function updateCourseTypeAction(
  input: unknown,
): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const parsed = updateCourseTypeSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const { id, name, color, ...rest } = parsed.data;

  const current = await prisma.courseType.findFirst({
    where: { id, institutionId: session.institutionId },
    select: { id: true },
  });
  if (!current) return failure("Tipo no encontrado.");

  let slug: string | undefined;
  if (name) {
    slug = slugify(name);
    if (!slug) return failure("El nombre del tipo no es válido.");
    const clash = await prisma.courseType.findFirst({
      where: { institutionId: session.institutionId, slug, id: { not: id } },
      select: { id: true },
    });
    if (clash) return failure("Ya existe otro tipo con ese nombre.");
  }

  await prisma.courseType.update({
    where: { id },
    data: {
      ...rest,
      ...(name ? { name, slug } : {}),
      ...(color !== undefined ? { color: color || null } : {}),
      ...(rest.description !== undefined
        ? { description: rest.description || null }
        : {}),
    },
  });

  revalidateCatalogs();
  return success(undefined, "Tipo actualizado.");
}

export async function deleteCourseTypeAction(
  id: string,
): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  const parsed = deleteCatalogItemSchema.safeParse({ id });
  if (!parsed.success) return fromZodError(parsed.error);

  const courseType = await prisma.courseType.findFirst({
    where: { id: parsed.data.id, institutionId: session.institutionId },
    select: { id: true, _count: { select: { courses: true } } },
  });
  if (!courseType) return failure("Tipo no encontrado.");

  if (courseType._count.courses > 0)
    return failure(
      `${courseType._count.courses} curso(s) usan este tipo. Cámbialos de tipo o desactívalo en vez de eliminarlo.`,
    );

  await prisma.courseType.delete({ where: { id: parsed.data.id } });

  revalidateCatalogs();
  return success(undefined, "Tipo eliminado.");
}

/** Obtiene catálogos (tipos, categorías, cargos) para un colegio dado. */
export async function getInstitutionCatalogsAction(institutionId: string): Promise<
  ActionResult<{
    courseTypes: { id: string; name: string; color: string | null }[];
    categories: { id: string; name: string; color: string | null }[];
    positions: { id: string; name: string }[];
  }>
> {
  const session = await getAdminSession();
  if (!session) return failure(NO_ACCESS);

  if (!session.institutionIds.includes(institutionId)) {
    return failure("No tienes acceso a este colegio.");
  }

  const [courseTypes, categories, positions] = await Promise.all([
    prisma.courseType.findMany({
      where: { institutionId, isActive: true },
      orderBy: [{ orderIndex: "asc" }, { name: "asc" }],
      select: { id: true, name: true, color: true },
    }),
    prisma.category.findMany({
      where: { institutionId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    prisma.position.findMany({
      where: { institutionId, isActive: true },
      orderBy: [{ orderIndex: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  return success({ courseTypes, categories, positions });
}

