import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Role, VideoFormat } from "@prisma/client";
import { ArrowLeft, Clock, Eye, Film, Pencil } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { SIN_ASIGNAR } from "@/lib/constants";
import { cn, formatDuration } from "@/lib/utils";
import { getCourseForAdmin } from "@/server/queries/courses";
import { getLikertReport } from "@/server/queries/dashboard";
import { PageHeader } from "@/components/shared/page-header";
import {
  DeleteCourseButton,
  PublishToggle,
} from "@/components/admin/course-actions";
import {
  EvaluationEditor,
  type ExistingEvaluation,
} from "@/components/admin/evaluation-editor";
import { LessonActiveToggle } from "@/components/admin/lesson-active-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PageProps {
  params: Promise<{ courseId: string }>;
}

export const metadata: Metadata = { title: "Detalle del curso" };

/** Adapta el registro de Prisma al modelo que espera el editor. */
function toExisting(
  evaluation:
    | {
        id: string;
        title: string;
        passingScore: number;
        maxAttempts: number;
        questions: Array<{
          id: string;
          type: ExistingEvaluation["questions"][number]["type"];
          prompt: string;
          imageUrl: string | null;
          options: unknown;
          correctAnswer: string | null;
          points: number;
        }>;
        _count: { submissions: number };
      }
    | null
    | undefined,
): ExistingEvaluation | null {
  if (!evaluation) return null;
  return {
    id: evaluation.id,
    title: evaluation.title,
    passingScore: evaluation.passingScore,
    maxAttempts: evaluation.maxAttempts,
    submissionCount: evaluation._count.submissions,
    questions: evaluation.questions.map((question) => ({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      imageUrl: question.imageUrl,
      options: question.options,
      correctAnswer: question.correctAnswer,
      points: question.points,
    })),
  };
}

