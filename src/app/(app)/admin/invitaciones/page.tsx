import type { Metadata } from "next";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { SIN_ASIGNAR } from "@/lib/constants";
import { getInstitution } from "@/server/queries/institutions";
import { getPublishedCourseOptions } from "@/server/queries/courses";
import { getInvitations } from "@/server/queries/invitations";
import { getAreas, getPositions } from "@/server/queries/catalog";
import { getActiveFuncionariosForInstitution } from "@/server/queries/funcionarios";
import { PageHeader } from "@/components/shared/page-header";
import { JefaturaInviteTable } from "@/components/admin/jefatura-invite-table";
import { InvitationsTable } from "@/components/admin/invitations-table";

export const metadata: Metadata = { title: "Invitaciones" };

export default async function InvitationsPage() {
  const session = await requireRole(Role.SUPER_ADMIN, Role.ADMIN_RRHH);

  const [institution, courses, invitations, positions, areas, funcionarios] = await Promise.all([
    getInstitution(session.institutionId),
    getPublishedCourseOptions(session.institutionId),
    getInvitations(session.institutionId),
    getPositions(session.institutionId, true),
    getAreas(session.institutionId, true),
    getActiveFuncionariosForInstitution(session.institutionId),
  ]);

  return (
    <>
      <PageHeader
        title="Invitaciones a Inducción"
        description="Genera y distribuye accesos consolidados por jefatura para tus nuevos colaboradores."
      />

      <div className="space-y-8">
        <JefaturaInviteTable
          courses={courses}
          institutionDomain={institution?.domain ?? "colegio.cl"}
          positions={positions.map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
          }))}
          areas={areas.map((a) => ({
            id: a.id,
            name: a.name,
            jefeNombre: a.jefeNombre,
            jefeRut: a.jefeRut,
            jefeEmail: a.jefeEmail,
            asistenteEmail: a.asistenteEmail,
            users: a.users.map((u) => ({
              id: u.id,
              positionId: u.positionId,
            })),
          }))}
          funcionarios={funcionarios}
        />

        <div className="pt-4 border-t border-slate-200">
          <h2 className="text-base font-bold text-slate-800 mb-3">Historial de Invitaciones Emitidas</h2>
          <InvitationsTable invitations={invitations} />
        </div>
      </div>
    </>
  );
}
