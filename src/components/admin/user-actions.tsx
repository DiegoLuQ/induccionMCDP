"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toggleUserActiveAction } from "@/server/actions/user-actions";

export function UserActiveToggle({
  userId,
  isActive,
  disabled,
}: {
  userId: string;
  isActive: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending || disabled}
      title={
        disabled
          ? "No puedes desactivar tu propia cuenta"
          : isActive
            ? "Impide que el usuario inicie sesión"
            : "Vuelve a habilitar el acceso"
      }
      onClick={() =>
        startTransition(async () => {
          const result = await toggleUserActiveAction(userId, !isActive);
          if (result.success) {
            toast.success(result.message ?? "Listo");
            router.refresh();
          } else {
            toast.error(result.message);
          }
        })
      }
    >
      {isActive ? "Desactivar" : "Activar"}
    </Button>
  );
}
