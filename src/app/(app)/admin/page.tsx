import type { Metadata } from "next";
import Link from "next/link";
import { Role } from "@prisma/client";
import {
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Mail,
  Users,
} from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getAdminDashboard } from "@/server/queries/dashboard";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { AdminProgressTable } from "@/components/admin/admin-progress-table";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Panel RRHH" };

async function getLogoBase64(logoUrl: string | null | undefined): Promise<string | null> {
  if (!logoUrl) return null;
  if (logoUrl.startsWith("data:")) return logoUrl;
  try {
    const res = await fetch(logoUrl, { next: { revalidate: 3600 } });
    if (!res.ok) return logoUrl;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = res.headers.get("content-type") || "image/png";
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return logoUrl;
  }
}

export default async function AdminPanelPage() {
  const session = await requireRole(Role.SUPER_ADMIN, Role.ADMIN_RRHH);
  const [data, institution] = await Promise.all([
    getAdminDashboard(session.institutionId),
    prisma.institution.findUnique({
      where: { id: session.institutionId },
      select: { name: true, logoUrl: true },
    }),
  ]);

  const logoBase64 = await getLogoBase64(institution?.logoUrl);

  return (
    <>
      <PageHeader
        title="Panel RRHH"
        description="Estado de cumplimiento de las inducciones del colegio activo."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/cursos">Gestionar inducciones</Link>
            </Button>
            <Button asChild>
              <Link href="/admin/invitaciones">Invitar funcionarios</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Funcionarios" value={data.totalUsers} icon={Users} />
        <StatCard
          label="Inducciones publicadas"
          value={data.totalCourses}
          icon={BookOpen}
        />
        <StatCard
          label="Completadas"
          value={data.completed}
          hint={`${data.completionRate}% de cumplimiento`}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="En progreso"
          value={data.inProgress}
          icon={Clock}
          tone="warning"
        />
        <StatCard
          label="Invitaciones vigentes"
          value={data.activeInvitations}
          hint={`${data.expiredInvitations} vencidas`}
          icon={Mail}
        />
        <StatCard
          label="Por revisar"
          value={data.pendingReviews}
          hint="Preguntas abiertas"
          icon={ClipboardCheck}
          tone={data.pendingReviews > 0 ? "warning" : "default"}
        />
      </div>

      <AdminProgressTable
        recent={data.recent}
        institutionName={institution?.name ?? "Colegio Diego Portales"}
        institutionLogoUrl={logoBase64}
      />
    </>
  );
}
