import "server-only";

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail/mailer";
import { signatureRequestEmail } from "@/lib/mail/templates";
import { generateCertificatePdf, getLogoDataUrl } from "@/server/services/certificate-pdf";
import {
  deleteSignedCertificateFile,
  saveSignedCertificateFile,
} from "@/server/services/signed-certificate-files";

/**
 * Firma electrónica simple de la Constancia de Participación.
 * Sólo firma el propio funcionario: la identidad sale de su sesión (no del
 * enlace), así que aunque el enlace se reenvíe, nadie más puede firmar por él.
 */

/** Dirección de la página de firma; exige iniciar sesión como el funcionario. */
export function buildSignatureLink(courseId: string): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/mis-inducciones/${courseId}/firmar`;
}

/** Correo aparte, sólo al funcionario, con el enlace para firmar. */
export async function sendSignatureRequest(userId: string, courseId: string): Promise<boolean> {
  const [user, course] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    prisma.course.findUnique({
      where: { id: courseId },
      select: { title: true, institution: { select: { name: true, domain: true, logoUrl: true } } },
    }),
  ]);
  if (!user || !course) return false;

  const mail = signatureRequestEmail({
    name: user.name,
    courseTitle: course.title,
    link: buildSignatureLink(courseId),
    institutionName: course.institution.name,
    institutionLogoUrl: course.institution.logoUrl,
  });
  return sendMail({ to: user.email, institutionDomain: course.institution.domain, ...mail });
}

export type SignCertificateResult =
  | { ok: true; id: string; signedAt: Date }
  | { ok: false; error: string };

export async function signCertificateOnline(params: {
  userId: string;
  institutionId: string;
  courseId: string;
  ip: string | null;
}): Promise<SignCertificateResult> {
  const { userId, institutionId, courseId } = params;

  const [user, course, progress, existing] = await Promise.all([
    prisma.user.findFirst({
      where: { id: userId, institutionId },
      select: { name: true, rut: true, email: true },
    }),
    prisma.course.findFirst({
      where: { id: courseId, institutionId },
      select: { title: true, institution: { select: { name: true, logoUrl: true } } },
    }),
    prisma.courseProgress.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { confirmedAt: true, completedAt: true },
    }),
    prisma.signedCertificate.findUnique({
      where: { userId_courseId_archivedPeriod: { userId, courseId, archivedPeriod: 0 } },
      select: { id: true },
    }),
  ]);

  if (!user || !course) return { ok: false, error: "Inducción no encontrada." };
  if (!progress?.confirmedAt) {
    return { ok: false, error: "Primero debes terminar la inducción y confirmar tu término." };
  }
  if (existing) return { ok: false, error: "Tu constancia ya está firmada y registrada." };

  const id = randomUUID();
  const signedAt = new Date();
  const pdf = generateCertificatePdf({
    institutionName: course.institution.name,
    logoDataUrl: await getLogoDataUrl(course.institution.logoUrl),
    courseTitle: course.title,
    funcionarioName: user.name,
    funcionarioRut: user.rut,
    date: progress.completedAt ?? progress.confirmedAt,
    onlineSignature: { signedAt, email: user.email, ip: params.ip, verificationCode: id },
  });

  const fileName = await saveSignedCertificateFile(pdf, "pdf");
  try {
    await prisma.signedCertificate.create({
      data: {
        id,
        institutionId,
        userId,
        courseId,
        fileName,
        originalName: "Constancia firmada en línea.pdf",
        mimeType: "application/pdf",
        size: pdf.length,
        originalSize: pdf.length,
        uploadedById: userId,
        signedOnlineAt: signedAt,
        signedEmail: user.email,
        signedIp: params.ip?.slice(0, 64) ?? null,
      },
    });
  } catch (error) {
    await deleteSignedCertificateFile(fileName);
    // Doble clic o RRHH subió la constancia en ese mismo instante.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "Tu constancia ya está firmada y registrada." };
    }
    console.error("[firma-en-linea] Error guardando constancia:", error);
    return { ok: false, error: "No se pudo registrar la firma. Inténtalo de nuevo." };
  }

  return { ok: true, id, signedAt };
}
