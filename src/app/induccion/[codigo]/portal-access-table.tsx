"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, Printer, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { formatRut } from "@/lib/rut";
import type { PortalAccessRow, PortalAccessStatus } from "@/server/services/area-portal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS: Record<PortalAccessStatus, { label: string; className: string }> = {
  PENDING: { label: "Pendiente de ingreso", className: "border-amber-500 bg-amber-50 text-amber-700" },
  USED: { label: "Ya ingresó", className: "border-emerald-500 bg-emerald-50 text-emerald-700" },
  BLOCKED: { label: "Bloqueada (pedir a RRHH)", className: "border-red-500 bg-red-50 text-red-700" },
};

const MAX_BYTES = 20 * 1024 * 1024;

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

interface UploadResponse {
  error?: string;
  message?: string;
  size?: number;
  originalSize?: number;
  optimized?: boolean;
}

/** Sube con XMLHttpRequest para mostrar el avance (fetch no informa el progreso de subida). */
function uploadWithProgress(url: string, body: FormData, onProgress: (percent: number) => void) {
  return new Promise<{ ok: boolean; data: UploadResponse }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      let data: UploadResponse = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = { error: xhr.status === 413 ? "El archivo es demasiado grande." : undefined };
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, data });
    };
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(body);
  });
}

export function PortalAccessTable({
  rows,
  areaName,
  code,
}: {
  rows: PortalAccessRow[];
  areaName: string;
  /** Código del portal ("dp-utp"), para la ruta de constancias. */
  code: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<PortalAccessRow | null>(null);
  /** Fila subiendo y su avance (0-100; 100 = optimizando en el servidor). */
  const [uploading, setUploading] = useState<{ id: string; percent: number } | null>(null);
  const constanciaUrl = `/induccion/${encodeURIComponent(code)}/constancia`;

  function pickFile(row: PortalAccessRow) {
    uploadTarget.current = row;
    fileInput.current?.click();
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const row = uploadTarget.current;
    if (!file || !row) return;

    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      toast.error("La constancia firmada debe ser un archivo PDF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(`El PDF pesa ${formatBytes(file.size)}; el máximo es 20 MB. Escanéalo con menor resolución.`);
      return;
    }

    setUploading({ id: row.invitationId, percent: 0 });
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("invitationId", row.invitationId);
      const { ok, data } = await uploadWithProgress(constanciaUrl, body, (percent) =>
        setUploading({ id: row.invitationId, percent }),
      );
      if (!ok) {
        toast.error(data.error ?? "No se pudo subir la constancia.");
        return;
      }
      const weight =
        data.optimized && data.originalSize && data.size && data.originalSize > data.size
          ? ` Optimizada: ${formatBytes(data.originalSize)} → ${formatBytes(data.size)}.`
          : "";
      toast.success(`${data.message ?? "Constancia guardada."}${weight}`, { duration: 6000 });
      router.refresh();
    } catch {
      toast.error("Error de conexión al subir la constancia. Inténtalo de nuevo.");
    } finally {
      setUploading(null);
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    const digits = q.replace(/[^0-9k]/g, "");
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (digits.length >= 3 && r.rut.toLowerCase().replace(/[^0-9k]/g, "").includes(digits)),
    );
  }, [rows, search]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Enlace copiado.");
    } catch {
      toast.error("No se pudo copiar; selecciona el enlace y cópialo manualmente.");
    }
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No hay accesos vigentes para {areaName}. Cuando RRHH envíe nuevas invitaciones aparecerán aquí.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row print:hidden">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o RUT"
            className="pl-8"
          />
        </div>
        <Button variant="outline" className="gap-1.5" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Imprimir
        </Button>
      </div>

      <Card>
        <CardContent className="px-0 py-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="min-w-[200px]">Funcionario</TableHead>
                  <TableHead className="w-28">PIN</TableHead>
                  <TableHead className="min-w-[260px]">Enlace</TableHead>
                  <TableHead className="w-40">Estado</TableHead>
                  <TableHead className="w-44 print:hidden">Constancia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow key={row.invitationId} className="break-inside-avoid">
                    <TableCell>
                      <span className="block font-medium">{row.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{formatRut(row.rut)}</span>
                      <span className="block text-xs text-muted-foreground">{row.courseTitle}</span>
                    </TableCell>
                    <TableCell>
                      {row.pin ? (
                        <span className="rounded bg-slate-100 px-2 py-1 font-mono text-base font-bold tracking-[0.2em]">
                          {row.pin}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.link ? (
                        <div className="flex items-start gap-1">
                          <a href={row.link} target="_blank" rel="noreferrer" className="break-all text-blue-700 underline">
                            {row.link}
                          </a>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 shrink-0 p-0 print:hidden"
                            title="Copiar enlace"
                            onClick={() => copy(row.link!)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">
                          {row.status === "USED" ? "Ya fue usado" : "No disponible: pide un reenvío a RRHH"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS[row.status].className}>
                        {STATUS[row.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-y-1.5 print:hidden">
                      <Button asChild variant="outline" size="sm" className="h-8 w-full text-xs">
                        <a href={row.certificateUrl} target="_blank" rel="noreferrer">
                          ⬇️ Constancia
                        </a>
                      </Button>
                      {uploading?.id === row.invitationId ? (
                        <div className="space-y-1">
                          <div className="h-1.5 overflow-hidden rounded bg-slate-200">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${uploading.percent}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {uploading.percent < 100 ? `Subiendo ${uploading.percent}%` : "Optimizando PDF..."}
                          </p>
                        </div>
                      ) : row.signed ? (
                        <div className="flex items-center justify-between gap-1 text-[11px]">
                          <a
                            href={`${constanciaUrl}?invitacion=${row.invitationId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 font-medium text-emerald-700 hover:underline"
                            title={`Subida el ${new Date(row.signed.uploadedAt).toLocaleDateString("es-CL")} · ${formatBytes(row.signed.size)}`}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Firmada
                          </a>
                          <button
                            type="button"
                            className="text-muted-foreground underline hover:text-foreground disabled:opacity-50"
                            disabled={uploading !== null}
                            onClick={() => pickFile(row)}
                          >
                            Reemplazar
                          </button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-full gap-1 border-dashed text-xs"
                          disabled={uploading !== null}
                          onClick={() => pickFile(row)}
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Subir firmada (PDF)
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleFile} />
      <p className="text-xs text-muted-foreground print:hidden">
        El PIN y el enlace desaparecen cuando el funcionario ingresa o cuando la invitación vence. Para entregar la
        constancia firmada, descárgala, fírmala, escanéala en PDF y súbela con &quot;Subir firmada&quot; (máx. 20 MB; se
        optimiza automáticamente).
      </p>
    </div>
  );
}
