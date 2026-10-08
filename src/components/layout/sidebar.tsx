"use client";

import { useState } from "react";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { GraduationCap, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarNav } from "./sidebar-nav";
import { useSidebar } from "./sidebar-state";
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

/**
 * Sidebar fijo en escritorio (≥ xl). Se puede ocultar con el botón del header;
 * en móvil y tablet se usa el panel deslizante.
 */
export function DesktopSidebar(props: SidebarProps) {
  const { collapsed } = useSidebar();
  if (collapsed) return null;

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-card xl:flex">
      <SidebarBody {...props} />
    </aside>
  );
}

/** Botón para ocultar/mostrar el sidebar fijo en escritorio. */
function DesktopSidebarToggle() {
  const { collapsed, toggle } = useSidebar();
  const label = collapsed ? "Mostrar menú" : "Ocultar menú";

  return (
    <Button
      variant="ghost"
      size="icon"
      className="hidden xl:inline-flex"
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      {collapsed ? (
        <PanelLeftOpen className="h-5 w-5" aria-hidden />
      ) : (
        <PanelLeftClose className="h-5 w-5" aria-hidden />
      )}
    </Button>
  );
}

/** Sidebar en panel deslizante para móvil y tablet (< xl). */
export function MobileSidebar(props: SidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <DesktopSidebarToggle />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="xl:hidden"
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
    </>
  );
}
