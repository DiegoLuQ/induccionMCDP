import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { signedCertificatePath } from "@/server/services/signed-certificate-files";

/**
 * Ver un archivo suelto de constancias (sin registro asociado) antes de
 * eliminarlo. Sólo SUPER_ADMIN: estos archivos no tienen colegio asociado.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const session = await getSession();
  if (session?.role !== Role.SUPER_ADMIN) return new NextResponse("No autorizado", { status: 401 });

  const { file } = await params;
  const filePath = signedCertificatePath(file);
  if (!filePath || file.startsWith(".")) return new NextResponse("No encontrado", { status: 404 });

  // Si tiene registro no es "suelto": se ve por su ruta normal, con sus permisos.
  if (await prisma.signedCertificate.findFirst({ where: { fileName: file }, select: { id: true } })) {
    return new NextResponse("Este archivo pertenece a una constancia registrada", { status: 409 });
  }

  try {
    const data = await readFile(filePath);
    const isPdf = file.toLowerCase().endsWith(".pdf");
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": isPdf ? "application/pdf" : "image/jpeg",
        "Content-Disposition": `inline; filename="${file}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("No encontrado", { status: 404 });
  }
}
