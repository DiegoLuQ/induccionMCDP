import "server-only";

import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashSecret, verifySecret } from "@/lib/auth/password";
import {
  generateInvitationToken,
  generatePin,
  hashToken,
  invitationExpiryDate,
} from "@/lib/auth/tokens";
import { MAX_PIN_ATTEMPTS } from "@/lib/constants";
import { sendMail } from "@/lib/mail/mailer";
import {
  invitationEmail,
  consolidatedInvitationEmail,
  type ConsolidatedFuncionarioItem,
} from "@/lib/mail/templates";
import type { InviteeInput, JefaturaGroupInput } from "@/lib/validations/invitation";

export interface IssuedInvitation {
  invitationId: string;
  userId: string;
  email: string;
  name: string;
  /** Sólo en memoria: se envía por correo y no se persiste en claro (nulo si no requiere PIN). */
  pin: string | null;
  requiresPin: boolean;
  token: string;
  link: string;
  sentToEmail: string | null;
  ccEmails: string[];
  expiresAt: Date;
  emailSent: boolean;
}

export interface InvitationIssueError {
  email: string;
  reason: string;
}

function buildInvitationLink(token: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/auth/invitation?token=${token}`;
}

/**
 * Crea (o reutiliza) el usuario funcionario y emite una invitación con token
 * único y PIN opcional.
 */
export async function issueInvitations(params: {
  courseId: string;
  institutionId: string;
  invitees: InviteeInput[];
  requiresPin?: boolean;
  expiresInHours: number;
  createdById: string;
  sendEmail?: boolean;
}): Promise<{ issued: IssuedInvitation[]; errors: InvitationIssueError[] }> {
  const course = await prisma.course.findFirst({
    where: { id: params.courseId, institutionId: params.institutionId },
    include: { institution: true },
  });

  if (!course) {
    throw new Error("El curso no existe o no pertenece a este colegio.");
  }
  if (!course.isPublished) {
    throw new Error("No puedes invitar a un curso que aún no está publicado.");
  }

  /** Dominio del colegio: sólo elige la cuenta remitente; el funcionario puede tener cualquier correo. */
  const institutionDomain = course.institution.domain.toLowerCase();
  const expiresAt = invitationExpiryDate(params.expiresInHours);
  const requiresPin = params.requiresPin ?? true;

  const issued: IssuedInvitation[] = [];
  const errors: InvitationIssueError[] = [];

  for (const invitee of params.invitees) {
    const { token, tokenHash } = generateInvitationToken();
    const pin = requiresPin ? generatePin() : null;
    const pinHash = pin ? await hashSecret(pin) : null;

    // Determinar destinatario principal: Jefe(s) de Área o Funcionario directo
    const isForJefe = Boolean(invitee.sendToJefe && invitee.jefeEmail);
    const jefeEmails = invitee.jefeEmail
      ? invitee.jefeEmail.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"))
      : [];
    const primaryJefeEmail = jefeEmails[0] || "";
    const extraJefeEmails = jefeEmails.slice(1);

    const targetEmail = isForJefe && primaryJefeEmail ? primaryJefeEmail : invitee.email;
    const recipientName = isForJefe && invitee.jefeNombre ? invitee.jefeNombre : invitee.name;

    // Compilar lista de copias (CC)
    const ccSet = new Set<string>();
    if (isForJefe && extraJefeEmails.length > 0) {
      extraJefeEmails.forEach((e) => ccSet.add(e));
    }
    if (invitee.ccAsistente && invitee.asistenteEmail) {
      invitee.asistenteEmail
        .split(/[,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@"))
        .forEach((e) => ccSet.add(e));
    }
    if (invitee.ccFuncionario && isForJefe && invitee.email) {
      ccSet.add(invitee.email.trim().toLowerCase());
    }
    if (invitee.customCcEmails) {
      invitee.customCcEmails
        .split(/[,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@"))
        .forEach((e) => ccSet.add(e));
    }
    // Remover targetEmail de la lista de CC si fue agregado
    ccSet.delete(targetEmail.trim().toLowerCase());
    const ccList = Array.from(ccSet);

    try {
      const invitation = await prisma.$transaction(async (tx) => {
        const user = await upsertFuncionario(tx, {
          ...invitee,
          institutionId: params.institutionId,
        });

        // Invalida invitaciones vigentes previas del mismo usuario/curso.
        await tx.invitation.updateMany({
          where: {
            userId: user.id,
            courseId: course.id,
            isUsed: false,
            expiresAt: { gt: new Date() },
          },
          data: { expiresAt: new Date() },
        });

        const created = await tx.invitation.create({
          data: {
            userId: user.id,
            courseId: course.id,
            institutionId: params.institutionId,
            tokenHash,
            pinHash,
            requiresPin,
            sentToEmail: targetEmail,
            ccEmails: ccList.length > 0 ? ccList.join(", ") : null,
            expiresAt,
            createdById: params.createdById,
          },
        });

        // Deja el progreso creado en PENDING para que aparezca en el dashboard.
        await tx.courseProgress.upsert({
          where: { userId_courseId: { userId: user.id, courseId: course.id } },
          create: { userId: user.id, courseId: course.id, status: "PENDING" },
          update: {},
        });

        return { ...created, user };
      });

      const link = buildInvitationLink(token);
      let emailSent = false;

      if (params.sendEmail !== false) {
        const mail = invitationEmail({
          name: invitation.user.name,
          recipientName,
          isForJefe,
          institutionName: course.institution.name,
          institutionLogoUrl: course.institution.logoUrl,
          courseTitle: course.title,
          link,
          pin,
          expiresAt,
        });

        emailSent = await sendMail({
          to: targetEmail,
          cc: ccList.length > 0 ? ccList : undefined,
          institutionDomain,
          ...mail,
        });
      }

      issued.push({
        invitationId: invitation.id,
        userId: invitation.user.id,
        email: invitation.user.email,
        name: invitation.user.name,
        pin,
        requiresPin,
        token,
        link,
        sentToEmail: targetEmail,
        ccEmails: ccList,
        expiresAt,
        emailSent,
      });
    } catch (error) {
      console.error("[invitations] Error emitiendo invitación:", error);
      errors.push({
        email: invitee.email,
        reason: describeIssueError(error),
      });
    }
  }

  return { issued, errors };
}

export interface ConsolidatedGroupResult {
  areaId?: string;
  areaName: string;
  jefeNombre?: string;
  sentToEmail: string | null;
  ccEmails: string[];
  emailSent: boolean;
  issued: IssuedInvitation[];
  errors: InvitationIssueError[];
}

export interface IssueConsolidatedResult {
  groups: ConsolidatedGroupResult[];
  totalIssued: number;
  totalErrors: number;
}

export async function issueConsolidatedInvitations(params: {
  courseId: string;
  institutionId: string;
  groups: JefaturaGroupInput[];
  requiresPin?: boolean;
  expiresInHours: number;
  createdById: string;
  sendEmail?: boolean;
}): Promise<IssueConsolidatedResult> {
  const course = await prisma.course.findFirst({
    where: { id: params.courseId, institutionId: params.institutionId },
    include: { institution: true },
  });

  if (!course) {
    throw new Error("El curso no existe o no pertenece a este colegio.");
  }
  if (!course.isPublished) {
    throw new Error("No puedes invitar a un curso que aún no está publicado.");
  }

  /** Dominio del colegio: sólo elige la cuenta remitente; el funcionario puede tener cualquier correo. */
  const institutionDomain = course.institution.domain.toLowerCase();
  const expiresAt = invitationExpiryDate(params.expiresInHours);
  const requiresPin = params.requiresPin ?? true;

  const positions = await prisma.position.findMany({
    where: { institutionId: params.institutionId },
    select: { id: true, name: true },
  });
  const positionMap = new Map(positions.map((p) => [p.id, p.name]));

  const groupResults: ConsolidatedGroupResult[] = [];
  let totalIssuedCount = 0;
  let totalErrorsCount = 0;

  for (const group of params.groups) {
    const groupIssued: IssuedInvitation[] = [];
    const groupErrors: InvitationIssueError[] = [];
    const consolidatedItems: ConsolidatedFuncionarioItem[] = [];

    for (const invitee of group.invitees) {
      const { token, tokenHash } = generateInvitationToken();
      const pin = requiresPin ? generatePin() : null;
      const pinHash = pin ? await hashSecret(pin) : null;

      try {
        const invitation = await prisma.$transaction(async (tx) => {
          const user = await upsertFuncionario(tx, {
            ...invitee,
            institutionId: params.institutionId,
          });

          await tx.invitation.updateMany({
            where: {
              userId: user.id,
              courseId: course.id,
              isUsed: false,
              expiresAt: { gt: new Date() },
            },
            data: { expiresAt: new Date() },
          });

          const created = await tx.invitation.create({
            data: {
              userId: user.id,
              courseId: course.id,
              institutionId: params.institutionId,
              tokenHash,
              pinHash,
              requiresPin,
              sentToEmail: group.sendToJefe && group.jefeEmail ? group.jefeEmail : invitee.email,
              ccEmails: group.asistenteEmail || null,
              expiresAt,
              createdById: params.createdById,
            },
          });

          await tx.courseProgress.upsert({
            where: { userId_courseId: { userId: user.id, courseId: course.id } },
            create: { userId: user.id, courseId: course.id, status: "PENDING" },
            update: {},
          });

          return { ...created, user };
        });

        const link = buildInvitationLink(token);
        const positionName = invitee.positionId ? positionMap.get(invitee.positionId) : undefined;

        groupIssued.push({
          invitationId: invitation.id,
          userId: invitation.user.id,
          email: invitation.user.email,
          name: invitation.user.name,
          pin,
          requiresPin,
          token,
          link,
          sentToEmail: group.sendToJefe && group.jefeEmail ? group.jefeEmail : invitee.email,
          ccEmails: [],
          expiresAt,
          emailSent: false,
        });

        consolidatedItems.push({
          name: invitation.user.name,
          rut: invitation.user.rut,
          positionName,
          link,
          pin,
        });
      } catch (err) {
        console.error("[consolidated-invitations] Error emitiendo invitación:", err);
        groupErrors.push({
          email: invitee.email,
          reason: describeIssueError(err),
        });
      }
    }

    let emailSent = false;
    let targetEmail: string | null = null;
    const ccList: string[] = [];

    if (params.sendEmail !== false && groupIssued.length > 0) {
      const isForJefe = Boolean(group.sendToJefe && group.jefeEmail);

      if (isForJefe && group.jefeEmail) {
        const jefeEmails = group.jefeEmail
          .split(/[,;\s]+/)
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e.includes("@"));
        targetEmail = jefeEmails[0] || null;
        const extraJefeEmails = jefeEmails.slice(1);

        const ccSet = new Set<string>();
        extraJefeEmails.forEach((e) => ccSet.add(e));

        if (group.ccAsistente && group.asistenteEmail) {
          group.asistenteEmail
            .split(/[,;\s]+/)
            .map((e) => e.trim().toLowerCase())
            .filter((e) => e.includes("@"))
            .forEach((e) => ccSet.add(e));
        }
        if (group.ccFuncionario) {
          groupIssued.forEach((f) => ccSet.add(f.email.trim().toLowerCase()));
        }
        if (group.customCcEmails) {
          group.customCcEmails
            .split(/[,;\s]+/)
            .map((e) => e.trim().toLowerCase())
            .filter((e) => e.includes("@"))
            .forEach((e) => ccSet.add(e));
        }

        if (targetEmail) {
          ccSet.delete(targetEmail.trim().toLowerCase());
        }
        ccList.push(...Array.from(ccSet));

        if (targetEmail) {
          const mail = consolidatedInvitationEmail({
            recipientName: group.jefeNombre,
            areaName: group.areaName,
            institutionName: course.institution.name,
            institutionLogoUrl: course.institution.logoUrl,
            courseTitle: course.title,
            funcionarios: consolidatedItems,
            expiresAt,
          });

          emailSent = await sendMail({
            to: targetEmail,
            cc: ccList.length > 0 ? ccList : undefined,
            institutionDomain,
            ...mail,
          });

          groupIssued.forEach((item) => {
            item.emailSent = emailSent;
            item.sentToEmail = targetEmail;
            item.ccEmails = ccList;
          });
        }
      } else {
        // Enviar individual a cada funcionario
        for (const item of groupIssued) {
          try {
            const mail = invitationEmail({
              name: item.name,
              institutionName: course.institution.name,
              institutionLogoUrl: course.institution.logoUrl,
              courseTitle: course.title,
              link: item.link,
              pin: item.pin,
              expiresAt,
            });

            const sent = await sendMail({
              to: item.email,
              institutionDomain,
              ...mail,
            });
            item.emailSent = sent;
            item.sentToEmail = item.email;
            if (sent) emailSent = true;
          } catch (e) {
            console.error(`[invitations] Error enviando correo a ${item.email}:`, e);
          }
        }
      }
    }

    totalIssuedCount += groupIssued.length;
    totalErrorsCount += groupErrors.length;

    groupResults.push({
      areaId: group.areaId,
      areaName: group.areaName,
      jefeNombre: group.jefeNombre,
      sentToEmail: targetEmail,
      ccEmails: ccList,
      emailSent,
      issued: groupIssued,
      errors: groupErrors,
    });
  }

  return {
    groups: groupResults,
    totalIssued: totalIssuedCount,
    totalErrors: totalErrorsCount,
  };
}


/** Traduce el error de Prisma a un motivo legible para el administrador. */
function describeIssueError(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(", ") : String(error.meta?.target ?? "");
      return `El RUT o correo ya pertenece a otro funcionario del colegio (${target}).`;
    }
    if (error.code === "P2003") return "Referencia inválida (cargo, área o usuario que no existe).";
    if (error.code === "P2000") return "Un dato es demasiado largo (revisa los correos de jefatura/asistente).";
    return `Error de base de datos ${error.code}.`;
  }
  const message = error instanceof Error ? error.message.trim().split(/\r?\n/).pop() : "";
  return message
    ? `No se pudo generar la invitación: ${message.slice(0, 200)}`
    : "No se pudo generar la invitación. Revisa RUT y correo.";
}

async function upsertFuncionario(
  tx: Prisma.TransactionClient,
  data: InviteeInput & { institutionId: string },
) {
  const existing = await tx.user.findFirst({
    where: {
      institutionId: data.institutionId,
      OR: [{ rut: data.rut }, { email: data.email }],
    },
  });

  if (existing) {
    return tx.user.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        ...(data.positionId ? { positionId: data.positionId } : {}),
        ...(data.areaId ? { areaId: data.areaId } : {}),
        email: data.email,
        rut: data.rut,
        isActive: true,
      },
    });
  }

  return tx.user.create({
    data: {
      rut: data.rut,
      name: data.name,
      email: data.email,
      corporateEmail: data.email,
      positionId: data.positionId || null,
      areaId: data.areaId || null,
      role: Role.FUNCIONARIO,
      institutionId: data.institutionId,
    },
  });
}

export type RedeemResult =
  | {
      ok: true;
      invitationId: string;
      courseId: string;
      user: {
        id: string;
        name: string;
        email: string;
        role: Role;
        positionSlug: string | null;
        positionName: string | null;
        institutionId: string;
      };
    }
  | { ok: false; reason: string };

/**
 * Valida token + PIN (si es requerido). Aplica caducidad, uso único y bloqueo por intentos.
 */
export async function redeemInvitation(
  token: string,
  pin?: string,
): Promise<RedeemResult> {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: { include: { position: { select: { slug: true, name: true } } } },
      course: true,
    },
  });

  const genericError = "El enlace o el PIN no son válidos.";

  if (!invitation) return { ok: false, reason: genericError };
  if (invitation.isUsed)
    return { ok: false, reason: "Esta invitación ya fue utilizada." };
  if (invitation.expiresAt.getTime() <= Date.now())
    return {
      ok: false,
      reason: "La invitación venció. Solicita una nueva a RRHH.",
    };
  if (invitation.attempts >= MAX_PIN_ATTEMPTS)
    return {
      ok: false,
      reason: "Invitación bloqueada por demasiados intentos. Contacta a RRHH.",
    };
  if (!invitation.user.isActive)
    return { ok: false, reason: "Tu usuario está inactivo. Contacta a RRHH." };

  // Si la invitación exige PIN, validarlo
  if (invitation.requiresPin && invitation.pinHash) {
    if (!pin) {
      return { ok: false, reason: "Ingresa el PIN de 6 dígitos." };
    }

    const pinOk = await verifySecret(pin, invitation.pinHash);

    if (!pinOk) {
      const updated = await prisma.invitation.update({
        where: { id: invitation.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      const remaining = Math.max(0, MAX_PIN_ATTEMPTS - updated.attempts);
      return {
        ok: false,
        reason:
          remaining > 0
            ? `PIN incorrecto. Te quedan ${remaining} intento(s).`
            : "Invitación bloqueada por demasiados intentos. Contacta a RRHH.",
      };
    }
  }

  await prisma.$transaction([
    prisma.invitation.update({
      where: { id: invitation.id },
      data: { isUsed: true, usedAt: new Date(), attempts: 0 },
    }),
    prisma.user.update({
      where: { id: invitation.userId },
      data: { lastLoginAt: new Date() },
    }),
    prisma.courseProgress.upsert({
      where: {
        userId_courseId: {
          userId: invitation.userId,
          courseId: invitation.courseId,
        },
      },
      create: {
        userId: invitation.userId,
        courseId: invitation.courseId,
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
      update: {},
    }),
  ]);

  return {
    ok: true,
    invitationId: invitation.id,
    courseId: invitation.courseId,
    user: {
      id: invitation.user.id,
      name: invitation.user.name,
      email: invitation.user.email,
      role: invitation.user.role,
      positionSlug: invitation.user.position?.slug ?? null,
      positionName: invitation.user.position?.name ?? null,
      institutionId: invitation.user.institutionId,
    },
  };
}

/** Reemite una invitación existente con nuevo token/PIN y nueva vigencia. */
export async function reissueInvitation(
  invitationId: string,
  institutionId: string,
  expiresInHours: number,
  createdById: string,
): Promise<IssuedInvitation> {
  const previous = await prisma.invitation.findFirst({
    where: { id: invitationId, institutionId },
    include: { user: true, course: { include: { institution: true } } },
  });

  if (!previous) throw new Error("La invitación no existe en este colegio.");

  const { token, tokenHash } = generateInvitationToken();
  const requiresPin = previous.requiresPin;
  const pin = requiresPin ? generatePin() : null;
  const pinHash = pin ? await hashSecret(pin) : null;
  const expiresAt = invitationExpiryDate(expiresInHours);

  const created = await prisma.$transaction(async (tx) => {
    await tx.invitation.update({
      where: { id: previous.id },
      data: { expiresAt: new Date() },
    });
    return tx.invitation.create({
      data: {
        userId: previous.userId,
        courseId: previous.courseId,
        institutionId,
        tokenHash,
        pinHash,
        requiresPin,
        sentToEmail: previous.sentToEmail,
        ccEmails: previous.ccEmails,
        expiresAt,
        createdById,
      },
    });
  });

  const link = buildInvitationLink(token);
  const targetEmail = previous.sentToEmail || previous.user.email;
  const isForJefe = targetEmail !== previous.user.email;
  const ccList = previous.ccEmails ? previous.ccEmails.split(",").map((c) => c.trim()) : [];

  const mail = invitationEmail({
    name: previous.user.name,
    recipientName: isForJefe ? "Jefatura" : previous.user.name,
    isForJefe,
    institutionName: previous.course.institution.name,
    institutionLogoUrl: previous.course.institution.logoUrl,
    courseTitle: previous.course.title,
    link,
    pin,
    expiresAt,
  });

  const emailSent = await sendMail({
    to: targetEmail,
    cc: ccList.length > 0 ? ccList : undefined,
    institutionDomain: previous.course.institution.domain,
    ...mail,
  });

  return {
    invitationId: created.id,
    userId: previous.userId,
    email: previous.user.email,
    name: previous.user.name,
    pin,
    requiresPin,
    token,
    link,
    sentToEmail: targetEmail,
    ccEmails: ccList,
    expiresAt,
    emailSent,
  };
}
