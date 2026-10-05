"use client";

import { useTransition } from "react";
import type { Role } from "@prisma/client";
import { LogOut, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { ROLE_LABELS, SIN_ASIGNAR } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/server/actions/auth-actions";

interface UserMenuProps {
  name: string;
  email: string;
  role: Role;
  positionName: string | null;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserMenu({ name, email, role, positionName }: UserMenuProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-10 gap-2 px-2"
          aria-label="Abrir menú de usuario"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials(name)}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-medium leading-tight">
              {name.split(" ")[0]}
            </span>
            <span className="block text-[11px] leading-tight text-muted-foreground">
              {ROLE_LABELS[role]}
            </span>
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="normal-case">
          <span className="block text-sm font-medium text-foreground">{name}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {email}
          </span>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            {ROLE_LABELS[role]} · {positionName ?? SIN_ASIGNAR}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/mis-inducciones">
            <UserRound className="h-4 w-4" aria-hidden />
            Mis inducciones
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/perfil">
            <Settings className="h-4 w-4" aria-hidden />
            Mi cuenta
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isPending}
          onSelect={(event) => {
            event.preventDefault();
            startTransition(() => {
              void logoutAction();
            });
          }}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
