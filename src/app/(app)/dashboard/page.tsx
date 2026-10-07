import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertCircle,
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
import { SIN_ASIGNAR } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import { formatRut } from "@/lib/rut";
import { getAdminDashboard, getUserDashboard } from "@/server/queries/dashboard";
import { getMandatoryCompliance } from "@/server/queries/mandatory";
import { MandatoryComplianceCards } from "@/components/admin/mandatory-compliance-cards";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Inicio" };

export default async function DashboardPage() {
  const session = await requireSession();
  // El auditor no tiene inicio propio: su única vista es el reporte.
  if (session.role === Role.AUDITOR) redirect("/reportes");

  return isAdminRole(session.role) ? (
    <AdminDashboard institutionId={session.institutionId} name={session.name} />
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
}: {
  institutionId: string;
  name: string;
}) {
  const [data, mandatory] = await Promise.all([
    getAdminDashboard(institutionId),
    getMandatoryCompliance(institutionId),
  ]);

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

      <MandatoryComplianceCards courses={mandatory} />

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
                    Vigente: {data.latestCourse.title}
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
          <Tabs defaultValue={data.totalPendingStaff > 0 ? "pendientes" : "actividad"}>
            <div className="px-6 pt-4 border-b bg-muted/10">
              <TabsList className="bg-muted/50">
                <TabsTrigger value="pendientes" className="gap-1.5 text-xs">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                  <span>Sin Inducción Aprobada</span>
                  <Badge
                    variant={data.totalPendingStaff > 0 ? "destructive" : "secondary"}
                    className="ml-1 px-1.5 py-0 text-[10px] h-4"
                  >
                    {data.totalPendingStaff}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="actividad" className="gap-1.5 text-xs">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Últimos Movimientos</span>
                  <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] h-4">
                    {data.recent.length}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* PESTAÑA 1: Funcionarios que NO han hecho ninguna inducción */}
            <TabsContent value="pendientes" className="m-0">
              {data.pendingStaff.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2" />
                  <p className="text-sm font-semibold text-foreground">
                    ¡Excelente! Todo el personal activo está al día
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    No hay funcionarios activos pendientes. Todos cuentan con al menos una inducción institucional aprobada.
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2.5 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200">
                    <span>
                      Mostrando <strong>{data.pendingStaff.length}</strong> de <strong>{data.totalPendingStaff}</strong> funcionario(s) que aún no completan ninguna inducción.
                      {data.latestCourse && (
                        <span className="ml-1 text-muted-foreground">
                          (Inducción sugerida para asignar: <strong>{data.latestCourse.title}</strong>)
                        </span>
                      )}
                    </span>
                    <Button asChild size="sm" variant="ghost" className="h-7 text-xs text-amber-900 dark:text-amber-200 hover:bg-amber-500/20">
                      <Link href="/admin/funcionarios">
                        Asignar ahora →
                      </Link>
                    </Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Funcionario</TableHead>
                        <TableHead>Cargo y Área</TableHead>
                        <TableHead>Inducción Vigente</TableHead>
                        <TableHead>Estado Actual</TableHead>
                        <TableHead className="text-right pr-6">Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.pendingStaff.map((user) => {
                        const hasProgress = user.courseProgress && user.courseProgress.length > 0;
                        const progressStatus = hasProgress ? user.courseProgress[0]!.status : null;

                        return (
                          <TableRow key={user.id}>
                            <TableCell>
                              <span className="block font-medium">{user.name}</span>
                              <span className="block text-xs text-muted-foreground font-mono">
                                {formatRut(user.rut)} {user.email ? `· ${user.email}` : ""}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs">
                              <span className="block font-medium">
                                {user.position?.name ?? SIN_ASIGNAR}
                              </span>
                              <span className="block text-muted-foreground">
                                {user.area?.name ?? "Sin área"}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs">
                              {data.latestCourse ? (
                                <span className="font-medium">{data.latestCourse.title}</span>
                              ) : (
                                <span className="text-muted-foreground italic">
                                  Sin inducciones publicadas
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {progressStatus === "IN_PROGRESS" ? (
                                <Badge variant="warning">En progreso</Badge>
                              ) : progressStatus === "PENDING" ? (
                                <Badge variant="secondary">Asignado (Pendiente)</Badge>
                              ) : (
                                <Badge variant="destructive">Sin inducción</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right pr-6">
                              <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                                <Link href="/admin/invitaciones">
                                  Gestionar
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </>
              )}
            </TabsContent>

            {/* PESTAÑA 2: Últimos movimientos registrados */}
            <TabsContent value="actividad" className="m-0">
              {data.recent.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                  Aún no hay actividad reciente registrada en este colegio.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Funcionario</TableHead>
                      <TableHead>Inducción</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right pr-6">Actualizado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recent.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <span className="block font-medium">{entry.user.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {formatRut(entry.user.rut)} · {entry.user.position?.name ?? SIN_ASIGNAR}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate font-medium">
                          {entry.course.title}
                        </TableCell>
                        <TableCell>
                          <ProgressBadge status={entry.status} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground text-right pr-6">
                          {formatDateTime(entry.updatedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
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
