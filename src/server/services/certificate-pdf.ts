import "server-only";

import { readFile } from "fs/promises";
import path from "path";
import { jsPDF } from "jspdf";
import { formatRut } from "@/lib/rut";
import { DEFAULT_CERTIFICATE_TOPICS, MONTH_NAMES, type CertificateTopic } from "@/lib/certificate";

/**
 * Genera en el servidor la Constancia de Participación (tamaño carta) con el
 * mismo contenido que el modal del Panel RRHH, usando los temas por defecto.
 */

export interface CertificatePdfParams {
  institutionName: string;
  /** data:image/...;base64 (PNG o JPEG). Otros formatos se omiten. */
  logoDataUrl: string | null;
  courseTitle: string;
  funcionarioName: string;
  funcionarioRut: string;
  date: Date;
  topics?: CertificateTopic[];
}

const PAGE_W = 215.9;
const PAGE_H = 279.4;
const MARGIN_X = 18;
const MARGIN_TOP = 16;
const MARGIN_BOTTOM = 16;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const HEADER_FILL: [number, number, number] = [28, 61, 90];

/** Fecha en horario de Chile, para "realizada con fecha ...". */
function chileDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { day: get("day"), month: MONTH_NAMES[get("month") - 1] ?? "", year: get("year") };
}

interface Segment {
  text: string;
  bold?: boolean;
  underline?: boolean;
}

/** Párrafo con negritas/subrayados, justificado salvo la última línea. Devuelve la nueva Y. */
function richParagraph(doc: jsPDF, segments: Segment[], x: number, y: number, width: number, size: number) {
  const lineHeight = size * 0.45;
  doc.setFontSize(size);

  type Word = { text: string; bold: boolean; underline: boolean; width: number };
  const words: Word[] = [];
  for (const seg of segments) {
    doc.setFont("times", seg.bold ? "bold" : "normal");
    for (const raw of seg.text.split(/\s+/).filter(Boolean)) {
      words.push({ text: raw, bold: Boolean(seg.bold), underline: Boolean(seg.underline), width: doc.getTextWidth(raw) });
    }
  }
  doc.setFont("times", "normal");
  const space = doc.getTextWidth(" ");

  const lines: Word[][] = [];
  let current: Word[] = [];
  let currentWidth = 0;
  for (const word of words) {
    const extra = current.length > 0 ? space + word.width : word.width;
    if (current.length > 0 && currentWidth + extra > width) {
      lines.push(current);
      current = [word];
      currentWidth = word.width;
    } else {
      current.push(word);
      currentWidth += extra;
    }
  }
  if (current.length > 0) lines.push(current);

  lines.forEach((line, lineIndex) => {
    const isLast = lineIndex === lines.length - 1;
    const wordsWidth = line.reduce((acc, w) => acc + w.width, 0);
    const gap = !isLast && line.length > 1 ? (width - wordsWidth) / (line.length - 1) : space;
    let cursor = x;
    line.forEach((word, i) => {
      doc.setFont("times", word.bold ? "bold" : "normal");
      doc.text(word.text, cursor, y);
      if (word.underline) {
        const next = line[i + 1];
        const end = cursor + word.width + (next?.underline ? gap : 0);
        doc.setLineWidth(0.2);
        doc.line(cursor, y + 0.6, end, y + 0.6);
      }
      cursor += word.width + gap;
    });
    y += lineHeight;
  });
  doc.setFont("times", "normal");
  return y;
}

function imageFormat(dataUrl: string): "PNG" | "JPEG" | null {
  if (/^data:image\/png/i.test(dataUrl)) return "PNG";
  if (/^data:image\/jpe?g/i.test(dataUrl)) return "JPEG";
  return null;
}

