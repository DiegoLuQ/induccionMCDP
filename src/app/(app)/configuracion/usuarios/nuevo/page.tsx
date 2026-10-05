import type { Metadata } from "next";
import Link from "next/link";
import { Role } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getAccessibleInstitutions } from "@/server/queries/institutions";
import { getAreas, getPositions } from "@/server/queries/catalog";
import { PageHeader } from "@/components/shared/page-header";
import { UserForm } from "@/components/admin/user-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Nuevo usuario" };

export default async function NewAdminUserPage() {
  const session = await requireRole(Role.SUPER_ADMIN);

  const [institutions, positions, areas] = await Promise.all([
    getAccessibleInstitutions(session.institutionIds),
    getPositions(session.institutionId, true),
    getAreas(session.institutionId, true),
  ]);

  return (
    <>
      <PageHeader
        title="Nuevo usuario"
        description="Crea un usuario con el rol que corresponda. Los roles administrativos requieren contraseña."
        actions={
          <Button asChild variant="outline">
            <Link href="/configuracion/usuarios">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Volver
            </Link>
          </Button>
        }
      />

      <div className="max-w-4xl">
        <UserForm
          institutions={institutions.map((i) => ({ id: i.id, name: i.name }))}
          activeInstitutionId={session.institutionId}
          positions={positions.map((p) => ({ id: p.id, name: p.name }))}
          positionsWithSlug={positions.map((p) => ({ id: p.id, name: p.name, slug: p.slug }))}
          areas={areas.map((a) => ({ id: a.id, name: a.name, slug: a.slug }))}
          canAssignAdminRoles
          defaultRole={Role.ADMIN_RRHH}
          redirectTo="/configuracion/usuarios"
        />
      </div>
    </>
  );
}
