"use server";

import { revalidatePath } from "next/cache";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/rbac";
import { MAX_INVITATION_TTL_HOURS } from "@/lib/constants";
import {
  createInvitationsSchema,
  consolidatedInvitationsSchema,
  resendInvitationSchema,
  revokeInvitationSchema,
} from "@/lib/validations/invitation";
import {
  failure,
  fromZodError,
  success,
  type ActionResult,
} from "@/lib/validations/common";
import {
  issueInvitations,
  issueConsolidatedInvitations,
  reissueInvitation,
  type InvitationIssueError,
  type IssueConsolidatedResult,
} from "@/server/services/invitation-service";

export interface InvitationSummary {
  sent: number;
  failed: number;
  errors: InvitationIssueError[];
  /** Enlaces generados para visualización y copia rápida en la interfaz. */
  previewLinks?: Array<{ email: string; name?: string; link: string; pin?: string | null }>;
}

/**
 * RRHH invita a 1..N funcionarios a una inducción del colegio activo.
 * Genera token único + PIN de 6 dígitos con vigencia de 24 a 48 horas.
 */
export async function createInvitationsAction(
  input: unknown,
): Promise<ActionResult<InvitationSummary>> {
  const session = await getSession();
  if (!session) return failure("Sesión expirada.");
  if (!isAdminRole(session.role))
    return failure("No tienes permisos para invitar funcionarios.");

  const parsed = createInvitationsSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const { issued, errors } = await issueInvitations({
      courseId: parsed.data.courseId,
      institutionId: session.institutionId,
      invitees: parsed.data.invitees,
      requiresPin: parsed.data.requiresPin,
      expiresInHours: parsed.data.expiresInHours,
      createdById: session.sub,
      sendEmail: parsed.data.sendEmail,
    });

    revalidatePath("/admin/invitaciones");
    revalidatePath("/admin");

    const summary: InvitationSummary = {
      sent: issued.length,
      failed: errors.length,
      errors,
      previewLinks: issued.map((i) => ({
        email: i.email,
        name: i.name,
        link: i.link,
        pin: i.pin,
      })),
    };

    if (issued.length === 0) {
      return failure(
        "No se pudo emitir ninguna invitación. Revisa los datos.",
      );
    }

    return success(
      summary,
      `Se enviaron ${issued.length} invitación(es).` +
        (errors.length ? ` ${errors.length} con problemas.` : ""),
    );
  } catch (error) {
    console.error("[createInvitationsAction]", error);
    return failure(
      error instanceof Error ? error.message : "Error al emitir invitaciones.",
    );
  }
}

/**
 * Emite invitaciones agrupadas por jefatura y envía un correo consolidado por cada área/jefe.
 */
export async function createConsolidatedInvitationsAction(
  input: unknown,
): Promise<ActionResult<IssueConsolidatedResult>> {
  const session = await getSession();
  if (!session) return failure("Sesión expirada.");
  if (!isAdminRole(session.role))
    return failure("No tienes permisos para invitar funcionarios.");

  const parsed = consolidatedInvitationsSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const result = await issueConsolidatedInvitations({
      courseId: parsed.data.courseId,
      institutionId: session.institutionId,
      groups: parsed.data.groups,
      requiresPin: parsed.data.requiresPin,
      expiresInHours: parsed.data.expiresInHours,
      createdById: session.sub,
      sendEmail: parsed.data.sendEmail,
    });

    revalidatePath("/admin/invitaciones");
    revalidatePath("/admin");

    if (result.totalIssued === 0) {
      return failure("No se pudo emitir ninguna invitación. Revisa los datos de los funcionarios.");
    }

    const emailNote = parsed.data.sendEmail
      ? " y se enviaron los correos consolidados."
      : " (enlaces generados listos para compartir).";

    return success(
      result,
      `Se procesaron ${result.totalIssued} invitación(es) para ${result.groups.length} grupo(s)${emailNote}`,
    );
  } catch (error) {
    console.error("[createConsolidatedInvitationsAction]", error);
    return failure(
      error instanceof Error ? error.message : "Error al procesar invitaciones consolidadas.",
    );
  }
}


