"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setActiveCourseAction } from "@/server/actions/active-course-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface CourseSwitcherOption {
  id: string;
  title: string;
  isMandatory: boolean;
  period: number;
}

/** Selector global de "Inducción activa" (barra superior, junto al colegio). */
export function CourseSwitcher({
  courses,
  activeCourseId,
}: {
  courses: CourseSwitcherOption[];
  activeCourseId: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const active = courses.find((c) => c.id === activeCourseId);
  if (!active) return null;

  function select(id: string) {
    if (id === activeCourseId) return;
    startTransition(async () => {
      const result = await setActiveCourseAction(id);
      if (result.success) router.refresh();
      else toast.error(result.message);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 max-w-[260px] gap-2 px-2.5"
          disabled={isPending}
          title="Inducción activa: se usa en Inicio, Reporte, Invitaciones y Funcionarios"
        >
          <GraduationCap className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 truncate text-left text-xs">
            <span className="block truncate font-medium">{active.title}</span>
            <span className="block truncate text-[10px] text-muted-foreground">
              {active.isMandatory ? "Obligatorio" : "Opcional"} · {active.period}
            </span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs">Inducción activa</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {courses.map((course) => (
          <DropdownMenuItem key={course.id} onSelect={() => select(course.id)} className="gap-2">
            <Check className={cn("h-4 w-4", course.id === activeCourseId ? "opacity-100" : "opacity-0")} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{course.title}</span>
              <span className="block text-[11px] text-muted-foreground">
                {course.isMandatory ? "Obligatorio" : "Opcional"} · Período {course.period}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
