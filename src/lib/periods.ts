/**
 * Períodos de un curso. Se guardan como entero para no cambiar el esquema:
 *   - Año simple (ej. 2026)            -> primer período de ese año: "2026".
 *   - año * 100 + n (ej. 202602)       -> n-ésimo período del año: "2026 · 2".
 * Así se pueden abrir varios períodos en el mismo año y siguen ordenándose bien.
 */

export function periodYear(code: number): number {
  return code >= 100000 ? Math.floor(code / 100) : code;
}

/** 1 para el año simple; n para año*100+n. */
export function periodSeq(code: number): number {
  return code >= 100000 ? code % 100 : 1;
}

/** Clave comparable: (año, número de período). */
export function periodOrder(code: number): number {
  return periodYear(code) * 100 + periodSeq(code);
}

export function formatPeriod(code: number): string {
  const seq = periodSeq(code);
  return seq <= 1 ? String(periodYear(code)) : `${periodYear(code)} · ${seq}`;
}

/**
 * Código del próximo período para el año elegido, considerando el vigente y
 * los ya usados (archivados). Devuelve null si el año es anterior al vigente.
 */
export function nextPeriodCode(current: number, year: number, usedCodes: number[]): number | null {
  if (!Number.isInteger(year) || year < periodYear(current)) return null;
  const used = [current, ...usedCodes].filter((c) => periodYear(c) === year);
  if (used.length === 0) return year;
  const nextSeq = Math.max(...used.map(periodSeq)) + 1;
  if (nextSeq > 99) return null;
  return year * 100 + nextSeq;
}
