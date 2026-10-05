"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clock, Download, Search, Users, XCircle } from "lucide-react";
import { formatRut } from "@/lib/rut";
import type { ComplianceCourse, ComplianceRow, ComplianceStatus } from "@/server/queries/reports";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Filter = "ALL" | "DONE" | "NOT_DONE" | "NOT_ASSIGNED";

const STATUS_LABELS: Record<ComplianceStatus, string> = {
  COMPLETED: "Completada",
  IN_PROGRESS: "En curso",
  PENDING: "Pendiente",
  FAILED: "Reprobada",
  NOT_ASSIGNED: "No asignada",
};

const ALL_AREAS = "__todas__";

/** Las fechas se guardan como medianoche UTC (fecha de ingreso) o con hora (completado). */
function formatDate(value: Date | string | null, utc = false): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(utc ? { timeZone: "UTC" } : {}),
  });
}

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function ComplianceReport({
  institutionName,
  courses,
  rows,
}: {
  institutionName: string;
  courses: ComplianceCourse[];
  rows: ComplianceRow[];
}) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [area, setArea] = useState(ALL_AREAS);
  const [search, setSearch] = useState("");

  const course = courses.find((c) => c.id === courseId);

  const areas = useMemo(
    () => [...new Set(rows.map((r) => r.areaName).filter((a): a is string => Boolean(a)))].sort(),
    [rows],
  );

  // Estado de cada funcionario en el curso elegido.
  const withStatus = useMemo(
    () =>
      rows.map((row) => {
        const p = row.progress[courseId];
        return {
          row,
          status: (p?.status ?? "NOT_ASSIGNED") as ComplianceStatus,
          completedAt: p?.completedAt ?? null,
          finalScore: p?.finalScore ?? null,
        };
      }),
    [rows, courseId],
  );

  const inArea = useMemo(
    () => (area === ALL_AREAS ? withStatus : withStatus.filter((x) => x.row.areaName === area)),
    [withStatus, area],
  );

  const stats = useMemo(() => {
    const done = inArea.filter((x) => x.status === "COMPLETED").length;
    const notAssigned = inArea.filter((x) => x.status === "NOT_ASSIGNED").length;
    return {
      total: inArea.length,
      done,
      notDone: inArea.length - done,
      notAssigned,
      percent: inArea.length > 0 ? Math.round((done / inArea.length) * 100) : 0,
    };
  }, [inArea]);

  const visible = useMemo(() => {
    let list = inArea;
    if (filter === "DONE") list = list.filter((x) => x.status === "COMPLETED");
    if (filter === "NOT_DONE") list = list.filter((x) => x.status !== "COMPLETED");
    if (filter === "NOT_ASSIGNED") list = list.filter((x) => x.status === "NOT_ASSIGNED");
    const query = search.trim().toLowerCase();
    if (query) {
      const digits = query.replace(/[^0-9k]/g, "");
      list = list.filter(
        (x) =>
          x.row.name.toLowerCase().includes(query) ||
          (digits.length >= 3 && x.row.rut.toLowerCase().replace(/[^0-9k]/g, "").includes(digits)) ||
          x.row.positionName?.toLowerCase().includes(query),
      );
    }
    return list;
  }, [inArea, filter, search]);

  function exportCsv() {
    const header = [
      "Colegio",
      "Inducción",
      "Funcionario",
      "RUT",
      "Cargo",
      "Área",
      "Fecha ingreso",
      "Estado",
      "Fecha completado",
      "Nota",
    ];
    const lines = visible.map((x) =>
      [
        institutionName,
        course?.title ?? "",
        x.row.name,
        formatRut(x.row.rut),
        x.row.positionName ?? "",
        x.row.areaName ?? "",
        formatDate(x.row.hireDate, true),
        STATUS_LABELS[x.status],
        formatDate(x.completedAt),
        x.finalScore ?? "",
      ]
        .map(csvCell)
        .join(";"),
    );
    // BOM + ";" para que Excel en español lo abra con columnas y tildes correctas.
    const blob = new Blob(["﻿" + [header.join(";"), ...lines].join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte-${(course?.title ?? "induccion").replace(/[^\w-]+/g, "_")}-${institutionName.replace(/[^\w-]+/g, "_")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (courses.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Este colegio aún no tiene inducciones o capacitaciones publicadas.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Selección de curso y filtros */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger className="lg:w-80">
              <SelectValue placeholder="Selecciona una inducción" />
            </SelectTrigger>
            <SelectContent>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title}
                  {c.typeName ? ` · ${c.typeName}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={area} onValueChange={setArea}>
            <SelectTrigger className="lg:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_AREAS}>Todas las áreas</SelectItem>
              {areas.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, RUT o cargo"
              className="pl-8"
            />
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={visible.length === 0} className="gap-1.5">
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </CardContent>
      </Card>

      {/* Resumen (clic para filtrar) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={Users}
          label="Funcionarios activos"
          value={stats.total}
          active={filter === "ALL"}
          onClick={() => setFilter("ALL")}
        />
        <SummaryCard
          icon={CheckCircle2}
          label={`Completaron (${stats.percent}%)`}
          value={stats.done}
          tone="success"
          active={filter === "DONE"}
          onClick={() => setFilter("DONE")}
        />
        <SummaryCard
          icon={Clock}
          label="No han completado"
          value={stats.notDone}
          tone="warning"
          active={filter === "NOT_DONE"}
          onClick={() => setFilter("NOT_DONE")}
        />
        <SummaryCard
          icon={XCircle}
          label="Sin asignar"
          value={stats.notAssigned}
          active={filter === "NOT_ASSIGNED"}
          onClick={() => setFilter("NOT_ASSIGNED")}
        />
      </div>

      {/* Detalle */}
      <Card>
        <CardContent className="px-0 py-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="min-w-[200px]">Funcionario</TableHead>
                  <TableHead className="w-32">RUT</TableHead>
                  <TableHead className="min-w-[160px]">Cargo y área</TableHead>
                  <TableHead className="w-28">Fecha ingreso</TableHead>
                  <TableHead className="w-36">Estado</TableHead>
                  <TableHead className="w-32">Completado</TableHead>
                  <TableHead className="w-16 text-right pr-4">Nota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-28 text-center text-sm text-muted-foreground">
                      No hay funcionarios en esta vista.
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((x) => (
                    <TableRow key={x.row.id}>
                      <TableCell className="font-medium">{x.row.name}</TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">{formatRut(x.row.rut)}</TableCell>
                      <TableCell className="text-xs">
                        <span className="block">{x.row.positionName ?? "—"}</span>
                        <span className="block text-muted-foreground">{x.row.areaName ?? "Sin área"}</span>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {formatDate(x.row.hireDate, true) || "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={x.status} />
                      </TableCell>
                      <TableCell className="text-xs tabular-nums" suppressHydrationWarning>
                        {formatDate(x.completedAt) || "—"}
                      </TableCell>
                      <TableCell className="text-right pr-4 text-xs tabular-nums">
                        {x.finalScore !== null ? `${x.finalScore}%` : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: ComplianceStatus }) {
  if (status === "COMPLETED") {
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">{STATUS_LABELS[status]}</Badge>;
  }
  if (status === "FAILED") return <Badge variant="destructive">{STATUS_LABELS[status]}</Badge>;
  if (status === "NOT_ASSIGNED") return <Badge variant="outline">{STATUS_LABELS[status]}</Badge>;
  return (
    <Badge variant="outline" className="border-amber-500 bg-amber-50 text-amber-700">
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone = "default",
  active,
  onClick,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone?: "default" | "success" | "warning";
  active: boolean;
  onClick: () => void;
}) {
  const toneClass =
    tone === "success"
      ? "bg-emerald-500/10 text-emerald-600"
      : tone === "warning"
        ? "bg-amber-500/10 text-amber-600"
        : "bg-primary/10 text-primary";
  return (
    <button type="button" onClick={onClick} className="text-left" aria-pressed={active}>
      <Card className={`transition-colors hover:bg-muted/40 ${active ? "ring-2 ring-primary" : ""}`}>
        <CardContent className="flex items-center gap-3 p-4">
          <div className={`rounded-md p-2 ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold leading-tight tabular-nums">{value}</p>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}
