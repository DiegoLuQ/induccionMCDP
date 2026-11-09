import "server-only";

import { SignJWT, jwtVerify } from "jose";

/**
 * Enlace para firmar la Constancia de Participación, enviado al correo personal
 * del funcionario. Vence en 24 h. Lleva el correo al que se envió: si el
 * funcionario cambia su correo personal, los enlaces anteriores dejan de servir.
 */

const ISSUER = "induccion-capacitacion";
const AUDIENCE = "firma-constancia";
export const SIGNATURE_LINK_TTL_HOURS = 24;

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET no está definido o es demasiado corto (mínimo 32 caracteres).");
  }
  return new TextEncoder().encode(secret);
}

export async function signSignatureToken(params: {
  userId: string;
  courseId: string;
  email: string;
}): Promise<string> {
  return new SignJWT({ cid: params.courseId, em: params.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SIGNATURE_LINK_TTL_HOURS}h`)
    .sign(getSecretKey());
}

export type SignatureTokenResult =
  | { ok: true; userId: string; courseId: string; email: string; expiresAt: Date }
  | { ok: false; reason: "expired" | "invalid" };

export async function verifySignatureToken(token: string | null | undefined): Promise<SignatureTokenResult> {
  if (!token) return { ok: false, reason: "invalid" };
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.cid !== "string" ||
      typeof payload.em !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return { ok: false, reason: "invalid" };
    }
    return {
      ok: true,
      userId: payload.sub,
      courseId: payload.cid,
      email: payload.em,
      expiresAt: new Date(payload.exp * 1000),
    };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    return { ok: false, reason: code === "ERR_JWT_EXPIRED" ? "expired" : "invalid" };
  }
}
