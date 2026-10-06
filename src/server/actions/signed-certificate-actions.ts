"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/rbac";
import { failure, success, type ActionResult } from "@/lib/validations/common";
import { Role } from "@prisma/client";
import {
  deleteSignedCertificateFile,
  signedCertificatePath,
} from "@/server/services/signed-certificate-files";

export async function deleteSignedCertificateAction(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role)) return failure("Sin permisos.");

  const record = await prisma.signedCertificate.findFirst({
    where: { id, institutionId: session.institutionId },
    select: { id: true, fileName: true },
  });
  if (!record) return failure("Constancia no encontrada.");

  await prisma.signedCertificate.delete({ where: { id: record.id } });
  await deleteSignedCertificateFile(record.fileName);

  revalidatePath("/admin/constancias");
  return success(undefined, "Constancia eliminada.");
}

/**
 * Elimina archivos sueltos de constancias (sin registro). Sólo SUPER_ADMIN.
 * Vuelve a comprobar que ningún registro los use antes de borrar.
 */
export async function deleteOrphanSignedFilesAction(
  fileNames: string[],
): Promise<ActionResult<{ deleted: number }>> {
  const session = await getSession();
  if (session?.role !== Role.SUPER_ADMIN) return failure("Sólo un Super Administrador puede eliminar archivos sueltos.");
  if (!Array.isArray(fileNames) || fileNames.length === 0) return failure("No se seleccionaron archivos.");

  const used = new Set(
    (
      await prisma.signedCertificate.findMany({
        where: { fileName: { in: fileNames } },
        select: { fileName: true },
      })
    ).map((r) => r.fileName),
  );

  let deleted = 0;
  for (const name of new Set(fileNames)) {
    if (typeof name !== "string" || name.startsWith(".") || used.has(name) || !signedCertificatePath(name)) {
      continue;
    }
    await deleteSignedCertificateFile(name);
    deleted += 1;
  }

  revalidatePath("/admin/constancias");
  return success({ deleted }, `Se eliminaron ${deleted} archivo(s) suelto(s) del servidor.`);
}
