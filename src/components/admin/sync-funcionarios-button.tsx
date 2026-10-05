"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Database } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { syncFuncionariosAction } from "@/server/actions/sync-actions";

interface SyncFuncionariosButtonProps {
  institutionId?: string;
  institutionName?: string;
}

export function SyncFuncionariosButton({
  institutionId,
  institutionName,
}: SyncFuncionariosButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSync = () => {
    startTransition(async () => {
      const toastId = toast.loading(
        `Sincronizando funcionarios${institutionName ? ` de ${institutionName}` : ""}...`,
      );

      try {
        const result = await syncFuncionariosAction(institutionId);

        if (result.success && result.data) {
          const { totalCreated, totalUpdated, totalDeactivated, totalErrors } = result.data;
          const deactText = totalDeactivated > 0 ? `, ${totalDeactivated} dados de baja` : "";
          toast.success("Sincronización completada con éxito", {
            id: toastId,
            description: `${totalCreated} funcionario(s) nuevos registrados, ${totalUpdated} actualizados${deactText}.${
              totalErrors > 0 ? ` (${totalErrors} con advertencias)` : ""
            }`,
            duration: 5000,
          });
          router.refresh();
        } else {
          toast.error("Error al sincronizar funcionarios", {
            id: toastId,
            description: result.message || "No se pudo completar la operación.",
            duration: 6000,
          });
        }
      } catch (err: unknown) {
        toast.error("Error de conexión", {
          id: toastId,
          description: (err instanceof Error && err.message) || "Ocurrió un error inesperado al conectar.",
          duration: 6000,
        });
      }
    });
  };

  return (
    <Button
      variant="outline"
      onClick={handleSync}
      disabled={isPending}
      className="gap-2 border-primary/20 hover:border-primary/50 hover:bg-primary/5"
      title="Sincronizar funcionarios desde la base de datos centralizada MySQL"
    >
      <RefreshCw
        className={`h-4 w-4 text-primary ${isPending ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      <span>{isPending ? "Sincronizando..." : "Sincronizar DB Externa"}</span>
    </Button>
  );
}
