import "server-only";

import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth/jwt";
import { isAdminRole } from "@/lib/auth/rbac";
import { getManagedAreas } from "@/server/queries/reports";

/**
 * Alcance sobre funcionarios del colegio activo:
 * - SUPER_ADMIN / ADMIN_RRHH: todos.
 * - AUDITOR jefatura: sólo los de sus áreas a cargo; sin áreas a cargo, todos.
 * - Resto: ninguno.
 */
export type StaffScope =
  | { allowed: false }
  | { allowed: true; institutionId: string; areaIds: string[] | null; areaNames: string[] };

export async function getStaffScope(session: SessionPayload | null): Promise<StaffScope> {
  if (!session) return { allowed: false };
  if (isAdminRole(session.role)) {
    return { allowed: true, institutionId: session.institutionId, areaIds: null, areaNames: [] };
  }
  if (session.role !== Role.AUDITOR) return { allowed: false };

  const areas = await getManagedAreas(session.institutionId, session.sub);
  return {
    allowed: true,
    institutionId: session.institutionId,
    areaIds: areas.length > 0 ? areas.map((a) => a.id) : null,
    areaNames: areas.map((a) => a.name),
  };
}

/** Devuelve el funcionario si la sesión puede ver/gestionar sus constancias; si no, null. */
export async function findStaffInScope(session: SessionPayload | null, userId: string) {
  const scope = await getStaffScope(session);
  if (!scope.allowed) return null;
  return prisma.user.findFirst({
    where: {
      id: userId,
      institutionId: scope.institutionId,
      ...(scope.areaIds ? { areaId: { in: scope.areaIds } } : {}),
    },
    select: { id: true, name: true, rut: true },
  });
}
