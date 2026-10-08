import "server-only";

import { Role, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth/session";

export interface TutorialItem {
  id: string;
  title: string;
  description: string | null;
  videoUrl: string;
  roles: Role[];
  positionSlugs: string[];
  orderIndex: number;
  isPublished: boolean;
  updatedAt: Date;
}

export interface PositionOption {
  slug: string;
  name: string;
}

function toStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Un tutorial aplica si el rol y el cargo del usuario cumplen (vacío = sin restricción). */
export function tutorialAppliesTo(
  tutorial: Pick<TutorialItem, "roles" | "positionSlugs">,
  role: Role,
  positionSlug: string | null,
): boolean {
  if (tutorial.roles.length > 0 && !tutorial.roles.includes(role)) return false;
  if (tutorial.positionSlugs.length > 0 && (!positionSlug || !tutorial.positionSlugs.includes(positionSlug))) {
    return false;
  }
  return true;
}

/**
 * Tutoriales visibles para la sesión. El SUPER_ADMIN (quien los administra) ve
 * todos, incluidos los borradores; el resto sólo los publicados que le aplican.
 */
export async function getTutorialsForSession(session: SessionPayload): Promise<TutorialItem[]> {
  const canManage = session.role === Role.SUPER_ADMIN;
  const rows = await prisma.tutorial.findMany({
    where: canManage ? undefined : { isPublished: true },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "desc" }],
  });
  const items: TutorialItem[] = rows.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    videoUrl: t.videoUrl,
    roles: toStringArray(t.roles).filter((r): r is Role => r in Role),
    positionSlugs: toStringArray(t.positionSlugs),
    orderIndex: t.orderIndex,
    isPublished: t.isPublished,
    updatedAt: t.updatedAt,
  }));
  return canManage ? items : items.filter((t) => tutorialAppliesTo(t, session.role, session.positionSlug));
}

/** Cargos de todos los colegios, por slug (los tutoriales son globales). */
export async function getTutorialPositionOptions(): Promise<PositionOption[]> {
  const positions = await prisma.position.findMany({
    where: { isActive: true },
    select: { slug: true, name: true },
    orderBy: [{ orderIndex: "asc" }, { name: "asc" }],
  });
  const bySlug = new Map<string, string>();
  for (const p of positions) if (!bySlug.has(p.slug)) bySlug.set(p.slug, p.name);
  return [...bySlug].map(([slug, name]) => ({ slug, name }));
}
