import type { Metadata } from "next";
import Link from "next/link";
import { Role, VideoFormat } from "@prisma/client";
import { BookOpen, Eye, Plus } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { SIN_ASIGNAR } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { formatDuration } from "@/lib/utils";
import { getAdminCourses } from "@/server/queries/courses";
import { STAFF_ROLES } from "@/lib/auth/rbac";
import {
  CoursePeriodBadge,
  CoursePeriodControls,
} from "@/components/admin/course-period-controls";
import { PageHeader } from "@/components/shared/page-header";
import {
  DeleteCourseButton,
  PublishToggle,
} from "@/components/admin/course-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Inducciones y cursos" };

const FORMAT_LABELS: Record<VideoFormat, string> = {
  FORMATO_LARGO: "Formato largo",
  MICRO_VIDEOS: "Micro-videos",
};

export default async function AdminCoursesPage() {
  const session = await requireRole(Role.SUPER_ADMIN, Role.ADMIN_RRHH);
  const [allCourses, activeStaffCount] = await Promise.all([
    getAdminCourses(session.institutionId),
    prisma.user.count({
      where: { institutionId: session.institutionId, isActive: true, role: { in: STAFF_ROLES } },
    }),
  ]);
  // Obligatorios primero; dentro de cada grupo, los más recientes.
  const courses = [...allCourses].sort((a, b) => Number(b.isMandatory) - Number(a.isMandatory));

  return (
    <>
      <PageHeader
        title="Inducciones y cursos"
        description="Contenidos del colegio activo: video único o serie de cápsulas."
        actions={
          <Button asChild>
            <Link href="/admin/cursos/nueva">
              <Plus className="h-4 w-4" aria-hidden />
              Nueva inducción
            </Link>
          </Button>
        }
      />

      {courses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-medium">Sin inducciones creadas</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crea la primera para poder invitar funcionarios.
            </p>
            <Button asChild className="mt-4">
              <Link href="/admin/cursos/nueva">
                <Plus className="h-4 w-4" aria-hidden />
                Nueva inducción
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="px-0 py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inducción</TableHead>
                  <TableHead>Obligatoriedad</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Formato</TableHead>
                  <TableHead>Duración</TableHead>
                  <TableHead>Avance</TableHead>
                  <TableHead className="text-right">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.map((course) => {
                  const completed = course.progress.filter(
                    (p) => p.status === "COMPLETED",
                  ).length;
                  const period = course.currentPeriod ?? course.createdAt.getFullYear();
                  const totalSeconds = course.lessons.reduce(
                    (sum, lesson) => sum + lesson.durationSeconds,
                    0,
                  );
                  return (
                    <TableRow key={course.id}>
                      <TableCell className="max-w-[320px]">
                        <Link
                          href={`/admin/cursos/${course.id}`}
                          className="block font-medium hover:underline"
                        >
                          {course.title}
                        </Link>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          <Badge variant="outline" className="mr-1.5">
                            {course.type?.name ?? SIN_ASIGNAR}
                          </Badge>
                          {course._count.invitations} invitación(es)
                        </span>
                        {course.tags.length > 0 && (
                          <span className="mt-1.5 flex flex-wrap gap-1">
                            {course.tags.map((tag) => (
                              <Badge
                                key={tag.id}
                                variant="secondary"
                                className="text-[10px]"
                              >
                                {tag.name}
                              </Badge>
                            ))}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <CoursePeriodBadge
                          isMandatory={course.isMandatory}
                          period={period}
                          dueDate={course.dueDate}
                        />
                      </TableCell>
                      <TableCell>
                        {course.category ? (
                          <span className="flex items-center gap-1.5 text-sm">
                            {course.category.color && (
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: course.category.color }}
                                aria-hidden
                              />
                            )}
                            {course.category.name}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="block">
                          {FORMAT_LABELS[course.videoFormat]}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {course._count.lessons} video(s)
                          {course.isSequential && " · secuencial"}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums text-sm">
                        {formatDuration(totalSeconds)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {completed} / {activeStaffCount} completados
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Badge
                            variant={course.isPublished ? "success" : "secondary"}
                          >
                            {course.isPublished ? "Publicada" : "Borrador"}
                          </Badge>
                          <Button asChild variant="ghost" size="icon" title="Vista previa">
                            <Link href={`/admin/cursos/${course.id}/preview`}>
                              <Eye className="h-4 w-4" aria-hidden />
                              <span className="sr-only">Vista previa</span>
                            </Link>
                          </Button>
                          <CoursePeriodControls
                            courseId={course.id}
                            courseTitle={course.title}
                            isMandatory={course.isMandatory}
                            period={period}
                            dueDate={course.dueDate}
                            activeCount={course.progress.length}
                          />
                          <PublishToggle
                            courseId={course.id}
                            isPublished={course.isPublished}
                          />
                          <DeleteCourseButton
                            courseId={course.id}
                            courseTitle={course.title}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
