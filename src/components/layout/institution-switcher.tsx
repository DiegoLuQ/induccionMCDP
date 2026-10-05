"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchInstitutionAction } from "@/server/actions/auth-actions";

export interface InstitutionOption {
  id: string;
  name: string;
  domain: string;
  logoUrl?: string | null;
}

interface InstitutionSwitcherProps {
  institutions: InstitutionOption[];
  activeInstitutionId: string;
}

/**
 * Selector global de colegio. Si el usuario sólo pertenece a uno, se muestra
 * como etiqueta estática (sin menú).
 */
export function InstitutionSwitcher({
  institutions,
  activeInstitutionId,
}: InstitutionSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const active =
    institutions.find((i) => i.id === activeInstitutionId) ?? institutions[0];

  if (!active) return null;

  if (institutions.length === 1) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{active.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            @{active.domain}
          </p>
        </div>
      </div>
    );
  }

  function handleSelect(institutionId: string) {
    if (institutionId === activeInstitutionId) return;
    startTransition(async () => {
      const result = await switchInstitutionAction(institutionId);
      if (result.success) {
        toast.success("Colegio cambiado");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-auto w-full justify-between px-3 py-2"
          disabled={isPending}
          aria-label="Cambiar de colegio"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 text-left">
              <span className="block truncate text-sm font-medium">
                {active.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                @{active.domain}
              </span>
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Mis colegios</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {institutions.map((institution) => (
          <DropdownMenuItem
            key={institution.id}
            onSelect={() => handleSelect(institution.id)}
            className="gap-2"
          >
            <Check
              className={cn(
                "h-4 w-4",
                institution.id === activeInstitutionId
                  ? "opacity-100"
                  : "opacity-0",
              )}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block truncate text-sm">{institution.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                @{institution.domain}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
