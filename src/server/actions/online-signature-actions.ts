"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { failure, success, type ActionResult } from "@/lib/validations/common";
import {
  sendSignatureRequest,
  signCertificateWithToken,
} from "@/server/services/online-signature";

/** IP del cliente tras el proxy inverso (nginx-proxy agrega X-Forwarded-For). */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || null;
}

/**
 * El funcionario acepta firmar: se le envía a su correo personal el enlace
 * (vigente 24 h) para firmar. También sirve para reenviarlo si venció.
 */
export async function requestSignatureEmailAction(
  courseId: string,
): Promise<ActionResult<{ email: string; expiresAt: Date }>> {
  const session = await getSession();
  if (!session) return failure("Sesión expirada. Vuelve a ingresar.");
  if (typeof courseId !== "string" || !courseId) return failure("Inducción no válida.");

  const result = await sendSignatureRequest(session.sub, session.institutionId, courseId);
  if (!result.ok) return failure(result.error);

  return success(
    { email: result.email, expiresAt: result.expiresAt },
    `Te enviamos el enlace de firma a ${result.email}.`,
  );
}

/**
 * Firma desde el enlace del correo personal. No requiere sesión: el token
 * identifica al funcionario, la inducción y el correo al que se envió.
 */
export async function signCertificateWithTokenAction(
  token: string,
): Promise<ActionResult<{ id: string; signedAt: Date }>> {
  if (typeof token !== "string" || !token) return failure("El enlace de firma no es válido.");

  const result = await signCertificateWithToken({ token, ip: await clientIp() });
  if (!result.ok) return failure(result.error);

  revalidatePath(`/mis-inducciones/${result.courseId}/firmar`);
  revalidatePath("/mis-inducciones");
  revalidatePath("/admin/constancias");
  return success({ id: result.id, signedAt: result.signedAt }, "Constancia firmada y registrada.");
}
