import type { Metadata } from "next";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { getStaffScope } from "@/lib/auth/staff-scope";
import { getInstitution } from "@/server/queries/institutions";
import { getComplianceReport } from "@/server/queries/reports";
import { PageHeader } from "@/components/shared/page-header";
import { ComplianceReport } from "@/components/reports/compliance-report";

export const metadata: Metadata = { title: "Reporte de inducciones" };
export const dynamic = "force-dynamic";

/** Reporte de sólo lectura: quién completó cada inducción y quién no. */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ curso?: string }>;
}) {
  const { curso } = await searchParams;
  const session = await requireRole(Role.SUPER_ADMIN, Role.ADMIN_RRHH, Role.AUDITOR);
  // Un auditor que es jefatura sólo ve a los funcionarios de sus áreas;
  // un auditor sin áreas a cargo (y los administradores) ven a todos.
  const scope = await getStaffScope(session);
  const areaIds = scope.allowed ? scope.areaIds : null;
  const scoped = Boolean(areaIds);

  const [institution, report] = await Promise.all([
    getInstitution(session.institutionId),
    getComplianceReport(session.institutionId, areaIds ? { areaIds } : {}),
  ]);
  const institutionName = institution?.name ?? "Colegio";

  return (
    <>
      <PageHeader
        title={`Reporte de inducciones · ${institutionName}`}
        description={
          scoped
            ? `Funcionarios de tus áreas a cargo (${scope.allowed ? scope.areaNames.join(", ") : ""}) que completaron cada inducción y quiénes no.`
            : "Funcionarios activos que completaron cada inducción o capacitación y quiénes no. Para ver otro colegio, cámbialo en el selector superior."
        }
      />
      <ComplianceReport
        key={session.institutionId}
        institutionName={institutionName}
        courses={report.courses}
        rows={report.rows}
        initialCourseId={curso}
      />
    </>
  );
}
