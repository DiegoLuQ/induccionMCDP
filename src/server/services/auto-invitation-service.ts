import "server-only";

import { prisma } from "@/lib/prisma";
import { getAreas } from "@/server/queries/catalog";
import {
  issueConsolidatedInvitations,
  type IssueConsolidatedResult,
} from "@/server/services/invitation-service";
import type { JefaturaGroupInput } from "@/lib/validations/invitation";
import { Role } from "@prisma/client";

export interface AutoInvitationConfigDTO {
  id?: string;
  institutionId: string;
  isEnabled: boolean;
  scheduledTime: string;
  courseId: string | null;
  courseTitle?: string | null;
  sendToJefe: boolean;
  customCcEmails: string;
  lastRunAt: Date | null;
  lastRunStatus: string | null;
}

/** Fila de `auto_invitation_configs` leída por SQL directo (fallback). */
type RawAutoInvitationConfigRow = {
  id: string;
  institutionId: string;
  isEnabled: number | boolean;
  scheduledTime: string | null;
  courseId: string | null;
  courseTitle: string | null;
  sendToJefe: number | boolean;
  customCcEmails: string | null;
  lastRunAt: Date | string | null;
  lastRunStatus: string | null;
};

/** Configuración debida a ejecutar, venga del delegado Prisma o del SQL directo. */
type DueAutoInvitationConfig = {
  institutionId: string;
  lastRunAt: Date | string | null;
  institution?: { isActive: boolean };
  institutionIsActive?: number | boolean;
};

/**
 * Helper interno que obtiene o inicializa la configuración de automatización
 * de manera resiliente (usando delegado de Prisma o SQL directo si el engine de Node
 * aún no ha reiniciado).
 */
export async function getAutoInvitationConfig(
  institutionId: string,
): Promise<AutoInvitationConfigDTO> {
  try {
    if (prisma.autoInvitationConfig) {
      const config = await prisma.autoInvitationConfig.findUnique({
        where: { institutionId },
        include: {
          course: { select: { id: true, title: true } },
        },
      });

      if (!config) {
        return {
          institutionId,
          isEnabled: false,
          scheduledTime: "09:00",
          courseId: null,
          courseTitle: null,
          sendToJefe: true,
          customCcEmails: "",
          lastRunAt: null,
          lastRunStatus: null,
        };
      }

      return {
        id: config.id,
        institutionId: config.institutionId,
        isEnabled: config.isEnabled,
        scheduledTime: config.scheduledTime,
        courseId: config.courseId,
        courseTitle: config.course?.title ?? null,
        sendToJefe: config.sendToJefe,
        customCcEmails: config.customCcEmails ?? "",
        lastRunAt: config.lastRunAt,
        lastRunStatus: config.lastRunStatus,
      };
    }
  } catch {
    // Si falla el delegado Prisma, usar consulta SQL directa
  }

  // Fallback SQL directo resiliente
  try {
    const rows = await prisma.$queryRawUnsafe<RawAutoInvitationConfigRow[]>(
      `SELECT a.*, c.title AS courseTitle 
       FROM auto_invitation_configs a 
       LEFT JOIN courses c ON c.id = a.courseId 
       WHERE a.institutionId = ? LIMIT 1`,
      institutionId,
    );

    const r = rows?.[0];
    if (!r) {
      return {
        institutionId,
        isEnabled: false,
        scheduledTime: "09:00",
        courseId: null,
        courseTitle: null,
        sendToJefe: true,
        customCcEmails: "",
        lastRunAt: null,
        lastRunStatus: null,
      };
    }

    return {
      id: r.id,
      institutionId: r.institutionId,
      isEnabled: Boolean(r.isEnabled),
      scheduledTime: r.scheduledTime || "09:00",
      courseId: r.courseId,
      courseTitle: r.courseTitle,
      sendToJefe: Boolean(r.sendToJefe),
      customCcEmails: r.customCcEmails ?? "",
      lastRunAt: r.lastRunAt ? new Date(r.lastRunAt) : null,
      lastRunStatus: r.lastRunStatus,
    };
  } catch (err) {
    console.error("[auto-invitations] Error obteniendo configuración:", err);
    return {
      institutionId,
      isEnabled: false,
      scheduledTime: "09:00",
      courseId: null,
      courseTitle: null,
      sendToJefe: true,
      customCcEmails: "",
      lastRunAt: null,
      lastRunStatus: null,
    };
  }
}

