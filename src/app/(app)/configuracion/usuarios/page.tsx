import type { Metadata } from "next";
import Link from "next/link";
import { Role } from "@prisma/client";
import { UserPlus } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getInstitution } from "@/server/queries/institutions";
import { PageHeader } from "@/components/shared/page-header";
import { RoleManager } from "@/components/admin/role-manager";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Usuarios y roles" };

/** Vista exclusiva de SUPER_ADMIN: quién administra la plataforma en el colegio activo. */
export default async function UsersAndRolesPage() {
  const session = await requireRole(Role.SUPER_ADMIN);

  const inInstitution = {
    OR: [
      { institutionId: session.institutionId },
      { memberships: { some: { institutionId: session.institutionId } } },
    ],
  };

  const [institution, users] = await Promise.all([
    getInstitution(session.institutionId),
    prisma.user.findMany({
      where: inInstitution,
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        rut: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        passwordHash: true,
        position: { select: { name: true } },
        institution: { select: { name: true } },
      },
    }),
  ]);

  const rows = users.map(({ passwordHash, ...u }) => ({
    ...u,
    hasPassword: Boolean(passwordHash),
    positionName: u.position?.name ?? null,
    institutionName: u.institution.name,
  }));

  return (
    <>
      <PageHeader
        title={`Usuarios y roles · ${institution?.name ?? "Colegio"}`}
        description="Quién puede administrar la plataforma. Los administradores entran por /login con su correo o usuario y contraseña; los funcionarios, por invitación y PIN."
        actions={
          <Button asChild>
            <Link href="/configuracion/usuarios/nuevo">
              <UserPlus className="h-4 w-4" aria-hidden />
              Nuevo usuario
            </Link>
          </Button>
        }
      />
      <RoleManager key={session.institutionId} users={rows} currentUserId={session.sub} />
    </>
  );
}
