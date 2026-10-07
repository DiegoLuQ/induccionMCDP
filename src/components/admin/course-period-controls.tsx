"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteCoursePeriodAction,
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
      <Badge variant="outline">Período {period}</Badge>
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
  archivedPeriods: Array<{ period: number; history: number; certificates: number }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [mandatory, setMandatory] = useState(isMandatory);
  const [due, setDue] = useState(toInputDate(dueDate));
  const [newPeriod, setNewPeriod] = useState(String(period + 1));
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);
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

  function startPeriod() {
    startTransition(async () => {
      const result = await startNewCoursePeriodAction({ courseId, newPeriod: Number(newPeriod) });
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
          setNewPeriod(String(period + 1));
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
            <DialogDescription>Período vigente: {period}</DialogDescription>
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
                Se guarda en el historial el resultado {period} de {activeCount} funcionario(s) (estado,
                nota, fechas, respuestas y constancias firmadas) y el curso se reinicia: todos deberán
                realizarlo de nuevo en el período nuevo. Las invitaciones vigentes se anulan.
              </span>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="period" className="text-xs">
                  Nuevo período
                </Label>
                <Input
                  id="period"
                  type="number"
                  value={newPeriod}
                  onChange={(e) => setNewPeriod(e.target.value)}
                  className="w-28"
                />
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
                disabled={confirmText.trim() !== newPeriod.trim() || !newPeriod}
              >
                Iniciar período {newPeriod}
              </Button>
            </div>
          </div>

          {/* Períodos archivados */}
          <Separator />
          <div className="space-y-2">
            <p className="text-sm font-semibold">Períodos archivados</p>
            {archivedPeriods.length === 0 ? (
              <p className="text-xs text-muted-foreground">Este curso aún no tiene períodos cerrados.</p>
            ) : (
              <ul className="space-y-2">
                {archivedPeriods.map((item) => (
                  <li key={item.period} className="rounded-md border p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        <strong>Período {item.period}</strong> · {item.history} resultado(s) ·{" "}
                        {item.certificates} constancia(s) firmada(s)
                      </span>
                      {deleting !== item.period && (
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
                    {deleting === item.period && (
                      <div className="mt-2 space-y-2">
                        <p className="text-destructive">
                          Se borrarán para siempre su historial, las respuestas archivadas y las constancias
                          firmadas (con sus archivos) del período {item.period}.
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