/**
 * Guarda o actualiza la configuración del disparador automático.
 */
export async function upsertAutoInvitationConfig(
  institutionId: string,
  data: {
    isEnabled: boolean;
    scheduledTime: string;
    courseId: string | null;
    sendToJefe: boolean;
    customCcEmails?: string;
  },
): Promise<AutoInvitationConfigDTO> {
  try {
    if (prisma.autoInvitationConfig) {
      const updated = await prisma.autoInvitationConfig.upsert({
        where: { institutionId },
        create: {
          institutionId,
          isEnabled: data.isEnabled,
          scheduledTime: data.scheduledTime || "09:00",
          courseId: data.courseId || null,
          sendToJefe: data.sendToJefe,
          customCcEmails: data.customCcEmails?.trim() || null,
        },
        update: {
          isEnabled: data.isEnabled,
          scheduledTime: data.scheduledTime || "09:00",
          courseId: data.courseId || null,
          sendToJefe: data.sendToJefe,
          customCcEmails: data.customCcEmails?.trim() || null,
        },
        include: {
          course: { select: { id: true, title: true } },
        },
      });

      return {
        id: updated.id,
        institutionId: updated.institutionId,
        isEnabled: updated.isEnabled,
        scheduledTime: updated.scheduledTime,
        courseId: updated.courseId,
        courseTitle: updated.course?.title ?? null,
        sendToJefe: updated.sendToJefe,
        customCcEmails: updated.customCcEmails ?? "",
        lastRunAt: updated.lastRunAt,
        lastRunStatus: updated.lastRunStatus,
      };
    }
  } catch {
    // Si falla el delegado, continuar con fallback SQL
  }

  // Fallback SQL directo
  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM auto_invitation_configs WHERE institutionId = ? LIMIT 1`,
    institutionId,
  );

  if (existing && existing.length > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE auto_invitation_configs 
       SET isEnabled = ?, scheduledTime = ?, courseId = ?, sendToJefe = ?, customCcEmails = ?, updatedAt = NOW()
       WHERE institutionId = ?`,
      data.isEnabled ? 1 : 0,
      data.scheduledTime || "09:00",
      data.courseId || null,
      data.sendToJefe ? 1 : 0,
      data.customCcEmails?.trim() || null,
      institutionId,
    );
  } else {
    const newId = `aic_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO auto_invitation_configs 
       (id, institutionId, isEnabled, scheduledTime, courseId, sendToJefe, customCcEmails, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      newId,
      institutionId,
      data.isEnabled ? 1 : 0,
      data.scheduledTime || "09:00",
      data.courseId || null,
      data.sendToJefe ? 1 : 0,
      data.customCcEmails?.trim() || null,
    );
  }

  return getAutoInvitationConfig(institutionId);
}

export interface RunAutoInvitationsResult {
  success: boolean;
  message: string;
  count: number;
  groupsCount: number;
  result?: IssueConsolidatedResult;
}

/**
 * Ejecuta el proceso de invitaciones automáticas para un colegio:
 * 1. Busca funcionarios sin inducción en el curso configurado.
 * 2. Aplica filtro antispam (ignora si ya tienen invitación vigente reciente).
 * 3. Agrupa por jefatura y despacha los correos consolidados.
 * 4. Actualiza la fecha y estado de última ejecución.
 */
export async function executeAutoInvitations(
  institutionId: string,
  triggeredById?: string,
): Promise<RunAutoInvitationsResult> {
  const config = await getAutoInvitationConfig(institutionId);

  if (!config.courseId) {
    return {
      success: false,
      message: "Debes seleccionar una inducción activa en la configuración antes de ejecutar.",
      count: 0,
      groupsCount: 0,
    };
  }

  const course = await prisma.course.findFirst({
    where: { id: config.courseId, institutionId },
    include: { institution: true },
  });

  if (!course) {
    return {
      success: false,
      message: "El curso configurado no existe o no pertenece a este colegio.",
      count: 0,
      groupsCount: 0,
    };
  }

  if (!course.isPublished) {
    return {
      success: false,
      message: `El curso configurado "${course.title}" no está publicado.`,
      count: 0,
      groupsCount: 0,
    };
  }

  const now = new Date();

  // Buscar funcionarios activos sin progreso en este curso
  // Y sin invitación vigente emitida para este curso
  const pendingStaff = await prisma.user.findMany({
    where: {
      institutionId,
      isActive: true,
      role: Role.FUNCIONARIO,
      // No debe tener progreso en este curso
      courseProgress: {
        none: {
          courseId: course.id,
        },
      },
      // Control antiduplicidad: No tener invitaciones vigentes para este curso
      invitations: {
        none: {
          courseId: course.id,
          expiresAt: { gt: now },
        },
      },
    },
    select: {
      id: true,
      rut: true,
      name: true,
      email: true,
      positionId: true,
      areaId: true,
      area: {
        select: {
          id: true,
          name: true,
          jefeNombre: true,
          jefeEmail: true,
          asistenteEmail: true,
        },
      },
    },
  });

  if (pendingStaff.length === 0) {
    const statusMsg = "Sin funcionarios nuevos pendientes para la inducción.";
    await updateLastRunStatus(institutionId, now, statusMsg);

    return {
      success: true,
      message: statusMsg,
      count: 0,
      groupsCount: 0,
    };
  }

  // Cargar catálogo de áreas para resolver asignaciones por cargo
  const areas = await getAreas(institutionId, true);

  // Helper para resolver jefatura
  const resolveJefatura = (staff: (typeof pendingStaff)[0]) => {
    let foundArea = areas.find((a) => a.id === staff.areaId);

    if ((!foundArea || !foundArea.jefeEmail) && staff.positionId) {
      const areaByPos = areas.find((a) =>
        a.users?.some((u) => u.positionId === staff.positionId),
      );
      if (areaByPos) foundArea = areaByPos;
    }

    return {
      areaId: foundArea?.id || staff.areaId || "",
      areaName: foundArea?.name || staff.area?.name || "Sin Jefatura Asignada",
      jefeNombre: foundArea?.jefeNombre || staff.area?.jefeNombre || "",
      jefeEmail: foundArea?.jefeEmail || staff.area?.jefeEmail || "",
      asistenteEmail: foundArea?.asistenteEmail || staff.area?.asistenteEmail || "",
    };
  };

  // Agrupar los funcionarios
  const groupMap = new Map<
    string,
    {
      areaId: string;
      areaName: string;
      jefeNombre: string;
      jefeEmail: string;
      asistenteEmail: string;
      staff: (typeof pendingStaff);
    }
  >();

  for (const s of pendingStaff) {
    const info = resolveJefatura(s);
    const key = info.areaId || "_sin_jefatura";

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        areaId: info.areaId,
        areaName: info.areaName,
        jefeNombre: info.jefeNombre,
        jefeEmail: info.jefeEmail,
        asistenteEmail: info.asistenteEmail,
        staff: [],
      });
    }

    groupMap.get(key)!.staff.push(s);
  }

  // Construir grupos para la emisión consolidada
  const groupsPayload: JefaturaGroupInput[] = [];

  for (const grp of Array.from(groupMap.values())) {
    groupsPayload.push({
      areaId: grp.areaId,
      areaName: grp.areaName,
      jefeNombre: grp.jefeNombre,
      jefeEmail: grp.jefeEmail,
      asistenteEmail: grp.asistenteEmail,
      sendToJefe: config.sendToJefe && Boolean(grp.jefeEmail),
      ccAsistente: Boolean(grp.asistenteEmail),
      ccFuncionario: false,
      customCcEmails: config.customCcEmails || "",
      invitees: grp.staff.map((s) => ({
        userId: s.id,
        rut: s.rut,
        name: s.name,
        email: s.email,
        positionId: s.positionId || "",
        areaId: grp.areaId,
        sendToJefe: config.sendToJefe && Boolean(grp.jefeEmail),
        jefeNombre: grp.jefeNombre,
        jefeEmail: grp.jefeEmail,
        ccAsistente: Boolean(grp.asistenteEmail),
        asistenteEmail: grp.asistenteEmail,
        ccFuncionario: false,
        customCcEmails: config.customCcEmails || "",
      })),
    });
  }

  // Determinar ID del creador (admin del colegio o triggeredById)
  let creatorId = triggeredById;
  if (!creatorId) {
    const admin = await prisma.user.findFirst({
      where: {
        institutionId,
        role: { in: [Role.SUPER_ADMIN, Role.ADMIN_RRHH] },
      },
      select: { id: true },
    });
    creatorId = admin?.id || "system";
  }

  // Ejecutar emisión consolidada con envío de correo
  const result = await issueConsolidatedInvitations({
    courseId: course.id,
    institutionId,
    groups: groupsPayload,
    requiresPin: true,
    expiresInHours: 48,
    createdById: creatorId,
    sendEmail: true,
  });

  const summaryMsg = `Exitoso: Se emitieron ${result.totalIssued} invitaciones en ${result.groups.length} área(s).`;
  await updateLastRunStatus(institutionId, now, summaryMsg);

  return {
    success: true,
    message: summaryMsg,
    count: result.totalIssued,
    groupsCount: result.groups.length,
    result,
  };
}

async function updateLastRunStatus(
  institutionId: string,
  now: Date,
  status: string,
) {
  try {
    if (prisma.autoInvitationConfig) {
      await prisma.autoInvitationConfig.update({
        where: { institutionId },
        data: {
          lastRunAt: now,
          lastRunStatus: status,
        },
      });
      return;
    }
  } catch {
    // fallback
  }

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE auto_invitation_configs SET lastRunAt = ?, lastRunStatus = ? WHERE institutionId = ?`,
      now,
      status,
      institutionId,
    );
  } catch (err) {
    console.error("[auto-invitations] Error actualizando lastRunStatus:", err);
  }
}

