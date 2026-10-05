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
 * servidor que ninguna lección los use y que no sean recientes, así que nunca
 * borra un video asignado aunque la vista del navegador esté desactualizada.
 */
export async function deleteOrphanVideosAction(
  filenames: string[],
): Promise<ActionResult<{ deleted: number; freedBytes: number; skipped: string[] }>> {
  const session = await getSession();
  if (session?.role !== Role.SUPER_ADMIN) return failure("Sin permisos.");
  if (!Array.isArray(filenames) || filenames.length === 0) {
    return failure("No se seleccionaron videos.");
  }

  const usageMap = await getVideoUsageMap();
  const now = Date.now();
  let deleted = 0;
  let freedBytes = 0;
  const skipped: string[] = [];

  for (const filename of new Set(filenames)) {
    if (typeof filename !== "string" || !isSafeVideoFilename(filename)) {
      skipped.push(String(filename));
      continue;
    }
    if (usageMap.has(filename)) {
      skipped.push(filename);
      continue;
    }

    const filePath = path.join(VIDEO_UPLOAD_DIR, filename);
    try {
      const info = await stat(filePath);
      if (!info.isFile() || now - info.mtimeMs < ORPHAN_VIDEO_MIN_AGE_MS) {
        skipped.push(filename);
        continue;
      }
      await unlink(filePath);
      deleted += 1;
      freedBytes += info.size;
    } catch (error) {
      console.error(`[deleteOrphanVideosAction] No se pudo eliminar ${filename}:`, error);
      skipped.push(filename);
    }
  }

  revalidatePath("/configuracion/videos");

  const freedMb = (freedBytes / (1024 * 1024)).toFixed(1);
  const message =
    skipped.length > 0
      ? `Se eliminaron ${deleted} video(s) (${freedMb} MB). ${skipped.length} no se eliminaron porque están en uso, son recientes o no existen.`
      : `Se eliminaron ${deleted} video(s) y se liberaron ${freedMb} MB.`;

  return success({ deleted, freedBytes, skipped }, message);
}
