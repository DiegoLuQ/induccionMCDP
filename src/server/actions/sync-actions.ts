"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/rbac";
import { failure, success, type ActionResult } from "@/lib/validations/common";
import {
  syncFuncionariosFromExternalDb,
  type SyncSummary,
} from "@/server/services/sync-funcionarios.service";

const NO_ACCESS = "No tienes permisos de administración o tu sesión expiró.";

export async function syncFuncionariosAction(
  targetInstitutionId?: string,
): Promise<ActionResult<SyncSummary>> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role)) {
    return failure(NO_ACCESS);
  }

  // Si no es SUPER_ADMIN, sólo puede sincronizar el colegio que tiene activo
  const institutionToSync =
    session.role === Role.SUPER_ADMIN
      ? targetInstitutionId || session.institutionId
      : session.institutionId;

  try {
    const summary = await syncFuncionariosFromExternalDb(institutionToSync);

    revalidatePath("/admin/funcionarios");
    revalidatePath("/admin");
    revalidatePath("/admin/cursos");

    const deactMsg = summary.totalDeactivated > 0 ? `, ${summary.totalDeactivated} dados de baja (inactivos)` : "";
    const message = `Sincronización completada: ${summary.totalCreated} creados, ${summary.totalUpdated} actualizados${deactMsg}.`;
    return success(summary, message);
  } catch (error: unknown) {
    console.error("[syncFuncionariosAction]", error);
    return failure(
      (error instanceof Error && error.message) ||
        "Error al conectar con la base de datos externa de funcionarios.",
    );
  }
}
