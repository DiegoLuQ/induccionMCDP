"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  resendInvitationAction,
  revokeInvitationAction,
} from "@/server/actions/invitation-actions";

/** Acciones por fila del listado de invitaciones. */
export function InvitationRowActions({
  invitationId,
  canRevoke,
}: {
  invitationId: string;
  canRevoke: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleReissue() {
    startTransition(async () => {
      const result = await resendInvitationAction(invitationId);
      if (result.success) {
        if (result.data?.link) {
          navigator.clipboard.writeText(result.data.link);
          toast.success("Nueva invitación emitida y enlace copiado al portapapeles.", {
            description: result.data.pin ? `PIN: ${result.data.pin}` : "Acceso directo sin PIN",
            duration: 6000,
          });
        } else {
          toast.success(result.message ?? "Listo");
        }
        router.refresh();
      } else {
        toast.error(result.message ?? "No se pudo completar la acción");
      }
    });
  }

  function handleRevoke() {
    startTransition(async () => {
      const result = await revokeInvitationAction(invitationId);
      if (result.success) {
        toast.success(result.message ?? "Invitación revocada");
        router.refresh();
      } else {
        toast.error(result.message ?? "No se pudo revocar");
      }
    });
  }

  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={isPending}
        onClick={handleReissue}
        title="Reemitir y copiar nuevo enlace"
        className="gap-1 text-xs"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} aria-hidden />
        <span className="sr-only sm:not-sr-only">Reemitir / Copiar Link</span>
      </Button>

      {canRevoke && (
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={handleRevoke}
          title="Revocar invitación"
          className="text-destructive hover:text-destructive h-8 px-2"
        >
          <XCircle className="h-4 w-4" aria-hidden />
          <span className="sr-only sm:not-sr-only">Revocar</span>
        </Button>
      )}
    </div>
  );
}
