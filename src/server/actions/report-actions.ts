"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/rbac";
import { MAX_INVITATION_TTL_HOURS } from "@/lib/constants";
import { failure, success, type ActionResult } from "@/lib/validations/common";
import { issueInvitations } from "@/server/services/invitation-service";

/**
 * Invita (o reinvita) a un funcionario a un curso desde el Reporte: emite una
 * invitación nueva con PIN y la envía a su correo. Una invitación vigente
 * anterior del mismo curso queda anulada. Sólo RRHH / Super Admin.
 */
export async function inviteStaffToCourseAction(input: {
  userId: string;
  courseId: string;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role)) return failure("Sin permisos.");

  const user = await prisma.user.findFirst({
    where: { id: input?.userId, institutionId: session.institutionId, isActive: true },
    select: { id: true, rut: true, name: true, email: true, positionId: true, areaId: true },
  });
  if (!user) return failure("Funcionario no encontrado o inactivo.");

  try {
    const { issued, errors } = await issueInvitations({
      courseId: input.courseId,
      institutionId: session.institutionId,
      requiresPin: true,
      expiresInHours: MAX_INVITATION_TTL_HOURS,
      createdById: session.sub,
      sendEmail: true,
      invitees: [
        {
          userId: user.id,
          rut: user.rut,
          name: user.name,
          email: user.email,
          positionId: user.positionId ?? "",
          areaId: user.areaId ?? "",
          sendToJefe: false,
          jefeNombre: "",
          jefeEmail: "",
          ccAsistente: false,
          asistenteEmail: "",
          ccFuncionario: false,
          customCcEmails: "",
        },
      ],
    });
    if (issued.length === 0) {
      return failure(errors[0]?.reason ?? "No se pudo emitir la invitación.");
    }
    revalidatePath("/reportes");
    revalidatePath("/admin/invitaciones");
    return success(
      undefined,
      issued[0]?.emailSent
        ? `Invitación enviada a ${user.name} (${user.email}).`
        : `Invitación creada para ${user.name}, pero el correo no se pudo enviar.`,
    );
  } catch (error) {
    console.error("[inviteStaffToCourseAction]", error);
    return failure(error instanceof Error ? error.message : "No se pudo emitir la invitación.");
  }
}
