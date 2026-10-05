import "server-only";

import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { mkdir, readFile, rm, unlink, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import sharp from "sharp";

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
