"use client";

import { useState, useRef } from "react";
import {
  FileText,
  Download,
  Loader2,
  Edit3,
  RotateCcw,
  Plus,
  Trash2,
  Check,
  Eye,
} from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { toast } from "sonner";
import { formatRut } from "@/lib/rut";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface CertificateTopic {
  id: string;
  topic: string;
  inCharge: string;
}

export const DEFAULT_CERTIFICATE_TOPICS: CertificateTopic[] = [
  {
    id: "1",
    topic:
      "Bienvenida, organigrama general del colegio, proyecto educativo, misión y visión del Establecimiento Educacional.",
    inCharge: "Director",
  },
  {
    id: "2",
    topic:
      "Normativa interna, composición del Reglamento Interno de Orden, Higiene y Seguridad. Ley N° 21.643, conductas de acoso sexual, laboral y violencia en el trabajo y sus sanciones. Reglamento Interno y Manual de Convivencia Escolar y Reglamento de Evaluación y Promoción Escolar. Ley N°20.845 de Inclusión Escolar. Ley TEA N ° 21.545 y Circular N° 586.",
    inCharge: "Abogada",
  },
  {
    id: "3",
    topic:
      "Se informa de los riesgos laborales, equipo DEA y respuesta ante emergencias (disponibilidad de extintores, redes húmedas y vías de evacuación), definiciones de peligro y riesgo, tránsito por áreas de trabajo, uso de equipos eléctricos, uso vasos o tazas con líquidos calientes, caídas de mismo nivel, electrocución, quemaduras y medidas preventivas y los riesgos más frecuentes de Informar de Riesgos Laborales de acuerdo al artículo 15 del Decreto N° 44. Comité Paritario de Higiene y Seguridad, campañas porrazos y buenos tratos. Ley N°16.744: contingencias cubiertas, tipo de prestaciones, organismo administrador. Responsabilidad del empleador, artículo 15 del Decreto N° 44 y artículo 184 del Código del Trabajo. Responsabilidad del trabajador, artículo 56 del Decreto N° 44.",
    inCharge: "Ingeniero en Prevención de Riesgos",
  },
  {
    id: "4",
    topic:
      "Localización de las áreas, cuidado de las dependencias y normas de funcionamiento.",
    inCharge: "Inspectora General",
  },
  {
    id: "5",
    topic:
      "Sistema de contratación, horarios de trabajo (ingreso, colación y salida), salidas durante la jornada de trabajo, atrasos, inasistencias, permisos, vacaciones, licencias médicas y firma electrónica.",
    inCharge: "RRHH",
  },
  {
    id: "6",
    topic: "Perfil integral del funcionario.",
    inCharge: "Psicóloga Organizacional",
  },
  {
    id: "7",
    topic:
      "Política de uso de sistemas informáticos, seguridad de la información, control de accesos, correo electrónico, almacenamiento digital, protección de equipos y reporte de incidentes.",
    inCharge: "Área Tics",
  },
];

