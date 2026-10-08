import "server-only";

import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { mkdir, readdir, readFile, rm, stat, unlink, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";

const execFileAsync = promisify(execFile);

/**
 * Archivos de constancias firmadas. Se guardan en el volumen de subidas pero
 * NUNCA se sirven como estáticos: sólo por /api/constancias-firmadas/[id] con sesión.
 */
export const SIGNED_CERT_DIR = path.join(process.cwd(), "public", "uploads", "constancias");
export const SIGNED_CERT_MAX_BYTES = 20 * 1024 * 1024;

export type SignedCertKind = "pdf" | "jpg";

/** Detecta el tipo real por la firma del archivo (no por la extensión). */
export function detectKind(buffer: Buffer): SignedCertKind | null {
  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  return null;
}

/** JPG: corrige rotación, limita a 2000 px y recomprime (calidad suficiente para leer firmas). */
async function optimizeJpg(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: "none" })
    .rotate()
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
}

function ghostscriptCandidates(): string[] {
  if (process.env.GHOSTSCRIPT_BIN) return [process.env.GHOSTSCRIPT_BIN];
  return process.platform === "win32" ? ["gswin64c", "gswin32c", "gs"] : ["gs"];
}

/**
 * PDF: reescribe con Ghostscript a ~150 dpi (/ebook), que reduce mucho los
 * escaneos. Si Ghostscript no está instalado o falla, devuelve null.
 */
async function optimizePdf(input: Buffer): Promise<Buffer | null> {
  const workDir = path.join(os.tmpdir(), `constancia-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  const inFile = path.join(workDir, "in.pdf");
  const outFile = path.join(workDir, "out.pdf");
  try {
    await writeFile(inFile, input);
    for (const bin of ghostscriptCandidates()) {
      try {
        await execFileAsync(
          bin,
          [
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.5",
            "-dPDFSETTINGS=/ebook",
            "-dDetectDuplicateImages=true",
            "-dNOPAUSE",
            "-dQUIET",
            "-dBATCH",
            "-dSAFER",
            `-sOutputFile=${outFile}`,
            inFile,
          ],
          { timeout: 60_000 },
        );
        return await readFile(outFile);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; // no instalado
        console.error("[constancias] Ghostscript no pudo optimizar el PDF:", error);
        return null;
      }
    }
    return null;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Optimiza y devuelve la versión más liviana (nunca una más pesada que el original). */
export async function optimizeSignedCertificate(
  input: Buffer,
  kind: SignedCertKind,
): Promise<{ buffer: Buffer; optimized: boolean }> {
  try {
    const result = kind === "jpg" ? await optimizeJpg(input) : await optimizePdf(input);
    if (result && result.length > 0 && result.length < input.length) {
      return { buffer: result, optimized: true };
    }
  } catch (error) {
    console.error("[constancias] Error optimizando archivo:", error);
  }
  return { buffer: input, optimized: false };
}

export async function saveSignedCertificateFile(buffer: Buffer, kind: SignedCertKind): Promise<string> {
  await mkdir(SIGNED_CERT_DIR, { recursive: true });
  const fileName = `${randomUUID()}.${kind}`;
  await writeFile(path.join(SIGNED_CERT_DIR, fileName), buffer);
  return fileName;
}

export async function deleteSignedCertificateFile(fileName: string): Promise<void> {
  if (fileName !== path.basename(fileName)) return;
  await unlink(path.join(SIGNED_CERT_DIR, fileName)).catch(() => undefined);
}

export function signedCertificatePath(fileName: string): string | null {
  return fileName === path.basename(fileName) ? path.join(SIGNED_CERT_DIR, fileName) : null;
}

export interface OrphanSignedFile {
  fileName: string;
  isPdf: boolean;
  size: number;
  modifiedAt: Date;
}

/**
 * Archivos de la carpeta de constancias que ningún registro usa (p. ej. tras
 * eliminar un curso o un funcionario, cuyo registro se borra en cascada).
 * Se compara contra TODOS los colegios porque la carpeta es compartida.
 */
export async function listOrphanSignedFiles(referenced: Set<string>): Promise<OrphanSignedFile[]> {
  let names: string[] = [];
  try {
    names = await readdir(SIGNED_CERT_DIR);
  } catch {
    return [];
  }
  const orphans: OrphanSignedFile[] = [];
  for (const fileName of names) {
    if (fileName.startsWith(".") || referenced.has(fileName)) continue;
    try {
      const info = await stat(path.join(SIGNED_CERT_DIR, fileName));
      if (!info.isFile()) continue;
      orphans.push({
        fileName,
        isPdf: fileName.toLowerCase().endsWith(".pdf"),
        size: info.size,
        modifiedAt: info.mtime,
      });
    } catch {
      // Eliminado entre readdir y stat.
    }
  }
  return orphans.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
}

export type StoreSignedCertificateResult =
  | { ok: true; size: number; originalSize: number; optimized: boolean; replaced: boolean }
  | { ok: false; status: number; error: string };

/**
 * Valida, optimiza y guarda la constancia firmada vigente de un funcionario
 * para un curso, reemplazando la anterior. Lo usan el panel de RRHH y el
 * portal de jefatura. El llamador ya verificó permisos sobre el funcionario.
 */
export async function storeSignedCertificate(input: {
  institutionId: string;
  userId: string;
  courseId: string;
  file: File;
  /** Null cuando sube la jefatura desde el portal (no tiene usuario). */
  uploadedById: string | null;
  allowedKinds?: SignedCertKind[];
}): Promise<StoreSignedCertificateResult> {
  const { institutionId, userId, courseId, file, uploadedById } = input;
  const allowedKinds = input.allowedKinds ?? ["pdf", "jpg"];
  const kindsLabel = allowedKinds.length === 1 ? "PDF" : "PDF o JPG";

  if (file.size === 0) return { ok: false, status: 400, error: "El archivo está vacío." };
  if (file.size > SIGNED_CERT_MAX_BYTES) {
    return { ok: false, status: 413, error: "El archivo supera el máximo de 20 MB." };
  }

  const original = Buffer.from(await file.arrayBuffer());
  const kind = detectKind(original);
  if (!kind || !allowedKinds.includes(kind)) {
    return { ok: false, status: 415, error: `Sólo se aceptan archivos ${kindsLabel}.` };
  }

  const { buffer, optimized } = await optimizeSignedCertificate(original, kind);
  const fileName = await saveSignedCertificateFile(buffer, kind);
  const where = { userId_courseId_archivedPeriod: { userId, courseId, archivedPeriod: 0 } };
  const previous = await prisma.signedCertificate.findUnique({ where, select: { fileName: true } });
  const data = {
    fileName,
    originalName: file.name.slice(0, 255),
    mimeType: kind === "pdf" ? "application/pdf" : "image/jpeg",
    size: buffer.length,
    originalSize: original.length,
    uploadedById,
  };

  try {
    await prisma.signedCertificate.upsert({
      where,
      create: { institutionId, userId, courseId, ...data },
      update: data,
    });
  } catch (error) {
    await deleteSignedCertificateFile(fileName);
    console.error("[constancias-firmadas] Error guardando registro:", error);
    return { ok: false, status: 500, error: "No se pudo guardar la constancia." };
  }

  if (previous) await deleteSignedCertificateFile(previous.fileName);
  return { ok: true, size: buffer.length, originalSize: original.length, optimized, replaced: Boolean(previous) };
}
