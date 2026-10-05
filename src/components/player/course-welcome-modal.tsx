"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { BookOpen, CheckCircle, Sparkles, X } from "lucide-react";
import type { CoursePlayerData } from "@/server/queries/courses";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CourseWelcomeModalProps {
  course: CoursePlayerData;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}

export function CourseWelcomeModal({
  course,
  isOpen: controlledIsOpen,
  onOpenChange: controlledOnOpenChange,
  showTrigger = false,
}: CourseWelcomeModalProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);

  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  // Determinar identidad y colores del colegio
  const instName = course.institution?.name?.toLowerCase() ?? "";
  const instSlug = (course.institution as { slug?: string })?.slug?.toLowerCase() ?? "";
  const instDomain = (course.institution as { domain?: string })?.domain?.toLowerCase() ?? "";

  const isMacaya =
    instSlug.includes("macaya") ||
    instDomain.includes("macaya") ||
    instName.includes("macaya");

  // Colegio Diego Portales -> Azul, Colegio Macaya -> Verde
  const theme = isMacaya
    ? {
        name: course.institution?.name || "Colegio Macaya",
        borderClass: "border-emerald-500/30",
        headerBg: "bg-emerald-700 text-white",
        accentBadgeBg: "bg-emerald-600/20 text-emerald-300 border-emerald-500/30",
        buttonClass: "bg-emerald-700 hover:bg-emerald-800 text-white shadow-md",
        iconColor: "text-emerald-400",
        ringColor: "ring-emerald-500",
      }
    : {
        name: course.institution?.name || "Colegio Diego Portales",
        borderClass: "border-blue-500/30",
        headerBg: "bg-blue-800 text-white",
        accentBadgeBg: "bg-blue-600/20 text-blue-200 border-blue-400/30",
        buttonClass: "bg-blue-800 hover:bg-blue-900 text-white shadow-md",
        iconColor: "text-blue-300",
        ringColor: "ring-blue-500",
      };

  useEffect(() => {
    if (!course.description || isControlled) return;

    // Verificar en sessionStorage si ya vio el modal en esta sesión
    const storageKey = `seen_welcome_course_${course.id}`;
    const alreadySeen = sessionStorage.getItem(storageKey);

    if (!alreadySeen) {
      setInternalIsOpen(true);
    }
  }, [course.id, course.description, isControlled]);

  function handleClose() {
    sessionStorage.setItem(`seen_welcome_course_${course.id}`, "true");
    if (isControlled) {
      controlledOnOpenChange?.(false);
    } else {
      setInternalIsOpen(false);
    }
  }

  if (!course.description) return null;

  return (
    <>
      {showTrigger && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setInternalIsOpen(true)}
          className="h-6 text-xs gap-1.5 px-2.5 text-muted-foreground hover:text-foreground"
        >
          <BookOpen className="h-3 w-3" />
          Ver descripción
        </Button>
      )}
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className={`sm:max-w-lg p-0 overflow-hidden border shadow-2xl rounded-xl ${theme.borderClass}`}>
        {/* Cabecera temática con el color del colegio */}
        <div className={`px-6 py-5 ${theme.headerBg} relative`}>
          <div className="flex items-center gap-3.5">
            {/* Logo o escudo institucional */}
            {course.institution?.logoUrl ? (
              <div className="h-14 w-14 shrink-0 rounded-lg bg-white/95 p-1.5 shadow-md flex items-center justify-center">
                <img
                  src={course.institution.logoUrl}
                  alt={theme.name}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : (
              <div className="h-12 w-12 shrink-0 rounded-xl bg-white/10 backdrop-blur-xs flex items-center justify-center border border-white/20">
                <BookOpen className={`h-6 w-6 ${theme.iconColor}`} />
              </div>
            )}

            <div className="min-w-0 pr-4">
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border mb-1 uppercase tracking-wider ${theme.accentBadgeBg}`}>
                <Sparkles className="h-3 w-3" />
                {theme.name}
              </span>
              <DialogTitle className="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug">
                {course.title}
              </DialogTitle>
            </div>
          </div>
        </div>

        {/* Cuerpo con la descripción e instrucciones */}
        <div className="px-6 py-5 space-y-4 text-sm bg-background">
          <div className="rounded-lg bg-muted/40 p-4 border border-border/60">
            <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-2">
              Presentación e Instrucciones
            </h4>
            <div className="text-foreground leading-relaxed whitespace-pre-line text-sm">
              {course.description}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-primary shrink-0" />
            <span>Al finalizar cada video, responde las preguntas de repaso para avanzar.</span>
          </div>
        </div>

        {/* Pie del modal con botón de inicio */}
        <DialogFooter className="px-6 py-3.5 bg-muted/20 border-t border-border/50 flex flex-row items-center justify-between sm:justify-end gap-2">
          <Button
            type="button"
            onClick={handleClose}
            className={`w-full sm:w-auto px-6 h-10 font-medium ${theme.buttonClass}`}
          >
            ¡Entendido, comenzar!
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
