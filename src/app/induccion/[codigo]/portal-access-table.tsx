"use client";

import { useMemo, useState } from "react";
import { Copy, Printer, Search } from "lucide-react";
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

export function PortalAccessTable({ rows, areaName }: { rows: PortalAccessRow[]; areaName: string }) {
  const [search, setSearch] = useState("");

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
                  <TableHead className="w-36 print:hidden">Constancia</TableHead>
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
                    <TableCell className="print:hidden">
                      <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                        <a href={row.certificateUrl} target="_blank" rel="noreferrer">
                          ⬇️ Constancia
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground print:hidden">
        El PIN y el enlace desaparecen cuando el funcionario ingresa o cuando la invitación vence.
      </p>
    </div>
  );
}
