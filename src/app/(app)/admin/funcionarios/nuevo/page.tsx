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

export default async function NewUserPage() {
  const session = await requireRole(Role.SUPER_ADMIN, Role.ADMIN_RRHH);

  const [institutions, positions, areas] = await Promise.all([
    getAccessibleInstitutions(session.institutionIds),
    getPositions(session.institutionId, true),
    getAreas(session.institutionId, true),
  ]);

  return (
    <>
      <PageHeader
        title="Nuevo usuario"
        description="Crea funcionarios uno por uno o pega una lista completa."
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
        <UserForm
          institutions={institutions.map((i) => ({ id: i.id, name: i.name }))}
          activeInstitutionId={session.institutionId}
          positions={positions.map((p) => ({ id: p.id, name: p.name }))}
          positionsWithSlug={positions.map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
          }))}
          areas={areas.map((a) => ({ id: a.id, name: a.name, slug: a.slug }))}
          canAssignAdminRoles={session.role === Role.SUPER_ADMIN}
        />
      </div>
    </>
  );
}
