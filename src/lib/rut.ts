/**
 * Utilidades de RUT chileno.
 * Formato canónico almacenado en BD: cuerpo sin puntos + "-" + DV en minúscula
 * cuando corresponde a "k" (ej. "12345678-9", "7654321-k").
 */

export function cleanRut(rut: string): string {
  return rut.replace(/[^0-9kK]/g, "").toUpperCase();
}

export function computeDv(body: string): string {
  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return "0";
  if (remainder === 10) return "K";
  return String(remainder);
}

export function isValidRut(rut: string): boolean {
  const clean = cleanRut(rut);
  if (clean.length < 7 || clean.length > 9) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body)) return false;
  return computeDv(body) === dv;
}

/** "12.345.678-9" -> "12345678-9" (canónico para persistir). */
export function normalizeRut(rut: string): string {
  const clean = cleanRut(rut);
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return `${body}-${dv}`;
}

/** "123456789" -> "12.345.678-9" (para mostrar en UI). */
export function formatRut(rut: string): string {
  const clean = cleanRut(rut);
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withDots}-${dv}`;
}

/**
 * Intenta normalizar un string si parece un RUT chileno (7 a 9 caracteres alfanuméricos sin arroba).
 * Retorna el RUT normalizado "12345678-9" o null si no califica como RUT.
 */
export function tryNormalizeRut(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.includes("@")) return null;
  const clean = cleanRut(trimmed);
  if (clean.length < 7 || clean.length > 9) return null;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body)) return null;
  return `${body}-${dv}`;
}