export default async function CourseDetailPage({ params }: PageProps) {
  const { courseId } = await params;
  const session = await requireRole(Role.SUPER_ADMIN, Role.ADMIN_RRHH);
  const [course, likert] = await Promise.all([
    getCourseForAdmin(courseId, session.institutionId),
    getLikertReport(courseId, session.institutionId),
  ]);

  if (!course) notFound();

  const totalSeconds = course.lessons.reduce(
    (sum, lesson) => sum + lesson.durationSeconds,
    0,
  );
  const isLongFormat = course.videoFormat === VideoFormat.FORMATO_LARGO;

  return (
    <>
      <PageHeader
        title={course.title}
        description={course.description ?? undefined}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/cursos">
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Volver
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/admin/cursos/${course.id}/editar`}>
                <Pencil className="h-4 w-4" aria-hidden />
                Editar curso
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/admin/cursos/${course.id}/preview`}>
                <Eye className="h-4 w-4" aria-hidden />
                Vista previa
              </Link>
            </Button>
            <PublishToggle
              courseId={course.id}
              isPublished={course.isPublished}
            />
            <DeleteCourseButton
              courseId={course.id}
              courseTitle={course.title}
              redirectAfterDelete
            />
          </>
        }
      />

      <div className="max-w-4xl space-y-6">
        {/* ------------------------- Resumen ------------------------- */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-6 text-sm">
            <Badge variant={course.isPublished ? "success" : "secondary"}>
              {course.isPublished ? "Publicada" : "Borrador"}
            </Badge>
            <Badge variant="outline">{course.type?.name ?? SIN_ASIGNAR}</Badge>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Film className="h-4 w-4" aria-hidden />
              {isLongFormat ? "Formato largo" : "Micro-videos"} ·{" "}
              {course.lessons.length} video(s)
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-4 w-4" aria-hidden />
              {formatDuration(totalSeconds)}
            </span>
            {course.category && (
              <span className="text-muted-foreground">
                Categoría: {course.category.name}
              </span>
            )}
            {course.tags.length > 0 && (
              <span className="flex flex-wrap gap-1">
                {course.tags.map((tag) => (
                  <Badge key={tag.id} variant="secondary" className="text-[10px]">
                    {tag.name}
                  </Badge>
                ))}
              </span>
            )}
          </CardContent>
        </Card>

        {/* ------------------- Evaluación final del curso ------------------- */}
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Evaluación final</h2>
            <p className="text-sm text-muted-foreground">
              Se habilita cuando el funcionario ha visto todos los videos.
            </p>
          </div>

          <EvaluationEditor
            target={{ courseId: course.id }}
            label="Evaluación final del curso"
            hint="Mide la comprensión de todo el contenido. Sin ella, un curso de formato largo no puede completarse."
            existing={toExisting(course.evaluations[0])}
          />
        </section>

        {/* --------------- Informe de escala de opinión --------------- */}
        {likert.length > 0 && (
          <>
            <Separator />
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">Escala de opinión</h2>
                <p className="text-sm text-muted-foreground">
                  Resultados de percepción. No puntúan ni afectan la aprobación.
                </p>
              </div>

              {likert.map((question) => (
                <Card key={question.id}>
                  <CardContent className="space-y-3 pt-6">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-medium">{question.prompt}</p>
                      <span className="text-xs text-muted-foreground">
                        {question.total} respuesta(s)
                        {question.average !== null &&
                          ` · promedio ${question.average.toFixed(1)}/5`}
                      </span>
                    </div>

                    {question.total === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Sin respuestas todavía.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {question.distribution.map((level) => {
                          const percent = Math.round(
                            (level.count / question.total) * 100,
                          );
                          return (
                            <li
                              key={level.value}
                              className="flex items-center gap-3 text-xs"
                            >
                              <span className="w-40 shrink-0 text-muted-foreground">
                                {level.label}
                              </span>
                              <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                                <span
                                  className="block h-full rounded-full bg-primary"
                                  style={{ width: `${percent}%` }}
                                />
                              </span>
                              <span className="w-16 shrink-0 text-right tabular-nums">
                                {level.count} ({percent}%)
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              ))}
            </section>
          </>
        )}

        {/* --------------- Gestión de Cápsulas y Micro-videos --------------- */}
        <Separator />
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">
                {isLongFormat ? "Video de la inducción" : "Cápsulas y micro-videos"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {isLongFormat
                  ? "Video único de formato largo."
                  : "Activa o desactiva cápsulas individualmente. Las cápsulas desactivadas no se mostrarán a los funcionarios ni bloquearán su avance."}
              </p>
            </div>
            {!isLongFormat && (
              <span className="text-xs font-medium text-muted-foreground">
                {course.lessons.filter((l) => l.isActive).length} de{" "}
                {course.lessons.length} cápsula(s) activas
              </span>
            )}
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>Cápsula / Video</TableHead>
                  <TableHead>Módulo / Tema</TableHead>
                  <TableHead>Duración</TableHead>
                  <TableHead>Evaluación</TableHead>
                  <TableHead className="text-right">
                    Estado (Activado / Desactivado)
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {course.lessons.map((lesson, index) => (
                  <TableRow
                    key={lesson.id}
                    className={cn(!lesson.isActive && "bg-muted/40 opacity-80")}
                  >
                    <TableCell className="text-center font-medium text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "font-medium block",
                          !lesson.isActive && "line-through text-muted-foreground",
                        )}
                      >
                        {lesson.title}
                      </span>
                      {lesson.description && (
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {lesson.description}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {lesson.module?.title || "General"}
                    </TableCell>
                    <TableCell className="tabular-nums text-xs">
                      {formatDuration(lesson.durationSeconds)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {lesson.evaluation ? (
                        <span className="text-primary font-medium">
                          {lesson.evaluation.questions.length} pregunta(s)
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Sin evaluación</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <LessonActiveToggle
                          lessonId={lesson.id}
                          initialIsActive={lesson.isActive}
                          lessonTitle={lesson.title}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </section>

        {/* --------------- Evaluación por cápsula (micro-videos) --------------- */}
        {!isLongFormat && (
          <>
            <Separator />
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">
                  Evaluación por cápsula
                </h2>
                <p className="text-sm text-muted-foreground">
                  {course.isSequential
                    ? "En este curso secuencial, cada cápsula debe aprobarse para desbloquear la siguiente."
                    : "Opcional: control de comprensión al final de cada cápsula."}
                </p>
              </div>

              {course.lessons.map((lesson, index) => (
                <div key={lesson.id} className="space-y-1.5">
                  {!lesson.isActive && (
                    <div className="flex items-center justify-between rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <span>Esta cápsula está desactivada (oculta para funcionarios).</span>
                      <LessonActiveToggle
                        lessonId={lesson.id}
                        initialIsActive={lesson.isActive}
                        lessonTitle={lesson.title}
                      />
                    </div>
                  )}
                  <EvaluationEditor
                    target={{ lessonId: lesson.id }}
                    label={`Cápsula ${index + 1}: ${lesson.title}${!lesson.isActive ? " (Desactivada)" : ""}`}
                    hint={`${formatDuration(lesson.durationSeconds)} de video. Sin evaluación, la cápsula se aprueba solo con verla.`}
                    existing={toExisting(lesson.evaluation)}
                  />
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </>
  );
}
