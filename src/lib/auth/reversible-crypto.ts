import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Cifrado reversible (AES-256-GCM) para el PIN y el token de invitación que
 * se muestran en el portal de jefatura. La clave se deriva de AUTH_SECRET con
 * una etiqueta propia, así no se reutiliza la clave de las sesiones.
 */

function getKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET no está definido o es demasiado corto (mínimo 32 caracteres).");
  }
  return createHash("sha256").update(`invitation-portal:${secret}`).digest();
}

/** Devuelve iv|tag|cifrado en base64url. */
export function encryptText(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

/** null si el valor no existe, fue alterado o se cifró con otro secreto. */
export function decryptText(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const raw = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", getKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
