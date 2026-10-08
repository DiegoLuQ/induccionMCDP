import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getSession } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/rbac";

export async function POST(request: NextRequest) {
  // /api queda fuera del middleware: sólo los administradores pueden subir videos.
  const session = await getSession();
  if (!session || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó ningún archivo de video." },
        { status: 400 }
      );
    }

    // Validar tipo de archivo
    if (!file.type.startsWith("video/")) {
      return NextResponse.json(
        { error: "El archivo seleccionado no es un formato de video válido." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Asegurar directorio de subida
    const uploadDir = path.join(process.cwd(), "public", "uploads", "videos");
    await mkdir(uploadDir, { recursive: true });

    // Sanitizar nombre y generar identificador único
    const originalName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const filename = `${uniqueSuffix}_${originalName}`;
    const filePath = path.join(uploadDir, filename);

    // Escribir archivo en disco
    await writeFile(filePath, buffer);

    const publicUrl = `/uploads/videos/${filename}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filename: filename,
      size: file.size,
    });
  } catch (error) {
    console.error("Error al subir video:", error);
    return NextResponse.json(
      { error: "Ocurrió un error en el servidor al procesar la subida del video." },
      { status: 500 }
    );
  }
}
