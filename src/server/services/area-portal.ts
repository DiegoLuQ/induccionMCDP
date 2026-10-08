import "server-only";

import { randomInt } from "crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { hashSecret, verifySecret } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/rbac";

/**
 * Portal de jefatura: /induccion/[colegio]-[área] muestra a la jefatura y al
 * asistente los accesos vigentes (nombre, RUT, PIN, enlace, constancia) de su
 * área, protegido por una clave que llega en el correo de invitaciones.
 */

export const PORTAL_MAX_ATTEMPTS = 5;
const PORTAL_LOCK_MINUTES = 15;
const PORTAL_SESSION_HOURS = 12;
const PORTAL_COOKIE = "ic_portal";
const KEY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin 0/O, 1/I/L

const STOP_WORDS = new Set(["colegio", "escuela", "liceo", "de", "del", "la", "el", "los", "las"]);

function slugPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** "Colegio Diego Portales" -> "dp"; "Colegio Macaya" -> "mc". */
function deriveShortCode(name: string): string {
  const words = name
    .split(/\s+/)
    .map(slugPart)
    .filter((w) => w && !STOP_WORDS.has(w));
  if (words.length >= 2) return words.map((w) => w[0]).join("").slice(0, 4);
  const word = words[0] ?? "col";
  const consonant = word.slice(1).match(/[bcdfghjklmnpqrstvwxyz]/)?.[0] ?? word[1] ?? "x";
  return `${word[0]}${consonant}`;
}

/** Código corto del colegio; se calcula y guarda la primera vez (único). */
export async function ensureInstitutionShortCode(institutionId: string): Promise<string> {
  const institution = await prisma.institution.findUniqueOrThrow({
    where: { id: institutionId },
    select: { name: true, shortCode: true },
  });
  if (institution.shortCode) return institution.shortCode;

  const base = deriveShortCode(institution.name);
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}${i + 1}`;
    const taken = await prisma.institution.findFirst({ where: { shortCode: candidate }, select: { id: true } });
    if (!taken) {
      await prisma.institution.update({ where: { id: institutionId }, data: { shortCode: candidate } });
      return candidate;
    }
  }
  throw new Error("No se pudo asignar un código corto al colegio.");
}

export function buildPortalUrl(shortCode: string, areaSlug: string): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/induccion/${shortCode}-${areaSlug}`;
}

/** Genera una clave nueva (ej. "K7MP-3QXT"), invalida la anterior y la devuelve en claro. */
export async function rotateAreaPortalKey(areaId: string): Promise<string> {
  const raw = Array.from({ length: 8 }, () => KEY_ALPHABET[randomInt(KEY_ALPHABET.length)]).join("");
  const key = `${raw.slice(0, 4)}-${raw.slice(4)}`;
  await prisma.area.update({
    where: { id: areaId },
    data: {
      portalKeyHash: await hashSecret(key),
      portalKeyIssuedAt: new Date(),
      portalFailedAttempts: 0,
      portalLockedUntil: null,
    },
  });
  return key;
}

/** Busca el área de un código "dp-utp" (código corto del colegio + slug del área). */
export async function findAreaByPortalCode(code: string) {
  const match = /^([a-z0-9]+)-([a-z0-9-]+)$/.exec(code.toLowerCase());
  if (!match) return null;
  const [, shortCode, areaSlug] = match;
  return prisma.area.findFirst({
    where: { slug: areaSlug, institution: { shortCode, isActive: true } },
    select: {
      id: true,
      name: true,
      slug: true,
      institutionId: true,
      portalKeyHash: true,
      portalKeyIssuedAt: true,
      portalFailedAttempts: true,
      portalLockedUntil: true,
      institution: { select: { name: true, shortCode: true, logoUrl: true } },
    },
  });
}

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? "");
}

