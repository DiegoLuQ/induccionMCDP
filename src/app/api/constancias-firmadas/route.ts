import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { getStaffScope, findStaffInScope } from "@/lib/auth/staff-scope";
import { storeSignedCertificate } from "@/server/services/signed-certificate-files";

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

  const result = await storeSignedCertificate({
    institutionId: session.institutionId,
    userId,
    courseId,
    file,
    uploadedById: session.sub,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    success: true,
    message: `Constancia de ${user.name} guardada (${course.title}).`,
    size: result.size,
    originalSize: result.originalSize,
    optimized: result.optimized,
    replaced: result.replaced,
  });
}
