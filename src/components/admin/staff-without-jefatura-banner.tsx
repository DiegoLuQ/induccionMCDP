"use client";

import { useState } from "react";
import { AlertTriangle, Users } from "lucide-react";
import type { StaffWithoutJefaturaItem } from "@/server/queries/catalog";
import { StaffWithoutJefaturaModal } from "./staff-without-jefatura-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface StaffWithoutJefaturaBannerProps {
  staff: StaffWithoutJefaturaItem[];
}

export function StaffWithoutJefaturaBanner({
  staff,
}: StaffWithoutJefaturaBannerProps) {
  const [modalOpen, setModalOpen] = useState(false);

  if (staff.length === 0) return null;

  return (
    <>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 sm:p-4 text-amber-900 dark:text-amber-200 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs animate-in fade-in-50 duration-200">
        <div className="flex items-start sm:items-center gap-3">
          <div className="rounded-full bg-amber-500/20 p-2 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">
                Atención: Hay funcionarios sin jefatura asignada
              </span>
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-5 font-bold">
                {staff.length}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pertenecen a departamentos donde aún no se ha registrado un jefe o jefa, o no tienen área vinculada.
            </p>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={() => setModalOpen(true)}
          className="shrink-0 gap-1.5 h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-sm"
        >
          <Users className="h-3.5 w-3.5" />
          <span>Ver {staff.length} funcionarios</span>
        </Button>
      </div>

      <StaffWithoutJefaturaModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        staff={staff}
      />
    </>
  );
}
