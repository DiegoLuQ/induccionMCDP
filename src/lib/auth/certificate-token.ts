import "server-only";

import { SignJWT, jwtVerify } from "jose";

/**
 * Enlace temporal para descargar la Constancia de Participación desde el correo
 * de jefatura, sin iniciar sesión. Es un JWT firmado con AUTH_SECRET: no se
 * puede adivinar ni alterar, y vence solo (no requiere tabla en la BD).
 */

const ISSUER = "induccion-capacitacion";
const AUDIENCE = "constancia";
export const CERTIFICATE_LINK_TTL_DAYS = 7;

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET no está definido o es demasiado corto (mínimo 32 caracteres).");
  }
  return new TextEncoder().encode(secret);
}

export async function signCertificateToken(params: {
  userId: string;
  courseId: string;
}): Promise<string> {
  return new SignJWT({ cid: params.courseId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${CERTIFICATE_LINK_TTL_DAYS}d`)
    .sign(getSecretKey());
}

export type CertificateTokenResult =
  | { ok: true; userId: string; courseId: string }
  | { ok: false; reason: "expired" | "invalid" };

export async function verifyCertificateToken(token: string | null): Promise<CertificateTokenResult> {
  if (!token) return { ok: false, reason: "invalid" };
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string" || typeof payload.cid !== "string") {
      return { ok: false, reason: "invalid" };
    }
    return { ok: true, userId: payload.sub, courseId: payload.cid };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    return { ok: false, reason: code === "ERR_JWT_EXPIRED" ? "expired" : "invalid" };
  }
}

/** URL absoluta de descarga, para incluir en el correo. */
export async function buildCertificateLink(params: { userId: string; courseId: string }): Promise<string> {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/constancia?t=${await signCertificateToken(params)}`;
}
