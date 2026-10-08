import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { findPortalInvitation, resolvePortalActor } from "@/server/services/area-portal";
import { signedCertificatePath, storeSignedCertificate } from "@/server/services/signed-certificate-files";

/**
 * Constancia firmada desde el portal de jefatura (/induccion/[codigo]).
 * Vive bajo /induccion (y no en /api) porque la cookie del portal está
 * limitada a esa ruta. Sólo funcionarios activos del área; sólo PDF.
 */

/** Sube (o reemplaza) la constancia firmada en PDF de una invitación del área. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const actor = await resolvePortalActor((await params).codigo);
  if (!actor) {
    return NextResponse.json({ error: "Tu acceso al portal venció. Recarga la página e ingresa la clave." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo enviado." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });

  const invitation = await findPortalInvitation(actor.area, String(form.get("invitationId") ?? ""));
  if (!invitation) {
    return NextResponse.json({ error: "El funcionario no pertenece a esta área." }, { status: 404 });
  }

  const result = await storeSignedCertificate({
    institutionId: actor.area.institutionId,
    userId: invitation.userId,
    courseId: invitation.courseId,
    file,
    uploadedById: actor.uploadedById,
    allowedKinds: ["pdf"],
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    success: true,
    message: `Constancia firmada de ${invitation.user.name} guardada.`,
    size: result.size,
    originalSize: result.originalSize,
    optimized: result.optimized,
    replaced: result.replaced,
  });
}

/** Ver la constancia firmada vigente de una invitación del área (?invitacion=<id>). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const actor = await resolvePortalActor((await params).codigo);
  if (!actor) return new NextResponse("No autorizado", { status: 403 });

  const invitation = await findPortalInvitation(actor.area, request.nextUrl.searchParams.get("invitacion") ?? "");
  if (!invitation) return new NextResponse("No encontrado", { status: 404 });

  const record = await prisma.signedCertificate.findUnique({
    where: {
      userId_courseId_archivedPeriod: { userId: invitation.userId, courseId: invitation.courseId, archivedPeriod: 0 },
    },
    select: { fileName: true, mimeType: true },
  });
  const filePath = record ? signedCertificatePath(record.fileName) : null;
  if (!record || !filePath) return new NextResponse("Aún no hay constancia firmada", { status: 404 });

  let data: Buffer;
  try {
    data = await readFile(filePath);
  } catch {
    return new NextResponse("El archivo ya no existe en el servidor", { status: 404 });
  }

  const ext = record.mimeType === "application/pdf" ? "pdf" : "jpg";
  const name = `Constancia firmada - ${invitation.user.name} - ${invitation.course.title}`
    .replace(/[/\\?%*:|"<>]/g, "")
    .trim();
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": record.mimeType,
      "Content-Length": String(data.length),
      "Content-Disposition": `inline; filename="constancia.${ext}"; filename*=UTF-8''${encodeURIComponent(name)}.${ext}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
