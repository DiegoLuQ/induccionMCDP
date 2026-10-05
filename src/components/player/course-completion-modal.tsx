"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Award,
  CheckCircle2,
  ExternalLink,
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
  DialogHeader,
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
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden sm:rounded-xl">
        {/* Encabezado festivo */}
        <div className="relative bg-gradient-to-br from-emerald-600 to-teal-700 px-6 pt-8 pb-6 text-center text-white dark:from-emerald-700 dark:to-teal-800">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 shadow-inner backdrop-blur-sm ring-8 ring-white/10">
            <Award className="h-9 w-9 text-white" />
          </div>

          <Badge className="mb-2 bg-white/20 text-white hover:bg-white/30 border-none px-3 py-0.5 text-xs font-semibold backdrop-blur-sm">
            <Sparkles className="h-3 w-3 mr-1 text-amber-300" />
            Inducción Finalizada
          </Badge>

          <DialogTitle className="text-xl font-bold text-white tracking-tight sm:text-2xl">
            ¡Felicitaciones! Has terminado
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-emerald-100">
            Has completado satisfactoriamente los contenidos y evaluaciones de{" "}
            <span className="font-semibold text-white">{course.title}</span>.
          </DialogDescription>
        </div>

        {/* Cuerpo del modal */}
        <div className="p-6 space-y-5">
          {/* Resumen de cumplimiento */}
          <div className="rounded-lg border bg-muted/30 p-3.5 space-y-2.5 text-xs sm:text-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <GraduationCap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Establecimiento:
              </span>
              <span className="font-medium text-foreground">{institutionName}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Video className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Videos completados:
              </span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {course.lessons.length} de {course.lessons.length} videos
              </span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Preguntas de repaso:
              </span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                Todas respondidas y aprobadas
              </span>
            </div>
          </div>

          {!hasConfirmedSuccessfully ? (
            /* Sección de confirmación requerida */
            <div className="rounded-lg border-2 border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Confirmación de finalización
                </p>
                <p className="text-xs text-muted-foreground">
                  Para registrar tu cumplimiento oficial ante Recursos Humanos,
                  confirma a continuación que has revisado los contenidos y completado las preguntas.
                </p>
              </div>

              <label
                htmlFor="confirm-course-completion"
                className="flex items-start gap-3 rounded-md border border-emerald-500/20 bg-background p-3 cursor-pointer select-none transition-colors hover:bg-accent/40"
              >
                <input
                  type="checkbox"
                  id="confirm-course-completion"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="h-4 w-4 mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <span className="text-xs sm:text-sm font-medium leading-snug text-foreground">
                  Acepto que he terminado la {course.title}.
                </span>
              </label>

              <Button
                type="button"
                onClick={handleConfirm}
                disabled={!confirmed || isPending}
                className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Registrando confirmación...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Confirmar término de inducción
                  </>
                )}
              </Button>
            </div>
          ) : (
            /* Estado de confirmación completada */
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-center space-y-2">
              <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                ¡Tu finalización ha sido confirmada y registrada!
              </p>
              <p className="text-xs text-muted-foreground">
                El estado de la inducción quedó registrado como completado ante la institución.
              </p>
            </div>
          )}
        </div>

        {/* Acciones de navegación */}
        <DialogFooter className="border-t bg-muted/20 px-6 py-3.5 sm:flex-row gap-2">
          {isPreview ? (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="w-full sm:w-auto"
              >
                Cerrar vista previa
              </Button>
              <Button asChild className="w-full sm:w-auto">
                <Link href={`/admin/cursos/${course.id}`}>
                  Volver al detalle del curso
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="w-full sm:w-auto"
              >
                Permanecer en el reproductor
              </Button>
              <Button asChild className="w-full sm:w-auto">
                <Link href="/mis-inducciones">
                  Ir a Mis Inducciones
                </Link>
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
