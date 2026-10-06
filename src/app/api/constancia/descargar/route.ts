import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { findStaffInScope } from "@/lib/auth/staff-scope";
import { generateCertificatePdf, getLogoDataUrl } from "@/server/services/certificate-pdf";

/**
 * Constancia en blanco (para imprimir, firmar y escanear) desde el reporte.
 * Requiere sesión; el auditor-jefatura sólo puede descargar las de sus áreas.
 */
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId") ?? "";
  const courseId = request.nextUrl.searchParams.get("courseId") ?? "";

  const session = await getSession();
  const user = await findStaffInScope(session, userId);
  if (!session || !user) return new NextResponse("No autorizado", { status: 403 });

  const course = await prisma.course.findFirst({
    where: { id: courseId, institutionId: session.institutionId },
    select: { title: true, institution: { select: { name: true, logoUrl: true } } },
  });
  if (!course) return new NextResponse("Curso no encontrado", { status: 404 });

  const progress = await prisma.courseProgress.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
    select: { completedAt: true },
  });

  const pdf = generateCertificatePdf({
    institutionName: course.institution.name,
    logoDataUrl: await getLogoDataUrl(course.institution.logoUrl),
    courseTitle: course.title,
    funcionarioName: user.name,
    funcionarioRut: user.rut,
    date: progress?.completedAt ?? new Date(),
  });

  const filename = `Constancia - ${user.name} - ${course.title}`.replace(/[/\\?%*:|"<>]/g, "").trim();
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="constancia.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}.pdf`,
      "Cache-Control": "private, no-store",
    },
  });
}
