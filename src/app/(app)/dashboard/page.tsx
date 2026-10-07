import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Mail,
  MailWarning,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { requireSession } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/rbac";
import { formatDateTime } from "@/lib/utils";
import {
  COMPLIANCE_PAGE_SIZE,
  getAdminDashboard,
  getComplianceTable,
  getUserDashboard,
} from "@/server/queries/dashboard";
import { getMandatoryCompliance } from "@/server/queries/mandatory";
import { getActiveCourse } from "@/lib/active-course";
import { MandatoryComplianceCards } from "@/components/admin/mandatory-compliance-cards";
import { DashboardComplianceTabs } from "@/components/admin/dashboard-compliance-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ProgressBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Inicio" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; area?: string; estado?: string; pagina?: string }>;
}) {
  const params = await searchParams;
  const session = await requireSession();
  // El auditor no tiene inicio propio: su única vista es el reporte.
  if (session.role === Role.AUDITOR) redirect("/reportes");

  return isAdminRole(session.role) ? (
    <AdminDashboard institutionId={session.institutionId} name={session.name} params={params} />
  ) : (
    <FuncionarioDashboard
      userId={session.sub}
      institutionId={session.institutionId}
      name={session.name}
    />
  );
}

async function AdminDashboard({
  institutionId,
  name,
  params,
}: {
  institutionId: string;
  name: string;
  params: { tab?: string; area?: string; estado?: string; pagina?: string };
}) {
  const { activeCourseId } = await getActiveCourse(institutionId);
  const tab = params.tab === "actividad" ? "actividad" : "pendientes";
  const status = (["ALL", "NONE", "PENDING", "IN_PROGRESS", "COMPLETED"] as const).find(
    (s) => s === params.estado,
  ) ?? "ALL";
  const page = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);
  const [data, mandatoryAll, compliance] = await Promise.all([
    getAdminDashboard(institutionId, { courseId: activeCourseId }),
    getMandatoryCompliance(institutionId),
    // Tabla paginada (10 por página) según la "Inducción activa".
    getComplianceTable(institutionId, activeCourseId, { tab, areaId: params.area ?? "", status, page }),
  ]);
  const mandatory = [...mandatoryAll].sort(
    (a, b) => Number(b.id === activeCourseId) - Number(a.id === activeCourseId),
  );

  return (
    <>
      <PageHeader
        title={`Hola, ${name.split(" ")[0]}`}
        description="Monitoreo en tiempo real de las inducciones del colegio."
        actions={
          <Button asChild>
            <Link href="/admin/invitaciones">Invitar funcionarios</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Funcionarios activos"
          value={data.totalUsers}
          icon={Users}
        />
        <StatCard
          label="Inducciones publicadas"
          value={data.totalCourses}
          icon={BookOpen}
        />
        <StatCard
          label="Completitud"
          value={`${data.completionRate}%`}
          hint={`${data.completed} completadas · ${data.inProgress} en progreso`}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Invitaciones vigentes"
          value={data.activeInvitations}
          hint={`${data.expiredInvitations} vencidas`}
          icon={Mail}
          tone={data.expiredInvitations > 0 ? "warning" : "default"}
        />
      </div>

      <MandatoryComplianceCards courses={mandatory} activeCourseId={activeCourseId} />

      {data.pendingReviews > 0 && (
        <Card className="mt-6 border-warning/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div className="flex items-center gap-3">
              <MailWarning className="h-5 w-5 text-warning" aria-hidden />
              <p className="text-sm">
                <strong>{data.pendingReviews}</strong> entrega(s) con preguntas
                abiertas esperando corrección.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/revisiones">Revisar ahora</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <span>Inducciones y Cumplimiento</span>
                {data.latestCourse && (
                  <Badge variant="outline" className="font-normal text-xs bg-muted/40">
                    Inducción activa: {data.latestCourse.title}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                Monitoreo de funcionarios pendientes por realizar inducción y registro de avances recientes.
              </CardDescription>
            </div>
            <Button asChild size="sm" variant="outline" className="shrink-0 gap-1.5">
              <Link href="/admin/funcionarios">
                <Users className="h-4 w-4" />
                Gestionar en Directorio
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DashboardComplianceTabs
            courseTitle={data.latestCourse?.title ?? null}
            tab={tab}
            areaId={params.area ?? ""}
            status={status}
            page={page}
            pageSize={COMPLIANCE_PAGE_SIZE}
            areas={compliance.areas}
            pendingTotal={compliance.pendingTotal}
            recentTotal={compliance.recentTotal}
            pending={compliance.pending}
            recent={compliance.recent}
          />
        </CardContent>
      </Card>
    </>
  );
}

async function FuncionarioDashboard({
  userId,
  institutionId,
  name,
}: {
  userId: string;
  institutionId: string;
  name: string;
}) {
  const data = await getUserDashboard(userId, institutionId);

  return (
    <>
      <PageHeader
        title={`Hola, ${name.split(" ")[0]}`}
        description="Este es el estado de tus inducciones y capacitaciones."
        actions={
          <Button asChild>
            <Link href="/mis-inducciones">Ver mis inducciones</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Asignadas" value={data.total} icon={BookOpen} />
        <StatCard
          label="Completadas"
          value={data.completed}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Pendientes"
          value={data.pending + data.inProgress}
          icon={Clock}
          tone={data.pending + data.inProgress > 0 ? "warning" : "default"}
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Mis asignaciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tienes inducciones asignadas por ahora.
            </p>
          ) : (
            data.items.map((item) => (
              <Link
                key={item.id}
                href={`/mis-inducciones/${item.course.id}`}
                className="flex items-center justify-between gap-4 rounded-md border p-4 transition-colors hover:bg-accent"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.course.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.completedAt
                      ? `Completada el ${formatDateTime(item.completedAt)}`
                      : "Pendiente de finalizar"}
                  </p>
                </div>
                <ProgressBadge status={item.status} />
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
