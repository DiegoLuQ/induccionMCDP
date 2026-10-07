import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { getStaffScope, findStaffInScope } from "@/lib/auth/staff-scope";
import {
  SIGNED_CERT_MAX_BYTES,
  deleteSignedCertificateFile,
  detectKind,
  optimizeSignedCertificate,
  saveSignedCertificateFile,
} from "@/server/services/signed-certificate-files";

/**
 * Sube la constancia firmada (PDF o JPG) de un funcionario para un curso.
 * Ruta (y no Server Action) porque los escaneos superan el límite de 2 MB de
 * las acciones. Reemplaza la constancia anterior de ese funcionario y curso.
 * RRHH/Super Admin: cualquier funcionario; auditor-jefatura: sólo los de sus áreas.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !(await getStaffScope(session)).allowed) {
    return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo enviado." }, { status: 400 });
  }

  const file = form.get("file");
  const userId = String(form.get("userId") ?? "");
  const courseId = String(form.get("courseId") ?? "");
  if (!(file instanceof File) || !userId || !courseId) {
    return NextResponse.json({ error: "Faltan el archivo, el funcionario o el curso." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "El archivo está vacío." }, { status: 400 });
  }
  if (file.size > SIGNED_CERT_MAX_BYTES) {
    return NextResponse.json({ error: "El archivo supera el máximo de 20 MB." }, { status: 413 });
  }

  const [user, course] = await Promise.all([
    findStaffInScope(session, userId),
    prisma.course.findFirst({
      where: { id: courseId, institutionId: session.institutionId },
      select: { id: true, title: true },
    }),
  ]);
  if (!user || !course) {
    return NextResponse.json({ error: "Funcionario o curso no encontrado en este colegio." }, { status: 404 });
  }

  const input = Buffer.from(await file.arrayBuffer());
  const kind = detectKind(input);
  if (!kind) {
    return NextResponse.json({ error: "Sólo se aceptan archivos PDF o JPG." }, { status: 415 });
  }

  const { buffer, optimized } = await optimizeSignedCertificate(input, kind);
  const fileName = await saveSignedCertificateFile(buffer, kind);

  const previous = await prisma.signedCertificate.findUnique({
    where: { userId_courseId_archivedPeriod: { userId, courseId, archivedPeriod: 0 } },
    select: { fileName: true },
  });

  try {
    await prisma.signedCertificate.upsert({
      where: { userId_courseId_archivedPeriod: { userId, courseId, archivedPeriod: 0 } },
      create: {
        institutionId: session.institutionId,
        userId,
        courseId,
        fileName,
        originalName: file.name.slice(0, 255),
        mimeType: kind === "pdf" ? "application/pdf" : "image/jpeg",
        size: buffer.length,
        originalSize: input.length,
        uploadedById: session.sub,
      },
      update: {
        fileName,
        originalName: file.name.slice(0, 255),
        mimeType: kind === "pdf" ? "application/pdf" : "image/jpeg",
        size: buffer.length,
        originalSize: input.length,
        uploadedById: session.sub,
      },
    });
  } catch (error) {
    await deleteSignedCertificateFile(fileName);
    console.error("[constancias-firmadas] Error guardando registro:", error);
    return NextResponse.json({ error: "No se pudo guardar la constancia." }, { status: 500 });
  }

  if (previous) await deleteSignedCertificateFile(previous.fileName);

  return NextResponse.json({
    success: true,
    message: `Constancia de ${user.name} guardada (${course.title}).`,
    size: buffer.length,
    originalSize: input.length,
    optimized,
    replaced: Boolean(previous),
  });
}
