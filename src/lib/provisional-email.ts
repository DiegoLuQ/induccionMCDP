/**
 * Correo institucional "provisorio": el que genera la sincronización con el
 * RUT (ej. 12612299@colegiodiegoportales.cl o 12612299.k@...). No es un
 * correo real, así que se pide al funcionario cambiarlo por su correo
 * institucional verdadero (ej. nombre.apellido@colegio.cl).
 */
export function isProvisionalEmail(email: string | null | undefined): boolean {
  if (!email || !email.includes("@")) return false;
  const local = email.split("@")[0] ?? "";
  return /^[0-9]+(\.[0-9kK])?$/.test(local);
}

export const PROVISIONAL_EMAIL_MESSAGE =
  "Ese correo es provisorio (generado con tu RUT). Ingresa tu correo institucional real, por ejemplo nombre.apellido.";
