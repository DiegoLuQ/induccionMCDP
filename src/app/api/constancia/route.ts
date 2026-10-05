import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCertificateToken } from "@/lib/auth/certificate-token";
import { generateCertificatePdf, getLogoDataUrl } from "@/server/services/certificate-pdf";

/**
 * Descarga pública (sin sesión) de la Constancia de Participación desde el
 * correo de jefatura. El acceso lo da el token firmado, que vence en 7 días.
 * La constancia se entrega aunque el funcionario aún no haga la inducción.
 */

export const dynamic = "force-dynamic";

function messagePage(title: string, message: string, status: number) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f1f5f9;margin:0;padding:48px 16px;color:#0f172a;">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
<h1 style="font-size:18px;margin:0 0 8px;">${title}</h1><p style="margin:0;color:#475569;line-height:1.6;">${message}</p></div></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(request: NextRequest) {
  const result = await verifyCertificateToken(request.nextUrl.searchParams.get("t"));
  if (!result.ok) {
    return result.reason === "expired"
      ? messagePage(
          "Enlace vencido",
          "Este enlace para descargar la constancia venció (dura 7 días). Solicita la constancia al área de Recursos Humanos.",
          410,
        )
      : messagePage("Enlace inválido", "El enlace para descargar la constancia no es válido.", 400);
  }

  const course = await prisma.course.findUnique({
    where: { id: result.courseId },
    select: {
      id: true,
      title: true,
      institutionId: true,
      institution: { select: { name: true, logoUrl: true } },
    },
  });
  const user = await prisma.user.findFirst({
    where: { id: result.userId, institutionId: course?.institutionId },
    select: {
      name: true,
      rut: true,
      courseProgress: {
        where: { courseId: result.courseId },
        select: { completedAt: true },
      },
    },
  });
  if (!course || !user) {
    return messagePage("Constancia no disponible", "El funcionario o la inducción ya no existen.", 404);
  }

  try {
    const pdf = generateCertificatePdf({
      institutionName: course.institution.name,
      logoDataUrl: await getLogoDataUrl(course.institution.logoUrl),
      courseTitle: course.title,
      funcionarioName: user.name,
      funcionarioRut: user.rut,
      // Si ya la completó, la fecha real; si no, la de hoy (se imprime igual).
      date: user.courseProgress[0]?.completedAt ?? new Date(),
    });

    const filename = `Constancia - ${user.name} - ${course.title}`.replace(/[/\\?%*:|"<>]/g, "").trim();
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="constancia.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}.pdf`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[constancia] Error generando PDF:", error);
    return messagePage("Error", "No se pudo generar la constancia. Inténtalo de nuevo más tarde.", 500);
  }
}