export function generateCertificatePdf(params: CertificatePdfParams): Buffer {
  const topics = params.topics ?? DEFAULT_CERTIFICATE_TOPICS;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter", compress: true });
  const { day, month, year } = chileDateParts(params.date);

  // --- Cabecera: logo a la izquierda y títulos centrados -------------------
  let y = MARGIN_TOP;
  const logoFormat = params.logoDataUrl ? imageFormat(params.logoDataUrl) : null;
  if (params.logoDataUrl && logoFormat) {
    try {
      const props = doc.getImageProperties(params.logoDataUrl);
      const maxSize = 22;
      const ratio = props.width / props.height;
      const w = ratio >= 1 ? maxSize : maxSize * ratio;
      const h = ratio >= 1 ? maxSize / ratio : maxSize;
      doc.addImage(params.logoDataUrl, logoFormat, MARGIN_X, y - 2, w, h);
    } catch {
      // Logo ilegible: se genera la constancia sin él.
    }
  }

  const center = PAGE_W / 2;
  doc.setFont("times", "bold");
  doc.setFontSize(13);
  doc.text(params.institutionName.toUpperCase(), center, y + 3, { align: "center" });
  doc.setFont("times", "italic");
  doc.setFontSize(10);
  doc.text("“Educar para una vida mejor”", center, y + 8, { align: "center" });

  doc.setFont("times", "bold");
  doc.setFontSize(12);
  const underlined = (text: string, ty: number) => {
    doc.text(text, center, ty, { align: "center" });
    const w = doc.getTextWidth(text);
    doc.setLineWidth(0.3);
    doc.line(center - w / 2, ty + 0.8, center + w / 2, ty + 0.8);
  };
  underlined("CONSTANCIA DE PARTICIPACIÓN", y + 18);
  doc.setFontSize(11);
  const courseLines = doc.splitTextToSize(params.courseTitle.toUpperCase(), CONTENT_W - 50) as string[];
  courseLines.forEach((line, i) => underlined(line, y + 24 + i * 5));
  y += 24 + courseLines.length * 5 + 6;

  // --- Párrafo declarativo -------------------------------------------------
  y = richParagraph(
    doc,
    [
      { text: "Yo," },
      { text: `${params.funcionarioName.toUpperCase()},`, bold: true, underline: true },
      { text: "cédula de identidad N°" },
      { text: `${formatRut(params.funcionarioRut)},`, bold: true, underline: true },
      { text: "declaro haber participado en la" },
      { text: params.courseTitle, bold: true },
      { text: "del" },
      { text: `${params.institutionName},`, bold: true },
      { text: `realizada con fecha ${day} de ${month} de ${year}.` },
    ],
    MARGIN_X,
    y,
    CONTENT_W,
    11.5,
  );
  y += 3;

  doc.setFont("times", "bold");
  doc.setFontSize(11);
  doc.text("A su vez, en dicha instancia se abordaron los siguientes temas:", MARGIN_X, y);
  y += 4;

  // --- Tabla de temas ------------------------------------------------------
  const colN = 10;
  const colCharge = 44;
  const colTopic = CONTENT_W - colN - colCharge;
  const pad = 1.6;
  const fontSize = 9;
  const lh = fontSize * 0.42;

  const drawHeader = () => {
    const h = 7;
    doc.setFillColor(...HEADER_FILL);
    doc.setDrawColor(0);
    doc.setLineWidth(0.25);
    doc.rect(MARGIN_X, y, CONTENT_W, h, "FD");
    doc.line(MARGIN_X + colN, y, MARGIN_X + colN, y + h);
    doc.line(MARGIN_X + colN + colTopic, y, MARGIN_X + colN + colTopic, y + h);
    doc.setTextColor(255, 255, 255);
    doc.setFont("times", "bold");
    doc.setFontSize(9);
    doc.text("N°", MARGIN_X + colN / 2, y + 4.7, { align: "center" });
    doc.text("TEMAS TRATADOS", MARGIN_X + colN + colTopic / 2, y + 4.7, { align: "center" });
    doc.text("A CARGO DE", MARGIN_X + colN + colTopic + colCharge / 2, y + 4.7, { align: "center" });
    doc.setTextColor(0, 0, 0);
    y += h;
  };
  drawHeader();

  topics.forEach((item, index) => {
    doc.setFont("times", "normal");
    doc.setFontSize(fontSize);
    const topicLines = doc.splitTextToSize(item.topic, colTopic - pad * 2) as string[];
    const chargeLines = doc.splitTextToSize(item.inCharge, colCharge - pad * 2) as string[];
    const rowH = Math.max(topicLines.length, chargeLines.length) * lh + pad * 2 + 0.6;

    if (y + rowH > PAGE_H - MARGIN_BOTTOM) {
      doc.addPage();
      y = MARGIN_TOP;
      drawHeader();
      doc.setFont("times", "normal");
      doc.setFontSize(fontSize);
    }

    doc.setDrawColor(0);
    doc.setLineWidth(0.25);
    doc.rect(MARGIN_X, y, CONTENT_W, rowH);
    doc.line(MARGIN_X + colN, y, MARGIN_X + colN, y + rowH);
    doc.line(MARGIN_X + colN + colTopic, y, MARGIN_X + colN + colTopic, y + rowH);

    const textY = y + pad + lh * 0.8;
    doc.setFont("times", "bold");
    doc.text(String(index + 1), MARGIN_X + colN / 2, textY, { align: "center" });
    doc.setFont("times", "normal");
    doc.text(topicLines.join("\n"), MARGIN_X + colN + pad, textY, {
      align: "justify",
      maxWidth: colTopic - pad * 2,
      lineHeightFactor: lh / (fontSize * 0.3528),
    });
    doc.text(chargeLines, MARGIN_X + colN + colTopic + pad, textY, {
      lineHeightFactor: lh / (fontSize * 0.3528),
    });
    y += rowH;
  });
  y += 6;

  // --- Compromiso y firma ---------------------------------------------------
  const commitment =
    "Asimismo, declaro haber sido informado sobre las personas y los canales a través de los cuales puedo realizar consultas relacionadas con los contenidos expuestos. Del mismo modo, asumo el compromiso de conocer, revisar, cumplir y respetar las normas, los procedimientos y las políticas institucionales informadas durante el desarrollo de esta inducción.";
  if (y + 45 > PAGE_H - MARGIN_BOTTOM) {
    doc.addPage();
    y = MARGIN_TOP;
  }
  y = richParagraph(doc, [{ text: commitment }], MARGIN_X, y, CONTENT_W, 10.5);

  y += 22;
  doc.setLineWidth(0.3);
  doc.line(center - 32, y, center + 32, y);
  doc.setFont("times", "normal");
  doc.setFontSize(10.5);
  doc.text("Firma del participante", center, y + 5, { align: "center" });

  doc.setFont("times", "italic");
  doc.setFontSize(9.5);
  doc.setTextColor(80, 80, 80);
  doc.text("C.c.: Carpeta personal", MARGIN_X, y + 16);

  return Buffer.from(doc.output("arraybuffer"));
}

/**
 * Convierte el logo del colegio a data URL. Acepta data URL, URL absoluta o
 * ruta relativa dentro de /public. Devuelve null si no se puede leer.
 */
export async function getLogoDataUrl(logoUrl: string | null | undefined): Promise<string | null> {
  if (!logoUrl) return null;
  if (logoUrl.startsWith("data:")) return logoUrl;
  try {
    if (logoUrl.startsWith("/")) {
      const filePath = path.join(process.cwd(), "public", path.normalize(logoUrl).replace(/^([/\\])+/, ""));
      if (!filePath.startsWith(path.join(process.cwd(), "public"))) return null;
      const buffer = await readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : null;
      return mime ? `data:${mime};base64,${buffer.toString("base64")}` : null;
    }
    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}
