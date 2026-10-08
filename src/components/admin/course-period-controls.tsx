"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  correctCurrentPeriodAction,
  deleteCoursePeriodAction,
  revertCoursePeriodAction,
  switchCoursePeriodAction,
  startNewCoursePeriodAction,
  updateCourseMandatoryAction,
} from "@/server/actions/course-period-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatPeriod, nextPeriodCode, periodOrder, periodYear } from "@/lib/periods";

function toInputDate(value: Date | string | null): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function formatDue(value: Date | string | null): string {
  return value
    ? new Date(value).toLocaleDateString("es-CL", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" })
    : "";
}

/** Insignia "Obligatorio · 2026" para la tabla de cursos. */
export function CoursePeriodBadge({
  isMandatory,
  period,
  dueDate,
}: {
  isMandatory: boolean;
  period: number;
  dueDate: Date | string | null;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {isMandatory ? (
        <Badge className="bg-red-600 text-white hover:bg-red-600">Obligatorio</Badge>
      ) : (
        <Badge variant="secondary">Opcional</Badge>
      )}
      <Badge variant="outline">Período {formatPeriod(period)}</Badge>
      {isMandatory && dueDate && (
        <span className="text-[11px] text-muted-foreground">límite {formatDue(dueDate)}</span>
      )}
    </span>
  );
}

/** Botón + diálogo para configurar obligatoriedad, fecha límite y nuevo período. */
export function CoursePeriodControls({
  courseId,
  courseTitle,
  isMandatory,
  period,
  dueDate,
  activeCount,
  archivedPeriods,
}: {
  courseId: string;
  courseTitle: string;
  isMandatory: boolean;
  period: number;
  dueDate: Date | string | null;
  /** Funcionarios con avance en el período vigente (lo que se archivará). */
  activeCount: number;
  /** Períodos cerrados con datos archivados (historial y constancias). */
  archivedPeriods: Array<{ period: number; history: number; submissions: number; certificates: number }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [mandatory, setMandatory] = useState(isMandatory);
  const [due, setDue] = useState(toInputDate(dueDate));
  // Año del nuevo período (por defecto el año en curso; puede repetirse el del vigente).
  const defaultYear = String(Math.max(periodYear(period), new Date().getFullYear()));
  const [newPeriod, setNewPeriod] = useState(defaultYear);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);
  const [reverting, setReverting] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctYear, setCorrectYear] = useState(String(periodYear(period)));

  function correctPeriod() {
    startTransition(async () => {
      const result = await correctCurrentPeriodAction({ courseId, year: Number(correctYear) });
      if (result.success) {
        toast.success(result.message ?? "Período corregido.");
        setCorrecting(false);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }
  const [revertText, setRevertText] = useState("");
  // Período al que se volvería: el archivado más reciente anterior al vigente.
  const previousArchived = archivedPeriods
    .map((a) => a.period)
    .filter((p) => periodOrder(p) < periodOrder(period))
    .sort((a, b) => periodOrder(b) - periodOrder(a))[0];

  const [activating, setActivating] = useState<number | null>(null);

  function activatePeriod(target: number) {
    startTransition(async () => {
      const result = await switchCoursePeriodAction({ courseId, period: target });
      if (result.success) {
        toast.success(result.message ?? "Período activado.", { duration: 8000 });
        setActivating(null);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function revertPeriod() {
    startTransition(async () => {
      const result = await revertCoursePeriodAction({ courseId });
      if (result.success) {
        toast.success(result.message ?? "Se volvió al período anterior.", { duration: 8000 });
        setReverting(false);
        setRevertText("");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }
  const [deleteText, setDeleteText] = useState("");

  function deletePeriod(periodToDelete: number) {
    startTransition(async () => {
      const result = await deleteCoursePeriodAction({ courseId, period: periodToDelete });
      if (result.success) {
        toast.success(result.message ?? "Período eliminado.", { duration: 8000 });
        setDeleting(null);
        setDeleteText("");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function saveMandatory() {
    startTransition(async () => {
      const result = await updateCourseMandatoryAction({ courseId, isMandatory: mandatory, dueDate: due });
      if (result.success) {
        toast.success(result.message ?? "Guardado.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  const newCode = nextPeriodCode(
    period,
    Number(newPeriod),
    archivedPeriods.map((a) => a.period),
  );
  const newLabel = newCode ? formatPeriod(newCode) : "—";

  function startPeriod() {
    startTransition(async () => {
      const result = await startNewCoursePeriodAction({ courseId, year: Number(newPeriod) });
      if (result.success) {
        toast.success(result.message ?? "Nuevo período iniciado.", { duration: 8000 });
        setOpen(false);
        setConfirmText("");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1 text-xs"
        onClick={() => {
          setMandatory(isMandatory);
          setDue(toInputDate(dueDate));
          setNewPeriod(defaultYear);
          setConfirmText("");
          setOpen(true);
        }}
        title="Obligatoriedad y período"
      >
        <CalendarClock className="h-3.5 w-3.5" />
        Período
      </Button>

      <Dialog open={open} onOpenChange={(value) => !isPending && setOpen(value)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{courseTitle}</DialogTitle>
            <DialogDescription>Período vigente: {formatPeriod(period)}</DialogDescription>
          </DialogHeader>

          {/* Obligatoriedad */}
          <div className="space-y-3">
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={mandatory}
                onChange={(e) => setMandatory(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <strong>Obligatorio</strong> para todos los funcionarios activos.
                <span className="block text-xs text-muted-foreground">
                  Se mide su cumplimiento por área en el Inicio y en el Reporte.
                </span>
              </span>
            </label>
            {mandatory && (
              <div className="space-y-1">
                <Label htmlFor="due" className="text-xs">
                  Fecha límite (opcional)
                </Label>
                <Input id="due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-48" />
              </div>
            )}
            <div className="flex justify-end">
              <Button size="sm" onClick={saveMandatory} isLoading={isPending}>
                Guardar
              </Button>
            </div>
          </div>

          <Separator />

          {/* Nuevo período */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Iniciar nuevo período</p>
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                Se guarda en el historial el resultado del período {formatPeriod(period)} de {activeCount} funcionario(s) (estado,
                nota, fechas, respuestas y constancias firmadas) y el curso se reinicia: todos deberán
                realizarlo de nuevo en el período nuevo. Las invitaciones vigentes se anulan.
              </span>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="period" className="text-xs">
                  Año del nuevo período
                </Label>
                <Input
                  id="period"
                  type="number"
                  value={newPeriod}
                  onChange={(e) => setNewPeriod(e.target.value)}
                  className="w-28"
                />
                <p className="text-[11px] text-muted-foreground">
                  {newCode ? `Se creará el período ${newLabel}` : "Debe ser el año vigente o posterior"}
                </p>
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor="confirm" className="text-xs">
                  Escribe <strong>{newPeriod}</strong> para confirmar
                </Label>
                <Input id="confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="destructive"
                onClick={startPeriod}
                isLoading={isPending}
                disabled={!newCode || confirmText.trim() !== newPeriod.trim()}
              >
                Iniciar período {newLabel}
              </Button>
            </div>
          </div>

          {/* Períodos archivados */}
          <Separator />
          <div className="space-y-2">
            <p className="text-sm font-semibold">Períodos</p>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span>
                  <strong>Período {formatPeriod(period)}</strong> · vigente · {activeCount} funcionario(s) con avance
                </span>
                {previousArchived !== undefined && !reverting && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    disabled={isPending}
                    onClick={() => {
                      setReverting(true);
                      setRevertText("");
                    }}
                  >
                    Volver a {formatPeriod(previousArchived)}
                  </Button>
                )}
              </div>
              {/* Corregir el año del período vigente (conserva su actividad). */}
              {!reverting && (
                <div className="mt-2">
                  {correcting ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">
                        Corregir año del período vigente (se conservan avances, respuestas y constancias):
                      </span>
                      <Input
                        type="number"
                        value={correctYear}
                        onChange={(e) => setCorrectYear(e.target.value)}
                        className="h-8 w-24"
                      />
                      <Button size="sm" className="h-8" isLoading={isPending} onClick={correctPeriod}>
                        Guardar
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setCorrecting(false)}>
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="text-[11px] text-primary underline"
                      onClick={() => {
                        setCorrectYear(String(periodYear(period)));
                        setCorrecting(true);
                      }}
                    >
                      ¿Se abrió por error? Corregir el año del período vigente
                    </button>
                  )}
                </div>
              )}
              {reverting && previousArchived !== undefined && (
                <div className="mt-2 space-y-2">
                  <p className="text-amber-800">
                    El período {formatPeriod(period)} se <strong>archiva</strong> ({activeCount} funcionario(s) con
                    avance, sus videos, respuestas y constancias; no se pierde nada) y se activa{" "}
                    {formatPeriod(previousArchived)} con sus datos. Podrás volver a activar {formatPeriod(period)} desde
                    la lista de períodos archivados. Las invitaciones vigentes se anulan.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      value={revertText}
                      onChange={(e) => setRevertText(e.target.value.toUpperCase())}
                      placeholder="Escribe VOLVER"
                      className="h-8 w-36"
                    />
                    <Button
                      size="sm"
                      className="h-8"
                      isLoading={isPending}
                      disabled={revertText.trim() !== "VOLVER"}
                      onClick={revertPeriod}
                    >
                      Volver al período {formatPeriod(previousArchived)}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setReverting(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
            {archivedPeriods.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Aún no hay períodos archivados. Aparecerán aquí al usar &quot;Iniciar nuevo período&quot;
                (sólo si el período cerrado tenía resultados, respuestas o constancias).
              </p>
            ) : (
              <ul className="space-y-2">
                {archivedPeriods.map((item) => (
                  <li key={item.period} className="rounded-md border p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        <span className="font-semibold text-emerald-700">✔ </span>
                        <strong>Período {formatPeriod(item.period)}</strong> archivado · {item.history} resultado(s) ·{" "}
                        {item.submissions} respuesta(s) · {item.certificates} constancia(s) firmada(s)
                      </span>
                      {deleting !== item.period && activating !== item.period && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-[11px]"
                          title={`Activar el período ${formatPeriod(item.period)} (el vigente se archiva, sin perder datos)`}
                          disabled={isPending}
                          onClick={() => setActivating(item.period)}
                        >
                          Activar
                        </Button>
                      )}
                      {deleting !== item.period && activating !== item.period && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          title={`Eliminar el período ${item.period}`}
                          disabled={isPending}
                          onClick={() => {
                            setDeleting(item.period);
                            setDeleteText("");
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {activating === item.period && (
                      <div className="mt-2 space-y-2">
                        <p className="text-amber-800">
                          El período vigente ({formatPeriod(period)}) se archiva con todos sus datos y se activa{" "}
                          {formatPeriod(item.period)}. No se pierde nada: puedes volver cuando quieras.
                        </p>
                        <div className="flex items-center gap-2">
                          <Button size="sm" className="h-8" isLoading={isPending} onClick={() => activatePeriod(item.period)}>
                            Activar {formatPeriod(item.period)}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => setActivating(null)}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                    {deleting === item.period && (
                      <div className="mt-2 space-y-2">
                        <p className="text-destructive">
                          Se borrarán para siempre su historial, las respuestas archivadas y las constancias
                          firmadas (con sus archivos) del período {formatPeriod(item.period)}.
                        </p>
                        <div className="flex items-center gap-2">
                          <Input
                            value={deleteText}
                            onChange={(e) => setDeleteText(e.target.value)}
                            placeholder={`Escribe ${item.period}`}
                            className="h-8 w-32"
                          />
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8"
                            isLoading={isPending}
                            disabled={deleteText.trim() !== String(item.period)}
                            onClick={() => deletePeriod(item.period)}
                          >
                            Eliminar
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => setDeleting(null)}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
