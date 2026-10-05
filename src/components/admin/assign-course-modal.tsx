"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { assignCoursesToUsersAction } from "@/server/actions/user-actions";
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

export interface AvailableCourseOption {
  id: string;
  title: string;
  type?: { name: string; color?: string | null } | null;
}

interface AssignCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  userIds: string[];
  userNamesSummary: string;
  courses: AvailableCourseOption[];
}

export function AssignCourseModal({
  isOpen,
  onClose,
  userIds,
  userNamesSummary,
  courses,
}: AssignCourseModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);

  function toggleCourse(courseId: string) {
    setSelectedCourseIds((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId],
    );
  }

  function handleAssign() {
    if (selectedCourseIds.length === 0) {
      toast.error("Selecciona al menos un curso o inducción para asignar.");
      return;
    }

    startTransition(async () => {
      const toastId = toast.loading("Asignando cursos a los funcionarios...");
      const result = await assignCoursesToUsersAction({
        userIds,
        courseIds: selectedCourseIds,
      });

      if (result.success) {
        toast.success(result.message || "Cursos asignados correctamente", {
          id: toastId,
        });
        setSelectedCourseIds([]);
        onClose();
        router.refresh();
      } else {
        toast.error(result.message || "Error al asignar cursos", {
          id: toastId,
        });
      }
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Asignar Inducciones / Cursos
          </DialogTitle>
          <DialogDescription className="text-xs">
            Asignando a: <strong className="text-foreground">{userNamesSummary}</strong> ({userIds.length} funcionario(s)).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">
            Selecciona las inducciones que deseas asignar y certificar (quedarán al 100% completadas y aprobadas):
          </p>

          {courses.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
              No hay cursos o inducciones publicadas disponibles en este colegio.
            </div>
          ) : (
            <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
              {courses.map((course) => {
                const isSelected = selectedCourseIds.includes(course.id);
                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => toggleCourse(course.id)}
                    className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-xs"
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
                            style={
                              course.type.color
                                ? {
                                    borderColor: course.type.color,
                                    color: course.type.color,
                                  }
                                : undefined
                            }
                          >
                            {course.type.name}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
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
            size="sm"
            onClick={handleAssign}
            disabled={isPending || selectedCourseIds.length === 0}
            className="gap-1.5"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Asignar ({selectedCourseIds.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