interface ParticipationCertificateModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  funcionarioName: string;
  funcionarioRut: string;
  courseTitle: string;
  institutionName?: string;
  institutionLogoUrl?: string | null;
  completionDate?: Date | null;
}

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function ParticipationCertificateModal({
  isOpen,
  onOpenChange,
  funcionarioName,
  funcionarioRut,
  courseTitle,
  institutionName = "Colegio Diego Portales",
  institutionLogoUrl,
  completionDate,
}: ParticipationCertificateModalProps) {
  const [topics, setTopics] = useState<CertificateTopic[]>(
    DEFAULT_CERTIFICATE_TOPICS,
  );
  const [activeTab, setActiveTab] = useState<"preview" | "edit">("preview");

  const dateObj = completionDate ? new Date(completionDate) : new Date();
  const [customDay, setCustomDay] = useState(String(dateObj.getDate()));
  const [customMonth, setCustomMonth] = useState(
    MONTH_NAMES[dateObj.getMonth()],
  );
  const [customYear, setCustomYear] = useState(String(dateObj.getFullYear()));

  function handleAddTopic() {
    setTopics((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        topic: "Nuevo tema de inducción abordado.",
        inCharge: "Responsable",
      },
    ]);
  }

  function handleRemoveTopic(id: string) {
    setTopics((prev) => prev.filter((t) => t.id !== id));
  }

  function handleUpdateTopic(
    id: string,
    field: "topic" | "inCharge",
    val: string,
  ) {
    setTopics((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: val } : t)),
    );
  }

  function handleResetDefault() {
    if (
      confirm(
        "¿Restaurar los 7 temas y relatores institucionales por defecto?",
      )
    ) {
      setTopics(DEFAULT_CERTIFICATE_TOPICS);
    }
  }

  const [isDownloading, setIsDownloading] = useState(false);
  const certRef = useRef<HTMLDivElement>(null);

  async function handleDownloadPdf() {
    setIsDownloading(true);
    const toastId = toast.loading("Generando constancia en formato PDF...");

    try {
      // Si estamos en la pestaña de edición, pasar a vista previa primero
      if (activeTab !== "preview") {
        setActiveTab("preview");
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      const element =
        certRef.current || document.getElementById("printable-certificate");
      if (!element) {
        toast.error("No se encontró el documento para exportar", { id: toastId });
        return;
      }

      // Asegurar que las imágenes dentro estén completamente cargadas
      const images = Array.from(element.querySelectorAll("img"));
      await Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        })
      );

      // Renderizar con html2canvas en alta resolución (2.5x retina)
      const canvas = await html2canvas(element, {
        scale: 2.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");

      // Crear PDF tamaño carta (Letter: 215.9 mm x 279.4 mm)
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "letter",
        compress: true,
      });

      const pageWidth = 215.9;
      const pageHeight = 279.4;
      const marginX = 14;
      const marginY = 12;
      const maxW = pageWidth - marginX * 2; // 187.9 mm
      const maxH = pageHeight - marginY * 2; // 255.4 mm

      let renderW = maxW;
      let renderH = (canvas.height * renderW) / canvas.width;

      // Garantizar que quepa 100% en una sola página tamaño carta
      if (renderH > maxH) {
        renderH = maxH;
        renderW = (canvas.width * renderH) / canvas.height;
      }

      const posX = marginX + (maxW - renderW) / 2;
      const posY = marginY;

      pdf.addImage(
        imgData,
        "PNG",
        posX,
        posY,
        renderW,
        renderH,
        undefined,
        "FAST"
      );

      const cleanFuncionario = funcionarioName
        .replace(/[/\\?%*:|"<>]/g, "")
        .trim();
      const cleanCourse = courseTitle.replace(/[/\\?%*:|"<>]/g, "").trim();
      const filename = `Constancia - ${cleanFuncionario} - ${cleanCourse}.pdf`;

      pdf.save(filename);
      toast.success("Constancia descargada exitosamente en formato PDF", {
        id: toastId,
      });
    } catch (err) {
      console.error("Error al exportar PDF:", err);
      toast.error("Error al generar el archivo PDF", { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden sm:rounded-xl max-h-[92vh] flex flex-col">
        <DialogHeader className="px-6 pt-5 pb-3 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">
                  Constancia de Participación
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Documento formal para archivar en carpeta personal de{" "}
                  <strong className="text-foreground">{funcionarioName}</strong>
                </DialogDescription>
              </div>
            </div>

            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "preview" | "edit")}
              className="w-auto"
            >
              <TabsList className="h-8">
                <TabsTrigger value="preview" className="text-xs px-3 gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  Vista Previa
                </TabsTrigger>
                <TabsTrigger value="edit" className="text-xs px-3 gap-1.5">
                  <Edit3 className="h-3.5 w-3.5" />
                  Editar Temas ({topics.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-100/70 dark:bg-slate-950/40">
          {activeTab === "edit" ? (
            /* =================== MODO EDICIÓN =================== */
            <div className="space-y-4 max-w-2xl mx-auto bg-background p-6 rounded-xl border shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b">
                <div>
                  <h3 className="font-semibold text-sm">
                    Modificar datos y temas tratados
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Los cambios se reflejarán inmediatamente en la constancia
                    para imprimir.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResetDefault}
                  className="h-8 text-xs gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  Restaurar Original
                </Button>
              </div>

              {/* Ajuste de fecha */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-muted/40 rounded-lg text-xs">
                <div>
                  <label className="font-medium text-muted-foreground block mb-1">
                    Día
                  </label>
                  <Input
                    value={customDay}
                    onChange={(e) => setCustomDay(e.target.value)}
                    className="h-8 text-xs bg-background"
                  />
                </div>
                <div>
                  <label className="font-medium text-muted-foreground block mb-1">
                    Mes
                  </label>
                  <Input
                    value={customMonth}
                    onChange={(e) => setCustomMonth(e.target.value)}
                    className="h-8 text-xs bg-background"
                  />
                </div>
                <div>
                  <label className="font-medium text-muted-foreground block mb-1">
                    Año
                  </label>
                  <Input
                    value={customYear}
                    onChange={(e) => setCustomYear(e.target.value)}
                    className="h-8 text-xs bg-background"
                  />
                </div>
              </div>

              {/* Lista de temas */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Temas ({topics.length})
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAddTopic}
                    className="h-7 text-xs text-primary gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Agregar Tema
                  </Button>
                </div>

                {topics.map((t, idx) => (
                  <div
                    key={t.id}
                    className="p-3 border rounded-lg bg-card space-y-2 relative group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[11px] font-bold text-foreground">
                        {idx + 1}
                      </span>
                      <div className="flex-1">
                        <Input
                          placeholder="A cargo de (ej. Director, RRHH...)"
                          value={t.inCharge}
                          onChange={(e) =>
                            handleUpdateTopic(t.id, "inCharge", e.target.value)
                          }
                          className="h-7 text-xs font-semibold bg-background"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveTopic(t.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="Eliminar tema"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <Textarea
                      value={t.topic}
                      onChange={(e) =>
                        handleUpdateTopic(t.id, "topic", e.target.value)
                      }
                      placeholder="Descripción del tema tratado..."
                      rows={2}
                      className="text-xs leading-relaxed resize-y bg-background"
                    />
                  </div>
                ))}
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="button"
                  onClick={() => setActiveTab("preview")}
                  className="gap-1.5 h-8 text-xs"
                >
                  <Check className="h-3.5 w-3.5" />
                  Ver en la plantilla
                </Button>
              </div>
            </div>
          ) : (
            /* =================== HOJA DE DOCUMENTO (VISTA PREVIA / IMPRESIÓN) =================== */
            <div className="flex justify-center">
              <div
                id="printable-certificate"
                ref={certRef}
                className="w-full max-w-[740px] bg-white text-black p-8 sm:p-9 shadow-lg border border-gray-200 font-serif leading-normal text-[12px] print:m-0 print:p-0 print:border-none print:shadow-none print:w-full"
              >
                {/* Cabecera con Logo en esquina izquierda superior */}
                <div className="relative mb-5">
                  <div className="flex items-start justify-between">
                    {/* Logo en esquina izquierda superior */}
                    <div className="w-24 shrink-0 flex items-start justify-start pt-0.5">
                      {institutionLogoUrl ? (
                        <img
                          src={institutionLogoUrl}
                          alt={institutionName}
                          className="h-16 w-auto max-w-[90px] object-contain print:h-16"
                          crossOrigin="anonymous"
                        />
                      ) : null}
                    </div>

                    {/* Títulos institucionales centrados */}
                    <div className="flex-1 text-center px-2">
                      <h1 className="text-base font-bold uppercase tracking-wider text-black font-serif">
                        {institutionName.toUpperCase()}
                      </h1>
                      <p className="text-xs italic text-gray-700 font-serif mt-0.5">
                        “Educar para una vida mejor”
                      </p>

                      <div className="mt-4 space-y-0.5">
                        <h2 className="text-sm font-bold underline tracking-wide uppercase font-serif">
                          CONSTANCIA DE PARTICIPACIÓN
                        </h2>
                        <h3 className="text-xs sm:text-sm font-bold underline tracking-wide uppercase font-serif">
                          {courseTitle.toUpperCase()}
                        </h3>
                      </div>
                    </div>

                    {/* Espaciador simétrico a la derecha para mantener centrado perfecto */}
                    <div className="w-24 shrink-0" aria-hidden="true" />
                  </div>
                </div>

                {/* Párrafo declarativo */}
                <p className="text-justify mb-3 leading-normal text-[12px]">
                  Yo,{" "}
                  <strong className="underline font-bold">
                    {funcionarioName.toUpperCase()}
                  </strong>
                  , cédula de identidad N°{" "}
                  <strong className="underline font-bold font-mono">
                    {formatRut(funcionarioRut)}
                  </strong>
                  , declaro haber participado en la{" "}
                  <strong className="font-bold">{courseTitle}</strong> del{" "}
                  <strong className="font-bold">{institutionName}</strong>,
                  realizada con fecha {customDay} de {customMonth} de{" "}
                  {customYear}.
                </p>

                <p className="mb-2 font-bold text-[11.5px]">
                  A su vez, en dicha instancia se abordaron los siguientes
                  temas:
                </p>

                {/* Tabla de temas */}
                <table className="w-full border-collapse border border-black text-[10.5px] mb-5 font-serif">
                  <thead>
                    <tr className="bg-[#1c3d5a] text-white print:bg-[#1c3d5a] print:text-white">
                      <th className="border border-black py-1.5 px-1 text-center w-8 font-bold text-[10px] text-white">
                        N°
                      </th>
                      <th className="border border-black py-1.5 px-2 text-center font-bold text-[10px] tracking-wider uppercase text-white">
                        TEMAS TRATADOS
                      </th>
                      <th className="border border-black py-1.5 px-2 text-center w-44 font-bold text-[10px] tracking-wider uppercase text-white">
                        A CARGO DE
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {topics.map((item, index) => (
                      <tr key={item.id} className="align-top">
                        <td className="border border-black py-1.5 px-1 text-center font-bold font-mono">
                          {index + 1}
                        </td>
                        <td className="border border-black py-1.5 px-2 text-justify leading-snug">
                          {item.topic}
                        </td>
                        <td className="border border-black py-1.5 px-2 text-left leading-snug font-medium">
                          {item.inCharge}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Párrafo de compromiso */}
                <p className="text-justify mb-4 text-[11px] leading-relaxed">
                  Asimismo, declaro haber sido informado sobre las personas y los
                  canales a través de los cuales puedo realizar consultas
                  relacionadas con los contenidos expuestos. Del mismo modo,
                  asumo el compromiso de conocer, revisar, cumplir y respetar
                  las normas, los procedimientos y las políticas
                  institucionales informadas durante el desarrollo de esta
                  inducción.
                </p>

                {/* Pie de firma (más abajo con margin top generoso) */}
                <div className="flex flex-col items-center justify-center mt-14 mb-8">
                  <div className="w-56 border-t border-black mb-1.5" />
                  <span className="text-[11px] font-serif">
                    Firma del participante
                  </span>
                </div>

                <div className="text-[10px] text-gray-700 italic">
                  C.c.: Carpeta personal
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-3.5 border-t bg-background flex items-center justify-between sm:justify-between">
          <div className="text-xs text-muted-foreground">
            <span>
              Documento formal en formato <strong>Tamaño Carta</strong> listo para descargar en <strong>PDF</strong>.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cerrar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generando PDF...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Descargar PDF
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Estilos CSS scoped para asegurar tamaño carta (Letter) y 1 sola página exacta en PDF */}
      <style jsx global>{`
        @page {
          size: letter portrait;
          margin: 10mm 15mm;
        }
        @media print {
          html,
          body {
            width: 215.9mm !important;
            height: 279.4mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-certificate,
          #printable-certificate * {
            visibility: visible !important;
          }
          #printable-certificate {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            border: none !important;
            box-shadow: none !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          #printable-certificate img {
            max-width: 90px !important;
            max-height: 72px !important;
            display: block !important;
            visibility: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #printable-certificate table {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          #printable-certificate table th {
            background-color: #1c3d5a !important;
            color: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </Dialog>
  );
}
