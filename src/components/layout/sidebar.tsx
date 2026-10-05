"use client";

import { useState } from "react";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { GraduationCap, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarNav } from "./sidebar-nav";
import {
  InstitutionSwitcher,
  type InstitutionOption,
} from "./institution-switcher";

interface SidebarProps {
  role: Role;
  positionSlug: string | null;
  institutions: InstitutionOption[];
  activeInstitutionId: string;
}

function SidebarBody({
  role,
  positionSlug,
  institutions,
  activeInstitutionId,
  onNavigate,
}: SidebarProps & { onNavigate?: () => void }) {
  return (
    <>
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <GraduationCap className="h-6 w-6 text-primary" aria-hidden />
        <Link href="/dashboard" className="text-sm font-semibold leading-tight">
          Inducción y
          <br />
          Capacitación
        </Link>
      </div>

      <div className="px-3 py-4">
        <InstitutionSwitcher
          institutions={institutions}
          activeInstitutionId={activeInstitutionId}
        />
      </div>

      <SidebarNav
        role={role}
        positionSlug={positionSlug}
        onNavigate={onNavigate}
      />

      <p className="border-t px-5 py-3 text-[11px] text-muted-foreground">
        Plataforma SaaS multi-colegio
      </p>
    </>
  );
}

/** Sidebar fijo en desktop. */
export function DesktopSidebar(props: SidebarProps) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-card lg:flex">
      <SidebarBody {...props} />
    </aside>
  );
}

/** Sidebar en panel deslizante para móvil/tablet. */
export function MobileSidebar(props: SidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Abrir menú de navegación"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0">
        <SheetTitle className="sr-only">Navegación</SheetTitle>
        <div className="flex h-full flex-col">
          <SidebarBody {...props} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