export async function resendInvitationAction(
  invitationId: string,
): Promise<ActionResult<{ link: string; pin: string | null }>> {
  const session = await getSession();
  if (!session) return failure("Sesión expirada.");
  if (!isAdminRole(session.role)) return failure("Sin permisos.");

  const parsed = resendInvitationSchema.safeParse({ invitationId });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const reissued = await reissueInvitation(
      parsed.data.invitationId,
      session.institutionId,
      MAX_INVITATION_TTL_HOURS,
      session.sub,
    );
    revalidatePath("/admin/invitaciones");
    return success(
      { link: reissued.link, pin: reissued.pin },
      "Invitación reemitida exitosamente.",
    );
  } catch (error) {
    console.error("[resendInvitationAction]", error);
    return failure("No se pudo reenviar la invitación.");
  }
}

/** Revoca (caduca) una invitación vigente sin borrar la trazabilidad. */
export async function revokeInvitationAction(
  invitationId: string,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return failure("Sesión expirada.");
  if (!isAdminRole(session.role)) return failure("Sin permisos.");

  const parsed = revokeInvitationSchema.safeParse({ invitationId });
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await prisma.invitation.updateMany({
    where: {
      id: parsed.data.invitationId,
      institutionId: session.institutionId,
      isUsed: false,
    },
    data: { expiresAt: new Date() },
  });

  if (result.count === 0)
    return failure("La invitación no existe o ya fue utilizada.");

  revalidatePath("/admin/invitaciones");
  return success(undefined, "Invitación revocada.");
}

/** Elimina permanentemente una invitación por ID. */
export async function deleteInvitationAction(
  invitationId: string,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return failure("Sesión expirada.");
  if (!isAdminRole(session.role)) return failure("Sin permisos.");

  try {
    await prisma.invitation.deleteMany({
      where: {
        id: invitationId,
        institutionId: session.institutionId,
      },
    });

    revalidatePath("/admin/invitaciones");
    revalidatePath("/admin");
    return success(undefined, "Invitación eliminada correctamente.");
  } catch (error) {
    console.error("[deleteInvitationAction]", error);
    return failure("No se pudo eliminar la invitación.");
  }
}

/** Elimina permanentemente una lista seleccionada o todas las invitaciones del colegio. */
export async function deleteMultipleInvitationsAction(
  invitationIds?: string[],
): Promise<ActionResult<{ deleted: number }>> {
  const session = await getSession();
  if (!session) return failure("Sesión expirada.");
  if (!isAdminRole(session.role)) return failure("Sin permisos.");

  try {
    const whereClause: Prisma.InvitationWhereInput = {
      institutionId: session.institutionId,
    };

    if (invitationIds && invitationIds.length > 0) {
      whereClause.id = { in: invitationIds };
    }

    const { count } = await prisma.invitation.deleteMany({
      where: whereClause,
    });

    revalidatePath("/admin/invitaciones");
    revalidatePath("/admin");
    return success(
      { deleted: count },
      `Se eliminaron ${count} invitación(es) con éxito.`,
    );
  } catch (error) {
    console.error("[deleteMultipleInvitationsAction]", error);
    return failure("Error al eliminar las invitaciones.");
  }
}

/** SUPER_ADMIN puede purgar invitaciones vencidas del colegio activo. */
export async function purgeExpiredInvitationsAction(): Promise<ActionResult<{ deleted: number }>> {
  const session = await getSession();
  if (session?.role !== Role.SUPER_ADMIN) return failure("Sin permisos.");

  const { count } = await prisma.invitation.deleteMany({
    where: {
      institutionId: session.institutionId,
      isUsed: false,
      expiresAt: { lt: new Date() },
    },
  });

  revalidatePath("/admin/invitaciones");
  return success({ deleted: count }, `${count} invitación(es) eliminadas.`);
}
