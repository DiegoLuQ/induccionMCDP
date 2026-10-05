import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@prisma/client";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { signSession, verifySession, type SessionPayload } from "./jwt";

export type { SessionPayload };

/** Crea la cookie de sesión HTTP-only. */
export async function createSession(
  payload: Omit<SessionPayload, "iat" | "exp">,
): Promise<void> {
  const token = await signSession(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Sesión actual (memoizada por request). No consulta la BD: el JWT firmado es
 * la fuente de verdad para identidad; los datos sensibles se re-verifican en
 * cada Server Action contra la BD.
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const cookieStore = await cookies();
  return verifySession(cookieStore.get(SESSION_COOKIE)?.value);
});

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Exige uno de los roles indicados; redirige a /denegado si no cumple. */
export async function requireRole(
  ...roles: Role[]
): Promise<SessionPayload> {
  const session = await requireSession();
  if (!roles.includes(session.role)) redirect("/denegado");
  return session;
}

/** Usuario completo desde BD (memoizado). Útil en páginas de perfil/config. */
export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  return prisma.user.findUnique({
    where: { id: session.sub },
    include: { institution: true },
  });
});

/**
 * Cambia el colegio activo del selector global, validando que el usuario
 * efectivamente tenga acceso a ese tenant.
 */
export async function setActiveInstitution(
  institutionId: string,
): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  if (!session.institutionIds.includes(institutionId)) return false;
  await createSession({ ...session, institutionId });
  return true;
}

/** Colegios a los que el usuario tiene acceso (home tenant + membresías). */
export async function buildInstitutionIds(userId: string, homeInstitutionId: string) {
  const memberships = await prisma.institutionMembership.findMany({
    where: { userId },
    select: { institutionId: true },
  });
  return Array.from(
    new Set([homeInstitutionId, ...memberships.map((m) => m.institutionId)]),
  );
}
