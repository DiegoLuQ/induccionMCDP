"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, Building2, ExternalLink, Search, UserCheck, Users, X } from "lucide-react";
import { formatRut } from "@/lib/rut";
import { SIN_ASIGNAR } from "@/lib/constants";
import type { StaffWithoutJefaturaItem } from "@/server/queries/catalog";
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

interface StaffWithoutJefaturaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: StaffWithoutJefaturaItem[];
}

export function StaffWithoutJefaturaModal({
  open,
  onOpenChange,
  staff,
}: StaffWithoutJefaturaModalProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredStaff = useMemo(() => {
    if (!searchTerm.trim()) return staff;
    const q = searchTerm.toLowerCase().trim();
    const cleanQ = q.replace(/[^0-9kK]/g, "");

    return staff.filter((u) => {
      const matchName = u.name.toLowerCase().includes(q);
      const matchEmail = u.email.toLowerCase().includes(q);
      const matchRut =
        u.rut.toLowerCase().includes(q) ||
        (cleanQ && u.rut.replace(/[^0-9kK]/g, "").includes(cleanQ));
      const matchPosition = u.position?.name?.toLowerCase().includes(q);
      const matchArea = u.area?.name?.toLowerCase().includes(q);
      return matchName || matchEmail || matchRut || matchPosition || matchArea;
    });
  }, [staff, searchTerm]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-5 pb-3 border-b">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                <span>Funcionarios sin Jefatura Asignada</span>
                <Badge variant="destructive" className="text-xs px-2 py-0">
                  {staff.length}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Personal activo que pertenece a un departamento sin jefe registrado o que aún no tiene área asignada.
              </DialogDescription>
            </div>
          </div>

          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre, RUT, cargo o departamento..."
              className="pl-8 h-9 text-xs"
            />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {filteredStaff.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-xs">
              {searchTerm ? "No se encontraron resultados para la búsqueda." : "No hay funcionarios sin jefatura."}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {filteredStaff.map((u) => {
                const hasArea = Boolean(u.area);
                return (
                  <div
                    key={u.id}
                    className="flex flex-col justify-between rounded-lg border bg-card p-3 shadow-xs hover:border-primary/40 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-1.5">
                        <span className="font-semibold text-xs text-foreground block">
                          {u.name}
                        </span>
                        <Badge
                          variant={hasArea ? "outline" : "destructive"}
                          className="text-[10px] shrink-0 font-normal px-1.5 py-0"
                        >
                          {hasArea ? "Área sin jefe" : "Sin área"}
                        </Badge>
                      </div>

                      <span className="block text-[11px] text-muted-foreground font-mono">
                        {formatRut(u.rut)} · {u.position?.name ?? SIN_ASIGNAR}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {u.email}
                      </span>

                      <div className="pt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Building2 className="h-3 w-3 text-primary shrink-0" />
                        <span className="font-medium text-foreground">
                          {u.area ? u.area.name : "Sin departamento"}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2.5 mt-2 border-t flex justify-end">
                      <Button asChild size="sm" variant="outline" className="h-6 text-[11px] px-2 gap-1">
                        <Link href={`/admin/funcionarios?q=${encodeURIComponent(u.rut)}`}>
                          <span>Ver en Directorio</span>
                          <ExternalLink className="h-2.5 w-2.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-3 border-t bg-muted/20 flex items-center justify-between text-xs text-muted-foreground px-5">
          <span>
            Total: <strong>{filteredStaff.length}</strong> de <strong>{staff.length}</strong> funcionarios
          </span>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)} className="h-7 text-xs">
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
