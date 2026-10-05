"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BookOpen, Check, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { removeCourseFromUsersAction } from "@/server/actions/user-actions";
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
import type { AvailableCourseOption } from "@/components/admin/assign-course-modal";

interface RemoveCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  userIds: string[];
  userNamesSummary: string;
  courses: AvailableCourseOption[];
}

export function RemoveCourseModal({
  isOpen,
  onClose,
  userIds,
  userNamesSummary,
  courses,
}: RemoveCourseModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");

  function handleRemove() {
    if (!selectedCourseId) {
      toast.error("Selecciona la inducción que deseas quitar o reiniciar.");
      return;
    }

    startTransition(async () => {
      const toastId = toast.loading("Restableciendo asignación...");
      const result = await removeCourseFromUsersAction({
        userIds,
        courseId: selectedCourseId,
      });

      if (result.success) {
        toast.success(result.message || "Asignación quitada con éxito.", {
          id: toastId,
        });
        setSelectedCourseId("");
        onClose();
        router.refresh();
      } else {
        toast.error(result.message || "Error al quitar asignación", {
          id: toastId,
        });
      }
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <RotateCcw className="h-5 w-5" />
            Quitar Asignación / Reiniciar Inducción
          </DialogTitle>
          <DialogDescription className="text-xs">
            Afectará a: <strong className="text-foreground">{userNamesSummary}</strong> ({userIds.length} funcionario(s)).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <span>
              Al quitar la asignación se eliminan sus invitaciones, el avance (lecciones vistas y nota) y <strong>las respuestas de las evaluaciones</strong> de esta inducción, para que puedan realizarla nuevamente desde cero. Esta acción no se puede deshacer.
            </span>
          </div>

          <p className="text-xs font-medium text-muted-foreground">
            Selecciona el curso o inducción a desvincular:
          </p>

          {courses.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
              No hay cursos disponibles.
            </div>
          ) : (
            <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
              {courses.map((course) => {
                const isSelected = selectedCourseId === course.id;
                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => setSelectedCourseId(course.id)}
                    className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-all ${
                      isSelected
                        ? "border-destructive bg-destructive/5 shadow-xs"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">
                          {course.title}
                        </span>
                        {course.type && (
                          <Badge
                            variant="outline"
                            className="text-[10px] py-0 px-1.5"
                          >
                            {course.type.name}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        isSelected
                          ? "border-destructive bg-destructive text-white"
                          : "border-input bg-background"
                      }`}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleRemove}
            disabled={isPending || !selectedCourseId}
            className="gap-1.5"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Quitar Asignación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
