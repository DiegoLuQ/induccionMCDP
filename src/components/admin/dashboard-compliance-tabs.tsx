"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import type { ProgressStatus } from "@prisma/client";
import { SIN_ASIGNAR } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import { formatRut } from "@/lib/rut";
import { ProgressBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export interface DashboardPendingRow {
  id: string;
  name: string;
  rut: string;
  email: string;
  positionName: string | null;
  areaName: string | null;
  /** Estado en la inducción de referencia; null = sin asignar. */
  status: ProgressStatus | null;
}

export interface DashboardRecentRow {
  id: string;
  name: string;
  rut: string;
  positionName: string | null;
  areaName: string | null;
  courseTitle: string;
  status: ProgressStatus;
  updatedAt: Date;
}

type Tab = "pendientes" | "actividad";
type StatusFilter = "ALL" | "NONE" | ProgressStatus;

const ALL = "__todas__";
const STATUS_LABELS: Record<StatusFilter, string> = {
  ALL: "Todos los estados",
  NONE: "Sin asignar",
  PENDING: "Asignado (pendiente)",
  IN_PROGRESS: "En progreso",
  COMPLETED: "Completado",
};

/**
 * Tabla "Inducciones y Cumplimiento" del Inicio. Los filtros y la página viven
 * en la URL (?tab, ?area, ?estado, ?pagina): el servidor trae sólo 10 filas.
 */
export function DashboardComplianceTabs({
  tab,
  areaId,
  status,
  page,
  pageSize,
  areas,
  pendingTotal,
  recentTotal,
  pending,
  recent,
  courseTitle,
}: {
  tab: Tab;
  areaId: string;
  status: StatusFilter;
  page: number;
  pageSize: number;
  areas: Array<{ id: string; name: string }>;
  pendingTotal: number;
  recentTotal: number;
  pending: DashboardPendingRow[];
  recent: DashboardRecentRow[];
  courseTitle: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  /** Actualiza la URL; cualquier cambio de filtro vuelve a la página 1. */
  function navigate(changes: Partial<{ tab: Tab; area: string; estado: StatusFilter; pagina: number }>) {
    const params = new URLSearchParams(searchParams.toString());
    const set = (key: string, value: string | number | undefined, empty: string) => {
      if (value === undefined) return;
      if (String(value) === empty) params.delete(key);
      else params.set(key, String(value));
    };
    set("tab", changes.tab, "pendientes");
    set("area", changes.area, "");
    set("estado", changes.estado, "ALL");
    if (changes.pagina === undefined) params.delete("pagina");
    else set("pagina", changes.pagina, "1");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  const total = tab === "pendientes" ? pendingTotal : recentTotal;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filtered = areaId !== "" || status !== "ALL";
  const areaLabel =
    areaId === "" ? "Todas las áreas" : areaId === "none" ? "Sin área" : areas.find((a) => a.id === areaId)?.name ?? "Área";

  return (
    <div className={isPending ? "opacity-60 transition-opacity" : "transition-opacity"}>
      <div className="flex flex-col gap-3 border-b bg-muted/10 px-6 pt-4 pb-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Pestañas */}
        <div className="inline-flex rounded-md bg-muted/50 p-1">
          <button
            type="button"
            onClick={() =>
              navigate({ tab: "pendientes", estado: status === "COMPLETED" ? "ALL" : undefined })
            }
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium ${
              tab === "pendientes" ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
          >
            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
            Sin inducción aprobada
            <Badge variant={pendingTotal > 0 ? "destructive" : "secondary"} className="ml-1 h-4 px-1.5 py-0 text-[10px]">
              {pendingTotal}
            </Badge>
          </button>
          <button
            type="button"
            onClick={() => navigate({ tab: "actividad", estado: status === "NONE" ? "ALL" : undefined })}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium ${
              tab === "actividad" ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Últimos movimientos
            <Badge variant="secondary" className="ml-1 h-4 px-1.5 py-0 text-[10px]">
              {recentTotal}
            </Badge>
          </button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={areaId === "" ? ALL : areaId} onValueChange={(v) => navigate({ area: v === ALL ? "" : v })}>
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue>{areaLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-xs">
                Todas las áreas
              </SelectItem>
              {areas.map((a) => (
                <SelectItem key={a.id} value={a.id} className="text-xs">
                  {a.name}
                </SelectItem>
              ))}
              <SelectItem value="none" className="text-xs">
                Sin área
              </SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => navigate({ estado: v as StatusFilter })}>
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue>{STATUS_LABELS[status]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs">
                Todos los estados
              </SelectItem>
              {tab === "pendientes" && (
                <SelectItem value="NONE" className="text-xs">
                  Sin asignar
                </SelectItem>
              )}
              <SelectItem value="PENDING" className="text-xs">
                Asignado (pendiente)
              </SelectItem>
              <SelectItem value="IN_PROGRESS" className="text-xs">
                En progreso
              </SelectItem>
              {tab === "actividad" && (
                <SelectItem value="COMPLETED" className="text-xs">
                  Completado
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          {filtered && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => navigate({ area: "", estado: "ALL" })}>
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {tab === "pendientes" ? (
        pendingTotal === 0 && !filtered ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <CheckCircle2 className="mb-2 h-10 w-10 text-emerald-500" />
            <p className="text-sm font-semibold">¡Excelente! Todo el personal activo está al día</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Todos completaron {courseTitle ? <strong>{courseTitle}</strong> : "la inducción vigente"}.
            </p>
          </div>
        ) : pending.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">Nadie coincide con los filtros seleccionados.</p>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-amber-500/20 bg-amber-500/10 px-6 py-2.5 text-xs text-amber-900 dark:text-amber-200">
              <span>
                <strong>{pendingTotal}</strong> funcionario(s) aún no completan{" "}
                {courseTitle ? <strong>{courseTitle}</strong> : "la inducción vigente"}
                {filtered ? " (con los filtros aplicados)" : ""}.
              </span>
              <Button asChild size="sm" variant="ghost" className="h-7 text-xs hover:bg-amber-500/20">
                <Link href="/admin/invitaciones">Invitar →</Link>
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionario</TableHead>
                  <TableHead>Cargo y área</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="pr-6 text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <span className="block font-medium">{user.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {formatRut(user.rut)} {user.email ? `· ${user.email}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="block font-medium">{user.positionName ?? SIN_ASIGNAR}</span>
                      <span className="block text-muted-foreground">{user.areaName ?? "Sin área"}</span>
                    </TableCell>
                    <TableCell>
                      {user.status === "IN_PROGRESS" ? (
                        <Badge variant="warning">En progreso</Badge>
                      ) : user.status === "PENDING" ? (
                        <Badge variant="secondary">Asignado (pendiente)</Badge>
                      ) : (
                        <Badge variant="destructive">Sin asignar</Badge>
                      )}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                        <Link href="/admin/invitaciones">Gestionar</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )
      ) : recent.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-muted-foreground">
          {filtered ? "Ningún movimiento coincide con los filtros seleccionados." : "Aún no hay actividad registrada."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionario</TableHead>
              <TableHead>Inducción</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="pr-6 text-right">Actualizado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  <span className="block font-medium">{entry.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatRut(entry.rut)} · {entry.positionName ?? SIN_ASIGNAR} · {entry.areaName ?? "Sin área"}
                  </span>
                </TableCell>
                <TableCell className="max-w-[240px] truncate font-medium">{entry.courseTitle}</TableCell>
                <TableCell>
                  <ProgressBadge status={entry.status} />
                </TableCell>
                <TableCell className="pr-6 text-right text-sm text-muted-foreground" suppressHydrationWarning>
                  {formatDateTime(entry.updatedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Paginación (10 por página) */}
      {total > pageSize && (
        <div className="flex items-center justify-between border-t px-6 py-3 text-xs text-muted-foreground">
          <span>
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page <= 1 || isPending}
              onClick={() => navigate({ pagina: page - 1 })}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">
              Página {page} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page >= totalPages || isPending}
              onClick={() => navigate({ pagina: page + 1 })}
              aria-label="Página siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
