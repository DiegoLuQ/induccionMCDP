"use server";

import { failure, success, type ActionResult } from "@/lib/validations/common";
import { verifyAreaPortalKey } from "@/server/services/area-portal";

/** Valida la clave del portal de jefatura y abre el acceso (cookie de 12 h). */
export async function enterAreaPortalAction(code: string, key: string): Promise<ActionResult> {
  if (typeof code !== "string" || typeof key !== "string" || !key.trim()) {
    return failure("Ingresa la clave de acceso.");
  }
  const result = await verifyAreaPortalKey(code, key);
  return result.ok ? success(undefined) : failure(result.message);
}
