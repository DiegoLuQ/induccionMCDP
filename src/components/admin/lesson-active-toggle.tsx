"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { toggleLessonActiveAction } from "@/server/actions/course-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface LessonActiveToggleProps {
  lessonId: string;
  initialIsActive: boolean;
  lessonTitle: string;
}

export function LessonActiveToggle({
  lessonId,
  initialIsActive,
  lessonTitle,
}: LessonActiveToggleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isActive, setIsActive] = useState(initialIsActive);

  function handleToggle() {
    const nextState = !isActive;
    setIsActive(nextState);

    startTransition(async () => {
      const result = await toggleLessonActiveAction(lessonId, nextState);
      if (!result.success) {
        setIsActive(!nextState); // revert
        toast.error(result.message);
        return;
      }
      toast.success(
        nextState
          ? `Cápsula "${lessonTitle}" activada. Visible para funcionarios.`
          : `Cápsula "${lessonTitle}" desactivada. Oculta para funcionarios.`
      );
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Badge
        variant={isActive ? "success" : "secondary"}
        className="text-[11px] font-medium transition-colors"
      >
        {isActive ? "Activa" : "Desactivada"}
      </Badge>

      <Button
        type="button"
        variant={isActive ? "outline" : "default"}
        size="sm"
        disabled={isPending}
        onClick={handleToggle}
        className="h-7 gap-1 px-2.5 text-xs"
        title={
          isActive
            ? "Desactivar cápsula (ocultarla sin borrar contenido)"
            : "Activar cápsula (hacerla visible para los funcionarios)"
        }
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isActive ? (
          <>
            <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Desactivar</span>
          </>
        ) : (
          <>
            <Eye className="h-3.5 w-3.5" />
            <span>Activar</span>
          </>
        )}
      </Button>
    </div>
  );
}
