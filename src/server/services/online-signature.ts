import "server-only";

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail/mailer";
import { signatureRequestEmail } from "@/lib/mail/templates";
import { hasPersonalEmail } from "@/lib/personal-email";
import {
  SIGNATURE_LINK_TTL_HOURS,
  signSignatureToken,
  verifySignatureToken,
} from "@/lib/auth/signature-token";
import { generateCertificatePdf, getLogoDataUrl } from "@/server/services/certificate-pdf";
import {
  deleteSignedCertificateFile,
  saveSignedCertificateFile,
} from "@/server/services/signed-certificate-files";

/**
 * Firma electrónica simple de la Constancia de Participación.
 * Se firma desde el enlace enviado al correo personal del funcionario (vigente
 * 24 h): quien firma es quien controla ese correo. El enlace lleva el correo
 * al que se envió y deja de servir si el funcionario cambia su correo personal.
 */

function appBaseUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Dirección pública de firma (no exige iniciar sesión: la identidad la da el token). */
export function buildSignatureLink(token: string): string {
  return `${appBaseUrl()}/firmar-acta?t=${encodeURIComponent(token)}`;
}

export type SignatureRequestResult =
  | { ok: true; email: string; expiresAt: Date }
  | { ok: false; error: string };

/**
 * Envía al correo personal del funcionario el enlace (24 h) para firmar su
 * constancia. Exige que haya confirmado el término y que aún no esté firmada.
 */
export async function sendSignatureRequest(
  userId: string,
  institutionId: string,
  courseId: string,
): Promise<SignatureRequestResult> {
  const [user, course, progress, existing] = await Promise.all([
    prisma.user.findFirst({
      where: { id: userId, institutionId },
      select: { name: true, email: true },
    }),
    prisma.course.findFirst({
      where: { id: courseId, institutionId },
      select: { title: true, institution: { select: { name: true, domain: true, logoUrl: true } } },
    }),
    prisma.courseProgress.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { confirmedAt: true },
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
  if (!hasPersonalEmail(user.email, course.institution.domain)) {
    return { ok: false, error: "Primero registra tu correo personal en Mi cuenta." };
  }

  const token = await signSignatureToken({ userId, courseId, email: user.email });
  const mail = signatureRequestEmail({
    name: user.name,
    courseTitle: course.title,
    link: buildSignatureLink(token),
    email: user.email,
    validHours: SIGNATURE_LINK_TTL_HOURS,
    institutionName: course.institution.name,
    institutionLogoUrl: course.institution.logoUrl,
  });
  const sent = await sendMail({ to: user.email, institutionDomain: course.institution.domain, ...mail });
  if (!sent) return { ok: false, error: "No se pudo enviar el correo. Inténtalo de nuevo en unos minutos." };

  return {
    ok: true,
    email: user.email,
    expiresAt: new Date(Date.now() + SIGNATURE_LINK_TTL_HOURS * 60 * 60 * 1000),
  };
}

export type SignCertificateResult =
  | { ok: true; id: string; signedAt: Date; courseId: string }
  | { ok: false; error: string };

/** Firma con el token del enlace enviado al correo personal. */
export async function signCertificateWithToken(params: {
  token: string;
  ip: string | null;
}): Promise<SignCertificateResult> {
  const verified = await verifySignatureToken(params.token);
  if (!verified.ok) {
    return {
      ok: false,
      error:
        verified.reason === "expired"
          ? "El enlace venció (dura 24 horas). Solicita uno nuevo desde la plataforma."
          : "El enlace de firma no es válido.",
    };
  }
  const { userId, courseId } = verified;

  const [user, course, progress, existing] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, rut: true, email: true, institutionId: true },
    }),
    prisma.course.findUnique({
      where: { id: courseId },
      select: { title: true, institutionId: true, institution: { select: { name: true, logoUrl: true } } },
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

  if (!user || !course || user.institutionId !== course.institutionId) {
    return { ok: false, error: "Inducción no encontrada." };
  }
  if (!progress?.confirmedAt) {
    return { ok: false, error: "Primero debes terminar la inducción y confirmar tu término." };
  }
  if (existing) return { ok: false, error: "Tu constancia ya está firmada y registrada." };
  // Cambió su correo personal después de recibir el enlace.
  if (user.email.toLowerCase() !== verified.email.toLowerCase()) {
    return {
      ok: false,
      error: "Este enlace se envió a un correo que ya no es tu correo personal. Solicita uno nuevo desde la plataforma.",
    };
  }

  const institutionId = course.institutionId;
  const id = randomUUID();
  const signedAt = new Date();
  const pdf = generateCertificatePdf({
    institutionName: course.institution.name,
    logoDataUrl: await getLogoDataUrl(course.institution.logoUrl),
    courseTitle: course.title,
    funcionarioName: user.name,
    funcionarioRut: user.rut,
    date: progress.completedAt ?? progress.confirmedAt,
    onlineSignature: { signedAt, email: verified.email, ip: params.ip, verificationCode: id },
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
        signedEmail: verified.email,
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

  return { ok: true, id, signedAt, courseId };
}
