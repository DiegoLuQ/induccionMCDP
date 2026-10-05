import path from "path";

/** Carpeta física de los videos subidos (montada como volumen en Docker). */
export const VIDEO_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "videos");

/** Prefijo público con el que se guardan las URLs de los videos subidos. */
export const VIDEO_PUBLIC_PREFIX = "/uploads/videos/";

/**
 * Los videos sin uso más recientes que esto no se pueden eliminar: pueden
 * pertenecer a un curso que se está editando y aún no se ha guardado.
 */
export const ORPHAN_VIDEO_MIN_AGE_MS = 24 * 60 * 60 * 1000;

/** Extrae el nombre de archivo de una URL `/uploads/videos/...` (relativa o absoluta). */
export function videoFilenameFromUrl(url: string): string | null {
  const index = url.indexOf(VIDEO_PUBLIC_PREFIX);
  if (index === -1) return null;
  const rest = url.slice(index + VIDEO_PUBLIC_PREFIX.length).split(/[?#]/)[0] ?? "";
  try {
    return decodeURIComponent(rest) || null;
  } catch {
    return rest || null;
  }
}

/** Nombre de archivo plano y seguro (sin rutas ni archivos ocultos). */
export function isSafeVideoFilename(name: string): boolean {
  return name === path.basename(name) && !name.startsWith(".") && name.length > 0;
}
