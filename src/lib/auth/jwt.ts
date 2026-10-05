import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { Role } from "@prisma/client";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/constants";

/**
 * Payload de sesión. Se mantiene deliberadamente pequeño: sólo lo que el
 * middleware (edge runtime) necesita para autorizar rutas sin tocar la BD.
 */
export interface SessionPayload extends JWTPayload {
  sub: string;
  name: string;
  email: string;
  role: Role;
  /** Slug del cargo (catálogo del colegio). Null si no tiene cargo asignado. */
  positionSlug: string | null;
  /** Nombre del cargo, para mostrar sin consultar la BD. */
  positionName: string | null;
  /** Colegio activo en el selector global. */
  institutionId: string;
  /** Colegios a los que el usuario tiene acceso. */
  institutionIds: string[];
}

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET no está definido o es demasiado corto (mínimo 32 caracteres).",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(
  payload: Omit<SessionPayload, "iat" | "exp">,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("induccion-capacitacion")
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

/** Verifica el JWT. Devuelve null ante cualquier error (expirado, alterado…). */
export async function verifySession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, getSecretKey(), {
      issuer: "induccion-capacitacion",
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    return null;
  }
}
