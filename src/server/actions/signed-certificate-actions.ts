"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/rbac";
import { failure, success, type ActionResult } from "@/lib/validations/common";
import { deleteSignedCertificateFile } from "@/server/services/signed-certificate-files";

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
