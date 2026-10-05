import type { Metadata } from "next";
import Link from "next/link";
import { Clock, PlayCircle, Video } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { formatDuration } from "@/lib/utils";
import { getMyCourses } from "@/server/queries/courses";
import { PageHeader } from "@/components/shared/page-header";
import { ProgressBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const metadata: Metadata = { title: "Mis inducciones" };

export default async function MyCoursesPage() {
  const session = await requireSession();
  const courses = await getMyCourses(session.sub, session.institutionId);

  return (
    <>
      <PageHeader
        title="Mis inducciones"
        description="Contenidos asignados por RRHH de tu colegio."
      />

      {courses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Video className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-medium">
              No tienes inducciones asignadas
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cuando RRHH te asigne una, aparecerá aquí y recibirás un correo.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <Card key={course.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-4 pt-6">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold leading-tight">{course.title}</h2>
                  <ProgressBadge status={course.status} />
                </div>

                {course.description && (
                  <p className="line-clamp-3 text-sm text-muted-foreground">
                    {course.description}
                  </p>
                )}

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <PlayCircle className="h-3.5 w-3.5" aria-hidden />
                    {course.totalLessons} video(s)
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    {formatDuration(course.totalSeconds)}
                  </span>
                </div>

                <div className="mt-auto space-y-3">
                  <div className="space-y-1">
                    <Progress value={course.progressPercent} />
                    <p className="text-xs text-muted-foreground">
                      {course.watchedLessons} de {course.totalLessons}{" "}
                      completados
                      {course.finalScore !== null &&
                        ` · Puntaje ${course.finalScore}%`}
                    </p>
                  </div>

                  <Button asChild className="w-full">
                    <Link href={`/mis-inducciones/${course.id}`}>
                      {course.status === "COMPLETED"
                        ? "Ver contenido"
                        : course.status === "IN_PROGRESS"
                          ? "Continuar"
                          : "Comenzar"}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
