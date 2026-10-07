"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import {
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
}: {
  courseId: string;
  courseTitle: string;
  isMandatory: boolean;
  period: number;
  dueDate: Date | string | null;
  /** Funcionarios con avance en el período vigente (lo que se archivará). */
  activeCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [mandatory, setMandatory] = useState(isMandatory);
  const [due, setDue] = useState(toInputDate(dueDate));
  const [newPeriod, setNewPeriod] = useState(String(period + 1));
  const [confirmText, setConfirmText] = useState("");

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
        </DialogContent>
      </Dialog>
    </>
  );
}
