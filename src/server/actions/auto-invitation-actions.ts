"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/rbac";
import {
  failure,
  fromZodError,
  success,
  type ActionResult,
} from "@/lib/validations/common";
import { autoInvitationConfigSchema } from "@/lib/validations/invitation";
import {
  upsertAutoInvitationConfig,
  executeAutoInvitations,
  type AutoInvitationConfigDTO,
  type RunAutoInvitationsResult,
} from "@/server/services/auto-invitation-service";

/**
 * Guarda o actualiza la configuración del disparador automático de invitaciones.
 */
export async function saveAutoInvitationConfigAction(
  input: unknown,
): Promise<ActionResult<AutoInvitationConfigDTO>> {
  const session = await getSession();
  if (!session) return failure("Sesión expirada.");
  if (!isAdminRole(session.role))
    return failure("No tienes permisos para modificar la configuración.");

  const parsed = autoInvitationConfigSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const config = await upsertAutoInvitationConfig(session.institutionId, {
      isEnabled: parsed.data.isEnabled,
      scheduledTime: parsed.data.scheduledTime,
      courseId: parsed.data.courseId || null,
      sendToJefe: parsed.data.sendToJefe,
      customCcEmails: parsed.data.customCcEmails,
    });

    revalidatePath("/configuracion");
    revalidatePath("/admin/invitaciones");

    return success(config, "Configuración del disparador automático guardada.");
  } catch (error) {
    console.error("[saveAutoInvitationConfigAction]", error);
    return failure(
      error instanceof Error
        ? error.message
        : "Error al guardar la configuración del disparador.",
    );
  }
}

/**
 * Ejecuta manualmente el proceso automático bajo demanda (para pruebas).
 */
export async function runAutoInvitationsNowAction(): Promise<
  ActionResult<RunAutoInvitationsResult>
> {
  const session = await getSession();
  if (!session) return failure("Sesión expirada.");
  if (!isAdminRole(session.role))
    return failure("No tienes permisos para ejecutar este proceso.");

  try {
    const result = await executeAutoInvitations(session.institutionId, session.sub);

    revalidatePath("/configuracion");
    revalidatePath("/admin/invitaciones");
    revalidatePath("/admin");

    if (!result.success) {
      return failure(result.message);
    }

    return success(result, result.message);
  } catch (error) {
    console.error("[runAutoInvitationsNowAction]", error);
    return failure(
      error instanceof Error
        ? error.message
        : "Ocurrió un error al ejecutar el disparador.",
    );
  }
}
