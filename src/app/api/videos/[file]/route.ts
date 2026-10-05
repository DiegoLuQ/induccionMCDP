import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { getSession } from "@/lib/auth/session";
import { VIDEO_UPLOAD_DIR } from "@/lib/uploads";

/**
 * Sirve los videos subidos a `public/uploads/videos`.
 *
 * `next start` solo entrega los archivos de `public/` que existían al momento
 * del build, así que los subidos después se sirven desde aquí. Las URLs
 * guardadas (`/uploads/videos/...`) llegan por el rewrite de next.config.mjs.
 * Soporta peticiones Range para que el reproductor pueda adelantar el video.
 */

const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "video/ogg",
  ".ogv": "video/ogg",
  ".mov": "video/quicktime",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ file: string }> },
) {
  const session = await getSession();
  if (!session) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const { file } = await params;
  // Evitar path traversal: solo se acepta un nombre de archivo plano.
  const filename = path.basename(file);
  if (filename !== file || filename.startsWith(".")) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  const filePath = path.join(VIDEO_UPLOAD_DIR, filename);
  let size: number;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("No es un archivo");
    size = info.size;
  } catch {
    return new NextResponse("No encontrado", { status: 404 });
  }

  const contentType =
    MIME_TYPES[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
  const baseHeaders = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=86400",
  };

  const range = request.headers.get("range");
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (match) {
    let start: number;
    let end: number;
    if (match[1] === "") {
      // bytes=-N -> últimos N bytes
      const suffix = Number(match[2]);
      start = Math.max(size - suffix, 0);
      end = size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    }

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }

    const stream = createReadStream(filePath, { start, end });
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  const stream = createReadStream(filePath);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}