/** Valida la clave; con éxito deja una cookie de acceso al portal por 12 h. */
export async function verifyAreaPortalKey(
  code: string,
  key: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const area = await findAreaByPortalCode(code);
  if (!area || !area.portalKeyHash || !area.portalKeyIssuedAt) {
    return { ok: false, message: "Esta área aún no tiene una clave de acceso. Solicítala a Recursos Humanos." };
  }
  if (area.portalLockedUntil && area.portalLockedUntil > new Date()) {
    return { ok: false, message: `Demasiados intentos. Vuelve a intentarlo en ${PORTAL_LOCK_MINUTES} minutos.` };
  }

  const normalized = key.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const formatted = `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
  const valid = normalized.length === 8 && (await verifySecret(formatted, area.portalKeyHash));

  if (!valid) {
    const attempts = area.portalFailedAttempts + 1;
    await prisma.area.update({
      where: { id: area.id },
      data: {
        portalFailedAttempts: attempts >= PORTAL_MAX_ATTEMPTS ? 0 : attempts,
        portalLockedUntil:
          attempts >= PORTAL_MAX_ATTEMPTS ? new Date(Date.now() + PORTAL_LOCK_MINUTES * 60_000) : null,
      },
    });
    return attempts >= PORTAL_MAX_ATTEMPTS
      ? { ok: false, message: `Clave incorrecta. Acceso bloqueado por ${PORTAL_LOCK_MINUTES} minutos.` }
      : { ok: false, message: `Clave incorrecta. Te quedan ${PORTAL_MAX_ATTEMPTS - attempts} intento(s).` };
  }

  await prisma.area.update({ where: { id: area.id }, data: { portalFailedAttempts: 0, portalLockedUntil: null } });

  const token = await new SignJWT({ kiat: area.portalKeyIssuedAt.getTime() })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(area.id)
    .setIssuer("induccion-capacitacion")
    .setAudience("area-portal")
    .setIssuedAt()
    .setExpirationTime(`${PORTAL_SESSION_HOURS}h`)
    .sign(getSecretKey());

  (await cookies()).set(PORTAL_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/induccion",
    maxAge: PORTAL_SESSION_HOURS * 3600,
  });
  return { ok: true };
}

/** true si la cookie da acceso a esta área y la clave no ha cambiado desde entonces. */
export async function hasPortalAccess(area: { id: string; portalKeyIssuedAt: Date | null }): Promise<boolean> {
  const token = (await cookies()).get(PORTAL_COOKIE)?.value;
  if (!token || !area.portalKeyIssuedAt) return false;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: "induccion-capacitacion",
      audience: "area-portal",
      algorithms: ["HS256"],
    });
    return payload.sub === area.id && payload.kiat === area.portalKeyIssuedAt.getTime();
  } catch {
    return false;
  }
}

export type PortalAccessStatus = "PENDING" | "USED" | "BLOCKED";

export interface PortalAccessRow {
  invitationId: string;
  name: string;
  rut: string;
  courseTitle: string;
  pin: string | null;
  link: string | null;
  status: PortalAccessStatus;
  expiresAt: Date;
  certificateUrl: string;
  /** Constancia firmada vigente ya subida (por RRHH o por la jefatura). */
  signed: { uploadedAt: Date; size: number } | null;
}

/**
 * Accesos vigentes del área: la invitación más reciente de cada funcionario y
 * curso que aún no vence. El PIN y el enlace sólo existen mientras no se usa.
 */
export async function getAreaPortalRows(area: { id: string; institutionId: string }): Promise<PortalAccessRow[]> {
  const { MAX_PIN_ATTEMPTS } = await import("@/lib/constants");
  const { buildCertificateLink } = await import("@/lib/auth/certificate-token");
  const { decryptText } = await import("@/lib/auth/reversible-crypto");
  const { buildInvitationLink } = await import("@/server/services/invitation-service");

  const invitations = await prisma.invitation.findMany({
    where: {
      institutionId: area.institutionId,
      expiresAt: { gt: new Date() },
      user: { areaId: area.id, isActive: true },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userId: true,
      courseId: true,
      isUsed: true,
      attempts: true,
      expiresAt: true,
      pinEncrypted: true,
      tokenEncrypted: true,
      user: { select: { name: true, rut: true } },
      course: { select: { title: true } },
    },
  });

  const signed = await prisma.signedCertificate.findMany({
    where: {
      institutionId: area.institutionId,
      archivedPeriod: 0,
      userId: { in: [...new Set(invitations.map((i) => i.userId))] },
    },
    select: { userId: true, courseId: true, updatedAt: true, size: true },
  });
  const signedByKey = new Map(signed.map((c) => [`${c.userId}:${c.courseId}`, c]));

  const seen = new Set<string>();
  const rows: PortalAccessRow[] = [];
  for (const inv of invitations) {
    const key = `${inv.userId}:${inv.courseId}`;
    if (seen.has(key)) continue; // sólo la más reciente
    seen.add(key);
    const token = decryptText(inv.tokenEncrypted);
    rows.push({
      invitationId: inv.id,
      name: inv.user.name,
      rut: inv.user.rut,
      courseTitle: inv.course.title,
      pin: inv.isUsed ? null : decryptText(inv.pinEncrypted),
      link: inv.isUsed || !token ? null : buildInvitationLink(token),
      status: inv.isUsed ? "USED" : inv.attempts >= MAX_PIN_ATTEMPTS ? "BLOCKED" : "PENDING",
      expiresAt: inv.expiresAt,
      certificateUrl: await buildCertificateLink({ userId: inv.userId, courseId: inv.courseId }),
      signed: signedByKey.has(key)
        ? { uploadedAt: signedByKey.get(key)!.updatedAt, size: signedByKey.get(key)!.size }
        : null,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/**
 * Acceso al portal para una acción: la jefatura con su cookie o RRHH/Super
 * Admin del colegio. Devuelve el área y quién actúa (null = jefatura).
 */
export async function resolvePortalActor(code: string) {
  const area = await findAreaByPortalCode(code);
  if (!area) return null;
  const session = await getSession();
  if (session && isAdminRole(session.role) && session.institutionIds.includes(area.institutionId)) {
    return { area, uploadedById: session.sub };
  }
  return (await hasPortalAccess(area)) ? { area, uploadedById: null } : null;
}

/** Invitación del portal, sólo si el funcionario es (activo) de esta área. */
export async function findPortalInvitation(area: { id: string; institutionId: string }, invitationId: string) {
  if (!invitationId) return null;
  return prisma.invitation.findFirst({
    where: { id: invitationId, institutionId: area.institutionId, user: { areaId: area.id, isActive: true } },
    select: {
      userId: true,
      courseId: true,
      user: { select: { name: true } },
      course: { select: { title: true } },
    },
  });
}
