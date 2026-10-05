import { Role } from "@prisma/client";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  Building2,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Mail,
  Settings,
  Tags,
  UserCog,
  Users,
  Video,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles que ven el ítem. */
  roles: Role[];
  /**
   * Si se define, además el slug del cargo del usuario debe estar en la lista.
   * Se usa el slug (no el id) porque el catálogo es propio de cada colegio y
   * un mismo cargo tiene ids distintos en cada uno.
   */
  positionSlugs?: string[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAVIGATION: NavSection[] = [
  {
    title: "General",
    items: [
      {
        href: "/dashboard",
        label: "Inicio",
        icon: LayoutDashboard,
        roles: [Role.SUPER_ADMIN, Role.ADMIN_RRHH, Role.FUNCIONARIO],
      },
      {
        href: "/mis-inducciones",
        label: "Mis inducciones",
        icon: GraduationCap,
        roles: [Role.SUPER_ADMIN, Role.ADMIN_RRHH, Role.FUNCIONARIO],
      },
    ],
  },
  {
    title: "Administración",
    items: [
      {
        href: "/reportes",
        label: "Reporte de inducciones",
        icon: ClipboardList,
        roles: [Role.SUPER_ADMIN, Role.ADMIN_RRHH, Role.AUDITOR],
      },
      {
        href: "/admin",
        label: "Panel RRHH",
        icon: BarChart3,
        roles: [Role.SUPER_ADMIN, Role.ADMIN_RRHH],
      },
      {
        href: "/admin/cursos",
        label: "Inducciones y cursos",
        icon: BookOpen,
        roles: [Role.SUPER_ADMIN, Role.ADMIN_RRHH],
      },
      {
        href: "/admin/invitaciones",
        label: "Invitaciones",
        icon: Mail,
        roles: [Role.SUPER_ADMIN, Role.ADMIN_RRHH],
      },
      {
        href: "/admin/funcionarios",
        label: "Funcionarios",
        icon: Users,
        roles: [Role.SUPER_ADMIN, Role.ADMIN_RRHH],
      },
    ],
  },
  {
    title: "Configuración",
    items: [
      {
        href: "/configuracion",
        label: "Mi colegio",
        icon: Settings,
        roles: [Role.SUPER_ADMIN, Role.ADMIN_RRHH],
      },
      {
        href: "/configuracion/catalogos",
        label: "Cargos y tipos",
        icon: Tags,
        roles: [Role.SUPER_ADMIN, Role.ADMIN_RRHH],
      },
      {
        href: "/configuracion/colegios",
        label: "Colegios",
        icon: Building2,
        roles: [Role.SUPER_ADMIN],
      },
      {
        href: "/configuracion/usuarios",
        label: "Usuarios y roles",
        icon: UserCog,
        roles: [Role.SUPER_ADMIN],
      },
      {
        href: "/configuracion/videos",
        label: "Videos subidos",
        icon: Video,
        roles: [Role.SUPER_ADMIN],
      },
    ],
  },
];

export function canAccess(
  item: NavItem,
  role: Role,
  positionSlug: string | null,
): boolean {
  if (!item.roles.includes(role)) return false;
  if (item.positionSlugs) {
    if (!positionSlug || !item.positionSlugs.includes(positionSlug))
      return false;
  }
  return true;
}

export function visibleNavigation(
  role: Role,
  positionSlug: string | null,
): NavSection[] {
  return NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter((item) => canAccess(item, role, positionSlug)),
  })).filter((section) => section.items.length > 0);
}

/** Prefijos de ruta y roles autorizados (usado por el middleware). */
export const ROUTE_GUARDS: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: "/admin", roles: [Role.SUPER_ADMIN, Role.ADMIN_RRHH] },
  { prefix: "/configuracion/colegios", roles: [Role.SUPER_ADMIN] },
  { prefix: "/configuracion/videos", roles: [Role.SUPER_ADMIN] },
  { prefix: "/configuracion/usuarios", roles: [Role.SUPER_ADMIN] },
  { prefix: "/configuracion", roles: [Role.SUPER_ADMIN, Role.ADMIN_RRHH] },
  {
    prefix: "/mis-inducciones",
    roles: [Role.SUPER_ADMIN, Role.ADMIN_RRHH, Role.FUNCIONARIO],
  },
  {
    // El AUDITOR entra aquí tras el login y se redirige a /reportes.
    prefix: "/dashboard",
    roles: [Role.SUPER_ADMIN, Role.ADMIN_RRHH, Role.FUNCIONARIO, Role.AUDITOR],
  },
  { prefix: "/reportes", roles: [Role.SUPER_ADMIN, Role.ADMIN_RRHH, Role.AUDITOR] },
];

export function isAdminRole(role: Role): boolean {
  return role === Role.SUPER_ADMIN || role === Role.ADMIN_RRHH;
}
