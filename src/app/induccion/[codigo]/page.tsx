import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/rbac";
import {
  findAreaByPortalCode,
  getAreaPortalRows,
  hasPortalAccess,
} from "@/server/services/area-portal";
import { PortalKeyForm } from "./portal-key-form";
import { PortalAccessTable } from "./portal-access-table";

export const metadata: Metadata = { title: "Accesos del área", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Portal de jefatura (público, sin sesión): accesos vigentes del área con la
 * clave que llega en el correo. RRHH/Super Admin del colegio entran sin clave.
 */
export default async function AreaPortalPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const area = await findAreaByPortalCode(codigo);
  if (!area) notFound();

  const session = await getSession();
  const isStaffAdmin =
    !!session && isAdminRole(session.role) && session.institutionIds.includes(area.institutionId);
  const allowed = isStaffAdmin || (await hasPortalAccess(area));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex items-center gap-3">
          {area.institution.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={area.institution.logoUrl} alt="" className="h-12 w-auto" />
          )}
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">{area.institution.name}</p>
            <h1 className="text-xl font-semibold text-slate-900">Accesos a inducción · {area.name}</h1>
          </div>
        </header>

        {allowed ? (
          <PortalAccessTable rows={await getAreaPortalRows(area)} areaName={area.name} />
        ) : (
          <PortalKeyForm code={codigo} />
        )}
      </div>
    </main>
  );
}