/**
 * Ejecuta las automatizaciones pendientes para todas las instituciones activas.
 * Compara la hora local (America/Santiago) con `scheduledTime`.
 */
export async function runAllDueAutoInvitations(): Promise<{
  processed: number;
  results: Array<{ institutionId: string; status: string }>;
}> {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const currentFormattedTime = formatter.format(now);

  let activeConfigs: DueAutoInvitationConfig[] = [];
  try {
    if (prisma.autoInvitationConfig) {
      activeConfigs = await prisma.autoInvitationConfig.findMany({
        where: {
          isEnabled: true,
          scheduledTime: currentFormattedTime,
          courseId: { not: null },
        },
        include: {
          institution: { select: { id: true, name: true, isActive: true } },
        },
      });
    } else {
      activeConfigs = await prisma.$queryRawUnsafe<DueAutoInvitationConfig[]>(
        `SELECT a.*, i.name AS institutionName, i.isActive AS institutionIsActive 
         FROM auto_invitation_configs a
         INNER JOIN institutions i ON i.id = a.institutionId
         WHERE a.isEnabled = 1 AND a.scheduledTime = ? AND a.courseId IS NOT NULL`,
        currentFormattedTime,
      );
    }
  } catch (err) {
    console.error("[auto-invitations] Error buscando configuraciones debidas:", err);
  }

  const results: Array<{ institutionId: string; status: string }> = [];

  for (const cfg of activeConfigs) {
    const isActive =
      cfg.institution?.isActive !== undefined
        ? cfg.institution.isActive
        : Boolean(cfg.institutionIsActive);
    if (!isActive) continue;

    if (cfg.lastRunAt) {
      const hoursSinceLastRun =
        (now.getTime() - new Date(cfg.lastRunAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastRun < 20) {
        continue;
      }
    }

    try {
      const res = await executeAutoInvitations(cfg.institutionId);
      results.push({
        institutionId: cfg.institutionId,
        status: res.message,
      });
    } catch (err) {
      console.error(
        `[auto-invitations] Error procesando colegio ${cfg.institutionId}:`,
        err,
      );
      results.push({
        institutionId: cfg.institutionId,
        status: err instanceof Error ? err.message : "Error inesperado",
      });
    }
  }

  return {
    processed: results.length,
    results,
  };
}
