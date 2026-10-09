"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { failure, success, type ActionResult } from "@/lib/validations/common";
import { signCertificateOnline } from "@/server/services/online-signature";

/** IP del cliente tras el proxy inverso (nginx-proxy agrega X-Forwarded-For). */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || null;
}

/**
 * El funcionario firma su propia constancia. El firmante es siempre el
 * usuario de la sesión: el curso es el único dato que llega del cliente.
 */
export async function signCertificateOnlineAction(
  courseId: string,
): Promise<ActionResult<{ id: string; signedAt: Date }>> {
  const session = await getSession();
  if (!session) return failure("Sesión expirada. Vuelve a ingresar.");
  if (typeof courseId !== "string" || !courseId) return failure("Inducción no válida.");

  const result = await signCertificateOnline({
    userId: session.sub,
    institutionId: session.institutionId,
    courseId,
    ip: await clientIp(),
  });
  if (!result.ok) return failure(result.error);

  revalidatePath(`/mis-inducciones/${courseId}/firmar`);
  revalidatePath("/admin/constancias");
  return success({ id: result.id, signedAt: result.signedAt }, "Constancia firmada y registrada.");
}
