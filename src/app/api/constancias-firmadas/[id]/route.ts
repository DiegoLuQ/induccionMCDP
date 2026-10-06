import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { findStaffInScope } from "@/lib/auth/staff-scope";
import { signedCertificatePath } from "@/server/services/signed-certificate-files";

/**
 * Ver (inline) o descargar (?download=1) una constancia firmada.
 * RRHH/Super Admin del colegio, o el auditor-jefatura si el funcionario es de sus áreas.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return new NextResponse("No autorizado", { status: 401 });

  const { id } = await params;
  const record = await prisma.signedCertificate.findFirst({
    where: { id, institutionId: session.institutionId },
    select: {
      userId: true,
      fileName: true,
      mimeType: true,
      user: { select: { name: true } },
      course: { select: { title: true } },
    },
  });
  const filePath = record ? signedCertificatePath(record.fileName) : null;
  if (!record || !filePath) return new NextResponse("No encontrado", { status: 404 });
  if (!(await findStaffInScope(session, record.userId))) {
    return new NextResponse("No autorizado", { status: 403 });
  }

  let data: Buffer;
  try {
    data = await readFile(filePath);
  } catch {
    return new NextResponse("El archivo ya no existe en el servidor", { status: 404 });
  }

  const ext = record.mimeType === "application/pdf" ? "pdf" : "jpg";
  const name = `Constancia firmada - ${record.user.name} - ${record.course.title}`
    .replace(/[/\\?%*:|"<>]/g, "")
    .trim();
  const disposition = request.nextUrl.searchParams.get("download") ? "attachment" : "inline";

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": record.mimeType,
      "Content-Length": String(data.length),
      "Content-Disposition": `${disposition}; filename="constancia.${ext}"; filename*=UTF-8''${encodeURIComponent(name)}.${ext}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
