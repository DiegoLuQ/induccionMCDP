import { isProvisionalEmail } from "@/lib/provisional-email";

/**
 * Correo personal del funcionario (gmail, hotmail, outlook, etc.). Se guarda en
 * `User.email` y es adonde se envía el enlace para firmar la constancia.
 * Cualquier dominio sirve, salvo el del colegio: ese es el institucional.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PERSONAL_EMAIL_DOMAIN_MESSAGE =
  "Ese es un correo del colegio. Ingresa tu correo personal (gmail, hotmail, outlook, etc.).";

/** null si es válido como correo personal; si no, el motivo. */
export function personalEmailError(
  email: string | null | undefined,
  institutionDomain: string,
): string | null {
  const value = (email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(value)) return "Ingresa un correo personal válido.";
  if (isProvisionalEmail(value)) return "Ingresa tu correo personal real.";
  const domain = value.split("@")[1] ?? "";
  const school = institutionDomain.trim().toLowerCase();
  if (school && (domain === school || domain.endsWith(`.${school}`))) {
    return PERSONAL_EMAIL_DOMAIN_MESSAGE;
  }
  return null;
}

export function hasPersonalEmail(
  email: string | null | undefined,
  institutionDomain: string,
): boolean {
  return personalEmailError(email, institutionDomain) === null;
}
