"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Award,
  CheckCircle2,
  FileSignature,
  GraduationCap,
  Loader2,
  Sparkles,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import type { CoursePlayerData } from "@/server/queries/courses";
import { confirmCourseCompletionAction } from "@/server/actions/progress-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

interface CourseCompletionModalProps {
  course: CoursePlayerData;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isPreview?: boolean;
}

export function CourseCompletionModal({
  course,
  isOpen,
  onOpenChange,
  isPreview = false,
}: CourseCompletionModalProps) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [hasConfirmedSuccessfully, setHasConfirmedSuccessfully] = useState(false);

  const institutionName = course.institution?.name || "Colegio";
  // Mientras no confirme su término, no puede salir del modal (salvo la vista previa
  // del administrador o una inducción que ya estaba confirmada).
  const canLeave = isPreview || hasConfirmedSuccessfully || course.status === "COMPLETED";

  function handleOpenChange(open: boolean) {
    if (!open && !canLeave) {
      toast.info("Marca la casilla y confirma tu término para continuar.");
      return;
    }
    onOpenChange(open);
  }

  function handleConfirm() {
    if (!confirmed && !hasConfirmedSuccessfully) {
      toast.error("Debes marcar la casilla para confirmar que terminaste.");
      return;
    }

    startTransition(async () => {
      const result = await confirmCourseCompletionAction(course.id);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      setHasConfirmedSuccessfully(true);
      toast.success("¡Inducción finalizada y confirmada con éxito!");
      router.refresh();
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {/* Compacto: alto máximo 90% de la pantalla; sólo el cuerpo se desplaza. */}
      <DialogContent
        className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-md flex-col gap-0 overflow-hidden p-0 sm:rounded-xl"
        onEscapeKeyDown={(e) => !canLeave && e.preventDefault()}
        onPointerDownOutside={(e) => !canLeave && e.preventDefault()}
      >
        {/* Encabezado */}
        <div className="flex shrink-0 items-center gap-3 bg-gradient-to-br from-emerald-600 to-teal-700 px-5 py-4 text-white dark:from-emerald-700 dark:to-teal-800">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 ring-4 ring-white/10">
            <Award className="h-6 w-6" />
          </div>
          <div className="min-w-0 text-left">
            <Badge className="mb-1 border-none bg-white/20 px-2 py-0 text-[10px] font-semibold text-white hover:bg-white/30">
              <Sparkles className="mr-1 h-3 w-3 text-amber-300" />
              Inducción finalizada
            </Badge>
            <DialogTitle className="text-lg font-bold leading-tight text-white">
              ¡Felicitaciones! Has terminado
            </DialogTitle>
            <DialogDescription className="truncate text-xs text-emerald-100" title={course.title}>
              {course.title}
            </DialogDescription>
          </div>
        </div>

        {/* Cuerpo (se desplaza si no cabe) */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Resumen en una fila */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border bg-muted/30 px-2 py-2">
              <Video className="mx-auto mb-1 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm font-bold tabular-nums">
                {course.lessons.length}/{course.lessons.length}
              </p>
              <p className="text-[10px] text-muted-foreground">Videos</p>
            </div>
            <div className="rounded-lg border bg-muted/30 px-2 py-2">
              <CheckCircle2 className="mx-auto mb-1 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm font-bold">Aprobadas</p>
              <p className="text-[10px] text-muted-foreground">Evaluaciones</p>
            </div>
            <div className="rounded-lg border bg-muted/30 px-2 py-2">
              <GraduationCap className="mx-auto mb-1 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <p className="truncate text-sm font-bold" title={institutionName}>
                {institutionName.replace(/^Colegio\s+/i, "")}
              </p>
              <p className="text-[10px] text-muted-foreground">Colegio</p>
            </div>
          </div>

          {!hasConfirmedSuccessfully ? (
            <div className="space-y-3 rounded-lg border-2 border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-xs text-muted-foreground">
                Confirma tu término para que quede registrado ante Recursos Humanos.{" "}
                <strong className="text-foreground">Marca la casilla y presiona &quot;Confirmar término&quot; para continuar.</strong>
              </p>
              <label
                htmlFor="confirm-course-completion"
                className="flex cursor-pointer select-none items-start gap-2.5 rounded-md border border-emerald-500/20 bg-background p-2.5 transition-colors hover:bg-accent/40"
              >
                <input
                  type="checkbox"
                  id="confirm-course-completion"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs font-medium leading-snug sm:text-sm">
                  Acepto que he terminado la {course.title}.
                </span>
              </label>
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={!confirmed || isPending}
                className="w-full gap-2 bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Registrando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Confirmar término
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    ¡Término confirmado y registrado!
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Último paso: firma tu Constancia de Participación. También te enviamos el enlace a tu correo.
                  </p>
                </div>
              </div>
              <Button asChild className="w-full gap-2 bg-emerald-600 font-semibold text-white hover:bg-emerald-700">
                <Link href={`/mis-inducciones/${course.id}/firmar`}>
                  <FileSignature className="h-4 w-4" />
                  Firmar mi constancia
                </Link>
              </Button>
            </div>
          )}
        </div>

        {/* Acciones */}
        <DialogFooter className="shrink-0 gap-2 border-t bg-muted/20 px-5 py-3 sm:flex-row">
          {isPreview ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
                Cerrar vista previa
              </Button>
              <Button asChild className="w-full sm:w-auto">
                <Link href={`/admin/cursos/${course.id}`}>Volver al curso</Link>
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={!canLeave}
                title={canLeave ? undefined : "Primero confirma tu término"}
                className="w-full sm:w-auto"
              >
                Seguir aquí
              </Button>
              {canLeave ? (
                <Button asChild className="w-full sm:w-auto">
                  <Link href="/mis-inducciones">Ir a Mis inducciones</Link>
                </Button>
              ) : (
                <Button disabled title="Primero confirma tu término" className="w-full sm:w-auto">
                  Ir a Mis inducciones
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
