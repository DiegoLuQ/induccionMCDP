import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getAccessibleInstitutions } from "@/server/queries/institutions";
import { getAreas, getPositions } from "@/server/queries/catalog";
import { PageHeader } from "@/components/shared/page-header";
import { UserEditForm } from "@/components/admin/user-edit-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Editar usuario" };

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole(Role.SUPER_ADMIN, Role.ADMIN_RRHH);
  const { id } = await params;

  // Igual que updateUserAction: sólo usuarios cuyo colegio principal es el activo.
  const user = await prisma.user.findFirst({
    where: { id, institutionId: session.institutionId },
    select: {
      id: true,
      rut: true,
      name: true,
      email: true,
      corporateEmail: true,
      username: true,
      phone: true,
      role: true,
      positionId: true,
      areaId: true,
      institutionId: true,
      passwordHash: true,
      institution: { select: { name: true } },
      memberships: { select: { institutionId: true } },
    },
  });
  if (!user) notFound();

  const [institutions, positions, areas] = await Promise.all([
    getAccessibleInstitutions(session.institutionIds),
    getPositions(user.institutionId, true),
    getAreas(user.institutionId, true),
  ]);

  const isSuperAdmin = session.role === Role.SUPER_ADMIN;
  // RRHH no puede editar a administradores ni auditores.
  const canEdit = isSuperAdmin || user.role === Role.FUNCIONARIO;

  return (
    <>
      <PageHeader
        title={`Editar: ${user.name}`}
        description="Actualiza los datos, el rol y los colegios a los que tiene acceso."
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/funcionarios">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Volver
            </Link>
          </Button>
        }
      />

      <div className="max-w-4xl">
        {canEdit ? (
          <UserEditForm
            user={{
              id: user.id,
              rut: user.rut,
              name: user.name,
              email: user.email,
              corporateEmail: user.corporateEmail,
              username: user.username,
              phone: user.phone,
              role: user.role,
              positionId: user.positionId,
              areaId: user.areaId,
              institutionId: user.institutionId,
              institutionName: user.institution.name,
              extraInstitutionIds: user.memberships
                .map((m) => m.institutionId)
                .filter((institutionId) => institutionId !== user.institutionId),
              hasPassword: Boolean(user.passwordHash),
            }}
            institutions={institutions.map((i) => ({ id: i.id, name: i.name }))}
            positions={positions.map((p) => ({ id: p.id, name: p.name }))}
            areas={areas.map((a) => ({ id: a.id, name: a.name }))}
            canAssignAdminRoles={isSuperAdmin}
            isSelf={user.id === session.sub}
          />
        ) : (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">
            Sólo un Super Administrador puede editar a usuarios con rol administrativo o de auditor.
          </p>
        )}
      </div>
    </>
  );
}
