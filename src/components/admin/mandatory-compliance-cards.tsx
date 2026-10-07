import Link from "next/link";
import { AlertTriangle, CalendarClock } from "lucide-react";
import type { MandatoryCourseCompliance } from "@/server/queries/mandatory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function formatDue(value: Date): string {
  return new Date(value).toLocaleDateString("es-CL", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Tarjetas de cumplimiento de los cursos obligatorios vigentes (Inicio de administradores). */
export function MandatoryComplianceCards({ courses }: { courses: MandatoryCourseCompliance[] }) {
  if (courses.length === 0) {
    return (
      <Card className="mt-6 border-dashed">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6 text-sm text-muted-foreground">
          <span>
            No hay cursos marcados como <strong>obligatorios</strong>. Márcalos en Inducciones y cursos → botón
            &quot;Período&quot; para medir su cumplimiento aquí.
          </span>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/cursos">Ir a cursos</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <h2 className="text-base font-semibold">Obligatorios vigentes</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {courses.map((course) => {
          const overdue = course.dueDate && new Date(course.dueDate) < new Date() && course.percent < 100;
          const pendingAreas = course.areas.filter((a) => a.completed < a.total);
          return (
            <Card key={course.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{course.title}</CardTitle>
                    <CardDescription className="flex flex-wrap items-center gap-1.5 pt-1">
                      <Badge variant="outline">Período {course.period}</Badge>
                      {course.typeName && <Badge variant="secondary">{course.typeName}</Badge>}
                      {course.dueDate && (
                        <span className={`flex items-center gap-1 text-xs ${overdue ? "text-destructive" : ""}`}>
                          <CalendarClock className="h-3.5 w-3.5" />
                          Límite {formatDue(course.dueDate)}
                          {overdue && " (vencido)"}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <span className="text-2xl font-bold tabular-nums">{course.percent}%</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full ${course.percent === 100 ? "bg-emerald-600" : "bg-primary"}`}
                    style={{ width: `${course.percent}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">{course.completed}</strong> de {course.total} funcionarios lo
                  completaron · {course.inProgress} en curso · {course.total - course.completed} pendientes
                </p>

                {pendingAreas.length > 0 ? (
                  <div className="space-y-1">
                    <p className="flex items-center gap-1 text-xs font-medium">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      Áreas con pendientes
                    </p>
                    <ul className="grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
                      {pendingAreas.slice(0, 8).map((area) => (
                        <li key={area.areaName} className="flex justify-between gap-2">
                          <span className="truncate">{area.areaName}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {area.total - area.completed} de {area.total}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs font-medium text-emerald-700">Todas las áreas al día ✓</p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/reportes?curso=${course.id}`}>Ver reporte</Link>
                  </Button>
                  {course.completed < course.total && (
                    <Button asChild size="sm">
                      <Link href="/admin/invitaciones">Invitar pendientes</Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
