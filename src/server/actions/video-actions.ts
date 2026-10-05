"use server";

import { stat, unlink } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { failure, success, type ActionResult } from "@/lib/validations/common";
import {
  ORPHAN_VIDEO_MIN_AGE_MS,
  VIDEO_UPLOAD_DIR,
  isSafeVideoFilename,
} from "@/lib/uploads";
import { getVideoUsageMap } from "@/server/queries/videos";

/**
 * Elimina videos sin uso de la carpeta de subidas. Vuelve a comprobar en el
 * servidor que ninguna lección los use, así que nunca borra un video asignado
 * aunque la vista del navegador esté desactualizada. Los subidos hace menos de
 * 24 h sólo se borran con `includeRecent` (el administrador lo confirmó).
 */
export async function deleteOrphanVideosAction(
  filenames: string[],
  options: { includeRecent?: boolean } = {},
): Promise<ActionResult<{ deleted: number; freedBytes: number; skipped: SkippedVideo[] }>> {
  const session = await getSession();
  if (session?.role !== Role.SUPER_ADMIN) return failure("Sin permisos.");
  if (!Array.isArray(filenames) || filenames.length === 0) {
    return failure("No se seleccionaron videos.");
  }

  const usageMap = await getVideoUsageMap();
  const now = Date.now();
  let deleted = 0;
  let freedBytes = 0;
  const skipped: SkippedVideo[] = [];

  for (const filename of new Set(filenames)) {
    if (typeof filename !== "string" || !isSafeVideoFilename(filename)) {
      skipped.push({ filename: String(filename), reason: "nombre inválido" });
      continue;
    }
    if (usageMap.has(filename)) {
      skipped.push({ filename, reason: "está en uso por una lección" });
      continue;
    }

    const filePath = path.join(VIDEO_UPLOAD_DIR, filename);
    try {
      const info = await stat(filePath);
      if (!info.isFile()) {
        skipped.push({ filename, reason: "no es un archivo" });
        continue;
      }
      // Los recientes sólo se borran si el administrador lo confirmó explícitamente.
      if (!options.includeRecent && now - info.mtimeMs < ORPHAN_VIDEO_MIN_AGE_MS) {
        skipped.push({ filename, reason: "es reciente" });
        continue;
      }
      await unlink(filePath);
      deleted += 1;
      freedBytes += info.size;
    } catch (error) {
      console.error(`[deleteOrphanVideosAction] No se pudo eliminar ${filename}:`, error);
      const code = (error as NodeJS.ErrnoException)?.code;
      skipped.push({
        filename,
        reason:
          code === "ENOENT"
            ? "ya no existe"
            : code === "EACCES" || code === "EPERM"
              ? `sin permiso de escritura en el servidor (${code})`
              : `error del sistema${code ? ` (${code})` : ""}`,
      });
    }
  }

  revalidatePath("/configuracion/videos");

  const freedMb = (freedBytes / (1024 * 1024)).toFixed(1);
  if (deleted === 0 && skipped.length > 0) {
    return failure(`No se eliminó ningún video: ${summarizeSkipped(skipped)}.`);
  }

  const message =
    skipped.length > 0
      ? `Se eliminaron ${deleted} video(s) (${freedMb} MB). No se eliminaron ${skipped.length}: ${summarizeSkipped(skipped)}.`
      : `Se eliminaron ${deleted} video(s) y se liberaron ${freedMb} MB.`;

  return success({ deleted, freedBytes, skipped }, message);
}

type SkippedVideo = { filename: string; reason: string };

/** Agrupa los motivos: "2 es reciente; 1 sin permiso de escritura (EACCES)". */
function summarizeSkipped(skipped: SkippedVideo[]): string {
  const counts = new Map<string, number>();
  for (const s of skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  return [...counts].map(([reason, n]) => `${n} ${reason}`).join("; ");
}
