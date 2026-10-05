"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import { cn } from "@/lib/utils";
import { visibleNavigation } from "@/lib/auth/rbac";

interface SidebarNavProps {
  role: Role;
  /** Slug del cargo; algunas rutas se filtran por cargo además del rol. */
  positionSlug: string | null;
  onNavigate?: () => void;
}

/**
 * Navegación filtrada por Rol y Cargo (RBAC). El filtrado también ocurre en el
 * middleware y en cada Server Action: esto es sólo la capa visual.
 */
export function SidebarNav({
  role,
  positionSlug,
  onNavigate,
}: SidebarNavProps) {
  const pathname = usePathname();
  const sections = visibleNavigation(role, positionSlug);

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4 scrollbar-thin">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {section.title}
          </p>
          <ul className="space-y-1">
            {section.items.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
