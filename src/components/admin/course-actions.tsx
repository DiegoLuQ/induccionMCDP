"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  deleteCourseAction,
  publishCourseAction,
} from "@/server/actions/course-actions";

export function PublishToggle({
  courseId,
  isPublished,
}: {
  courseId: string;
  isPublished: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await publishCourseAction(courseId, !isPublished);
          if (result.success) {
            toast.success(result.message ?? "Actualizado");
            router.refresh();
          } else {
            toast.error(result.message);
          }
        })
      }
    >
      {isPublished ? (
        <>
          <EyeOff className="h-4 w-4" aria-hidden />
          Despublicar
        </>
      ) : (
        <>
          <Eye className="h-4 w-4" aria-hidden />
          Publicar
        </>
      )}
    </Button>
  );
}

export function DeleteCourseButton({
  courseId,
  courseTitle,
  redirectAfterDelete = false,
}: {
  courseId: string;
  courseTitle: string;
  redirectAfterDelete?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    const confirmed = window.confirm(
      `¿Estás seguro de que deseas eliminar la inducción "${courseTitle}"?\n\nEsta acción borrará todas sus lecciones y no se puede deshacer.`,
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteCourseAction(courseId);
      if (result.success) {
        toast.success(result.message ?? "Inducción eliminada.");
        if (redirectAfterDelete) {
          router.push("/admin/cursos");
        } else {
          router.refresh();
        }
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={isPending}
      onClick={handleDelete}
      title="Eliminar inducción"
      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
    >
      <Trash2 className="h-4 w-4" aria-hidden />
      <span className="sr-only">Eliminar {courseTitle}</span>
    </Button>
  );
}

