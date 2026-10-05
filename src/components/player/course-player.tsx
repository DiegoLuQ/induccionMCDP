"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CircleDot,
  Lock,
  PlayCircle,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import type { CoursePlayerData, PlayerLesson } from "@/server/queries/courses";
import { startCourseAction } from "@/server/actions/progress-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EvaluationForm } from "./evaluation-form";
import { VideoPlayer } from "./video-player";
import { CourseWelcomeModal } from "./course-welcome-modal";
import { CourseCompletionModal } from "./course-completion-modal";

interface CoursePlayerProps {
  course: CoursePlayerData;
  isPreview?: boolean;
}

/**
 * Orquesta la experiencia del funcionario:
 *  - Video único largo -> una lección.
 *  - Serie de micro-videos -> lista secuencial de cápsulas.
 */
export function CoursePlayer({ course, isPreview = false }: CoursePlayerProps) {
  const router = useRouter();

  const firstPending =
    course.lessons.find((lesson: PlayerLesson) => lesson.isUnlocked && !lesson.isWatched) ??
    course.lessons[course.lessons.length - 1];

  const [activeLessonId, setActiveLessonId] = useState<string>(
    firstPending?.id ?? "",
  );
  const [showCompletionModal, setShowCompletionModal] = useState(false);

  // Primer ingreso al reproductor: PENDING -> IN_PROGRESS.
  useEffect(() => {
    if (!isPreview && course.status === "PENDING") {
      void startCourseAction(course.id);
    }
  }, [course.id, course.status, isPreview]);

  const activeLesson =
    course.lessons.find((lesson: PlayerLesson) => lesson.id === activeLessonId) ??
    course.lessons[0];

  const watchedCount = course.lessons.filter((l: PlayerLesson) => l.isWatched).length;
  const progressPercent =
    course.lessons.length > 0
      ? Math.round((watchedCount / course.lessons.length) * 100)
      : 0;

  const isSingleVideo = course.lessons.length === 1;
  const isAllVideosWatched =
    course.lessons.length > 0 && watchedCount === course.lessons.length;

  const isAllEvaluationsPassed =
    course.lessons.every(
      (l: PlayerLesson) => !l.evaluation || l.evaluation.isPassed,
    ) &&
    (!course.finalEvaluation || course.finalEvaluation.isPassed);

  const isCourseFullyCompleted = isAllVideosWatched && isAllEvaluationsPassed;

  // Si la inducción está totalmente completada pero aún no se ha confirmado formalmente,
  // mostrar automáticamente el modal de finalización.
  useEffect(() => {
    if (isCourseFullyCompleted && course.status !== "COMPLETED") {
      setShowCompletionModal(true);
    }
  }, [isCourseFullyCompleted, course.status]);

  if (!activeLesson) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Esta inducción todavía no tiene videos cargados.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {course.typeName && (
              <Badge variant="outline">{course.typeName}</Badge>
            )}
            {course.isSequential && (
              <Badge variant="secondary">Secuencial</Badge>
            )}
            {course.status === "COMPLETED" ? (
              <Badge variant="success">Completada</Badge>
            ) : isCourseFullyCompleted ? (
              <Button
                size="sm"
                variant="default"
                className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 px-3 text-xs"
                onClick={() => setShowCompletionModal(true)}
              >
                Finalizar Inducción
              </Button>
            ) : null}
            {course.description && (
              <CourseWelcomeModal course={course} showTrigger />
            )}
          </div>
          <h2 className="text-lg font-semibold">{activeLesson.title}</h2>
          {activeLesson.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {activeLesson.description}
            </p>
          )}
        </div>

        <VideoPlayer
          key={activeLesson.id}
          lessonId={activeLesson.id}
          videoUrl={activeLesson.videoUrl}
          durationSeconds={activeLesson.durationSeconds}
          initialWatchedSeconds={activeLesson.watchedSeconds}
          isWatched={activeLesson.isWatched}
          isLocked={!activeLesson.isUnlocked}
          preventSkipping={course.isSequential && !activeLesson.isWatched}
          onWatched={() => {
            router.refresh();
            const isLastLesson =
              activeLesson.id ===
              course.lessons[course.lessons.length - 1]?.id;
            const evalPassed =
              !activeLesson.evaluation || activeLesson.evaluation.isPassed;
            const hasFinalEval = Boolean(course.finalEvaluation);
            if (isLastLesson && evalPassed && !hasFinalEval) {
              setShowCompletionModal(true);
            }
          }}
        />

        {/* Preguntas de la cápsula activa (si tiene) */}
        {activeLesson.evaluation && (
          <div className="pt-2">
            <EvaluationForm
              key={`eval-lesson-${activeLesson.evaluation.id}`}
              evaluation={activeLesson.evaluation}
              isUnlocked={activeLesson.isWatched}
              lockedMessage="Completa la visualización de este video para desbloquear las preguntas de repaso."
              onPassed={(data) => {
                router.refresh();
                const isLastLesson =
                  activeLesson.id ===
                  course.lessons[course.lessons.length - 1]?.id;
                const hasFinalEval = Boolean(course.finalEvaluation);
                if (data?.courseCompleted || (isLastLesson && !hasFinalEval)) {
                  setShowCompletionModal(true);
                }
              }}
            />
          </div>
        )}

        {/* Si ya vio todos los videos y hay preguntas finales del curso */}
        {isAllVideosWatched && course.finalEvaluation && (
          <div className="pt-2 border-t">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-foreground">Preguntas Finales del Curso</h3>
              <p className="text-xs text-muted-foreground">
                Has completado todos los videos. Responde las preguntas finales para finalizar tu inducción.
              </p>
            </div>
            <EvaluationForm
              key={`eval-final-${course.finalEvaluation.id}`}
              evaluation={course.finalEvaluation}
              isUnlocked={course.finalEvaluation.isUnlocked}
              lockedMessage="Debes completar todos los videos antes de responder las preguntas finales."
              onPassed={() => {
                router.refresh();
                setShowCompletionModal(true);
              }}
            />
          </div>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tu avance</CardTitle>
            <CardDescription>
              {watchedCount} de {course.lessons.length} video(s) completados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={progressPercent} />
            {course.status === "COMPLETED" && (
              <div className="space-y-2 pt-1">
                <p className="flex items-center gap-2 text-sm font-medium text-success">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  Inducción completada
                </p>
              </div>
            )}
            {(course.status === "COMPLETED" || isCourseFullyCompleted) && (
              <div className="pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCompletionModal(true)}
                  className="w-full text-xs font-medium border-success/30 hover:bg-success/10 text-success"
                >
                  {course.status === "COMPLETED" ? "Ver confirmación de término" : "Confirmar término de inducción"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {!isSingleVideo && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Contenido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 px-2 pb-3">
              {(() => {
                // Agrupar lecciones por tema/módulo
                const groups: { title: string; lessons: (typeof course.lessons[number] & { globalIndex: number })[] }[] = [];
                let currentGroup: { title: string; lessons: (typeof course.lessons[number] & { globalIndex: number })[] } | null = null;

                course.lessons.forEach((lesson, index) => {
                  const moduleTitle = lesson.moduleTitle || "General";
                  if (!currentGroup || currentGroup.title !== moduleTitle) {
                    currentGroup = { title: moduleTitle, lessons: [] };
                    groups.push(currentGroup);
                  }
                  currentGroup.lessons.push({ ...lesson, globalIndex: index });
                });

                const hasMultipleModules = groups.length > 1 || (groups.length === 1 && groups[0]?.title !== "General");

                return groups.map((group, gIdx) => (
                  <div key={`group-${gIdx}`} className="space-y-1 pb-2">
                    {hasMultipleModules && (
                      <div className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-t first:border-t-0">
                        {group.title}
                      </div>
                    )}
                    {group.lessons.map((lesson) => {
                      const isActive = lesson.id === activeLesson.id;
                      return (
                        <button
                          key={lesson.id}
                          type="button"
                          disabled={!lesson.isUnlocked}
                          onClick={() => setActiveLessonId(lesson.id)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                            isActive && "bg-accent",
                            lesson.isUnlocked
                              ? "hover:bg-accent"
                              : "cursor-not-allowed opacity-60",
                          )}
                        >
                          {!lesson.isUnlocked ? (
                            <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                          ) : lesson.isWatched ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
                          ) : isActive ? (
                            <CircleDot className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                          ) : (
                            <PlayCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {lesson.globalIndex + 1}. {lesson.title}
                            </span>
                            <span className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{formatDuration(lesson.durationSeconds)}</span>
                              {lesson.evaluation && (
                                <span className="rounded bg-primary/10 px-1.5 py-0.2 text-[10px] font-medium text-primary">
                                  {lesson.evaluation.isPassed ? "Pregunta respondida" : "Con Pregunta"}
                                </span>
                              )}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ));
              })()}
            </CardContent>
          </Card>
        )}
      </aside>
      </div>

      <CourseCompletionModal
        course={course}
        isOpen={showCompletionModal}
        onOpenChange={setShowCompletionModal}
        isPreview={isPreview}
      />
    </>
  );
}
