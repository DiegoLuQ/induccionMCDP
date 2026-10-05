import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";

/**
 * Genera el token de invitación que viaja en el enlace
 * (`/auth/invitation?token=...`). Sólo se persiste su SHA-256.
 */
export function generateInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** PIN numérico de 6 dígitos con entropía criptográfica (000000-999999). */
export function generatePin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Comparación en tiempo constante para strings de igual longitud esperada. */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function invitationExpiryDate(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}
