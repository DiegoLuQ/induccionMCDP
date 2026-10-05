"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProgressStatus } from "@prisma/client";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  HelpCircle,
  Loader2,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { SIN_ASIGNAR } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import { formatRut } from "@/lib/rut";
import { ParticipationCertificateModal } from "./participation-certificate-modal";
import {
  deleteCourseProgressAction,
  resetAllCourseProgressAction,
  getCourseProgressDetailAction,
  type CourseProgressDetailData,
} from "@/server/actions/progress-actions";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ProgressRecentItem {
  id: string;
  status: ProgressStatus;
  finalScore: number | null;
  completedAt: Date | null;
  user: {
    name: string;
    rut: string;
    position: { name: string } | null;
  };
  course: {
    title: string;
  };
}

export function AdminProgressTable({
  recent,
  institutionName = "Colegio Diego Portales",
  institutionLogoUrl,
}: {
  recent: ProgressRecentItem[];
  institutionName?: string;
  institutionLogoUrl?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailData, setDetailData] = useState<CourseProgressDetailData | null>(null);

  const [certModalOpen, setCertModalOpen] = useState(false);
  const [certData, setCertData] = useState<{
    funcionarioName: string;
    funcionarioRut: string;
    courseTitle: string;
    completionDate: Date | null;
  } | null>(null);

  function handleOpenCertificate(entry: ProgressRecentItem) {
    setCertData({
      funcionarioName: entry.user.name,
      funcionarioRut: entry.user.rut,
      courseTitle: entry.course.title,
      completionDate: entry.completedAt,
    });
    setCertModalOpen(true);
  }

  async function handleOpenDetail(progressId: string) {
    setLoadingDetail(true);
    setDetailModalOpen(true);
    setDetailData(null);
    try {
      const res = await getCourseProgressDetailAction(progressId);
      if (res.success && res.data) {
        setDetailData(res.data);
      } else {
        toast.error(res.message || "No se pudo cargar el detalle");
        setDetailModalOpen(false);
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al obtener las respuestas del funcionario");
      setDetailModalOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  }

  function handleDeleteSingle(id: string, name: string) {
    if (!confirm(`¿Eliminar el progreso y respuestas de prueba de ${name}?`))
      return;

    startTransition(async () => {
      const toastId = toast.loading("Eliminando progreso...");
      const result = await deleteCourseProgressAction(id);
      if (result.success) {
        toast.success(result.message || "Progreso eliminado", { id: toastId });
        router.refresh();
      } else {
        toast.error(result.message || "Error al eliminar", { id: toastId });
      }
    });
  }

  function handleResetAll() {
    if (recent.length === 0) return;
    if (
      !confirm(
        "¿Estás seguro de REINICIAR Y ELIMINAR TODO el seguimiento de funcionarios? Se borrarán los avances y respuestas de prueba.",
      )
    )
      return;

    startTransition(async () => {
      const toastId = toast.loading("Reiniciando seguimiento...");
      const result = await resetAllCourseProgressAction();
      if (result.success) {
        toast.success(result.message, { id: toastId });
        router.refresh();
      } else {
        toast.error(result.message || "Error al reiniciar", { id: toastId });
      }
    });
  }

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
        <div>
          <CardTitle>Seguimiento de funcionarios</CardTitle>
          <CardDescription>
            Quién completó, quién está en progreso y quién no ha comenzado.
          </CardDescription>
        </div>

        {recent.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={handleResetAll}
            className="gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 h-8"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Limpiar Todo el Seguimiento
          </Button>
        )}
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {recent.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            Sin registros de avance todavía.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionario</TableHead>
                <TableHead>Inducción</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Puntaje</TableHead>
                <TableHead>Completado</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <span className="block font-medium">{entry.user.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatRut(entry.user.rut)} ·{" "}
                      {entry.user.position?.name ?? SIN_ASIGNAR}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate">
                    {entry.course.title}
                  </TableCell>
                  <TableCell>
                    <ProgressBadge status={entry.status} />
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {entry.finalScore !== null ? `${entry.finalScore}%` : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(entry.completedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {(entry.status === ProgressStatus.IN_PROGRESS ||
                        entry.status === ProgressStatus.COMPLETED) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenCertificate(entry)}
                          title="Generar e imprimir Constancia de Participación"
                          className="h-8 gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 font-medium"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Constancia
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDetail(entry.id)}
                        title="Ver detalles, estadísticas y respuestas"
                        className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isPending}
                        onClick={() =>
                          handleDeleteSingle(entry.id, entry.user.name)
                        }
                        title="Eliminar este registro de avance"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Modal de Detalle, Tiempos y Respuestas de la Inducción */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-6 bg-white rounded-2xl shadow-2xl border-slate-200">
          <DialogHeader className="space-y-1.5 text-left border-b border-slate-100 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                  <Sparkles className="w-4 h-4" />
                </div>
                <DialogTitle className="text-lg font-bold text-slate-900">
                  Expediente de Inducción y Respuestas
                </DialogTitle>
              </div>
              {detailData && (
                <ProgressBadge status={detailData.progress.status} />
              )}
            </div>
            {detailData && (
              <DialogDescription className="text-xs text-slate-600">
                <strong className="text-slate-800">{detailData.user.name}</strong>{" "}
                ({formatRut(detailData.user.rut)}) · {detailData.user.position || SIN_ASIGNAR}
                {detailData.user.area && ` · ${detailData.user.area}`}
              </DialogDescription>
            )}
          </DialogHeader>

          {loadingDetail ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-xs">Cargando expediente y respuestas...</p>
            </div>
          ) : detailData ? (
            <div className="flex-1 overflow-y-auto space-y-5 py-2 pr-1">
              {/* Tarjetas de Métricas Rápidas */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    Hora de Ingreso
                  </div>
                  <p className="text-xs font-bold text-slate-900 mt-1">
                    {detailData.progress.startedAt
                      ? formatDateTime(detailData.progress.startedAt)
                      : "No registrada"}
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <Calendar className="w-3.5 h-3.5 text-amber-600" />
                    Última Actividad
                  </div>
                  <p className="text-xs font-bold text-slate-900 mt-1">
                    {formatDateTime(detailData.progress.updatedAt)}
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Completado
                  </div>
                  <p className="text-xs font-bold text-slate-900 mt-1">
                    {detailData.progress.completedAt
                      ? formatDateTime(detailData.progress.completedAt)
                      : "En progreso"}
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    Puntaje Global
                  </div>
                  <p className="text-xs font-bold text-blue-700 mt-1">
                    {detailData.progress.finalScore !== null
                      ? `${detailData.progress.finalScore}%`
                      : "—"}
                  </p>
                </div>
              </div>

              {/* Sección 1: Respuestas de Evaluaciones */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Cuestionarios y Respuestas del Colaborador</span>
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    {detailData.evaluations.length} evaluación(es) en este curso
                  </span>
                </div>

                {detailData.evaluations.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-lg">
                    Este curso no tiene evaluaciones asociadas.
                  </p>
                ) : (
                  detailData.evaluations.map((ev) => (
                    <div
                      key={ev.id}
                      className="border border-slate-200 rounded-xl p-3.5 bg-white shadow-sm space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <h5 className="text-xs font-bold text-slate-900">
                            {ev.lessonTitle ? `${ev.lessonTitle} · ` : ""}
                            {ev.title}
                          </h5>
                          {ev.submission && (
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Entregado el: {formatDateTime(ev.submission.createdAt)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {ev.submission ? (
                            <>
                              <Badge
                                variant={ev.submission.status === "PASSED" ? "default" : "destructive"}
                                className={
                                  ev.submission.status === "PASSED"
                                    ? "bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]"
                                    : "text-[10px]"
                                }
                              >
                                {ev.submission.status === "PASSED" ? "Aprobada" : "Reprobada"}
                              </Badge>
                              <span className="text-xs font-bold text-slate-900 font-mono bg-slate-100 px-2 py-0.5 rounded">
                                {ev.submission.score}%
                              </span>
                            </>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-slate-500 bg-slate-50">
                              Sin responder
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Lista de preguntas y respuestas */}
                      <div className="space-y-2.5 pt-1">
                        {ev.questions.map((q, qIdx) => (
                          <div
                            key={q.id}
                            className="bg-slate-50/80 border border-slate-200 rounded-lg p-3 text-xs space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-slate-800">
                                {qIdx + 1}. {q.prompt}
                              </p>
                              <span className="text-[10px] text-slate-500 shrink-0 font-medium">
                                {q.points} pt{q.points > 1 ? "s" : ""}
                              </span>
                            </div>

                            {/* Respuesta del usuario */}
                            {q.userAnswer ? (
                              q.isCorrect ? (
                                <div className="p-2 rounded-md bg-emerald-50 border border-emerald-200 flex items-start gap-2 text-emerald-900">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                  <div className="text-xs">
                                    <p className="font-medium text-emerald-800">
                                      Respuesta del funcionario:{" "}
                                      <span className="font-bold">{q.userAnswerLabel}</span>
                                    </p>
                                    <p className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                                      ✓ Correcta (+{q.earned} pt{q.earned > 1 ? "s" : ""})
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-2 rounded-md bg-rose-50 border border-rose-200 space-y-1 text-rose-900">
                                  <div className="flex items-start gap-2">
                                    <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                    <div className="text-xs">
                                      <p className="font-medium text-rose-800">
                                        Respuesta del funcionario:{" "}
                                        <span className="font-bold line-through">{q.userAnswerLabel}</span>
                                      </p>
                                      <p className="text-[10px] text-rose-700 font-semibold mt-0.5">
                                        ✗ Incorrecta (0 pts)
                                      </p>
                                    </div>
                                  </div>
                                  {q.correctAnswerLabel && (
                                    <p className="text-[11px] text-slate-700 pl-6">
                                      Respuesta correcta esperada:{" "}
                                      <strong className="text-emerald-700">{q.correctAnswerLabel}</strong>
                                    </p>
                                  )}
                                </div>
                              )
                            ) : (
                              <div className="p-2 rounded-md bg-slate-100 border border-slate-200 flex items-center gap-2 text-slate-500 text-xs">
                                <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>Esta pregunta aún no ha sido contestada por el funcionario.</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Sección 2: Avance de Lecciones */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-purple-600" />
                    <span>Cápsulas y Contenido del Curso</span>
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    {detailData.lessons.filter((l) => l.isWatched).length} de {detailData.lessons.length} vistas
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
                  {detailData.lessons.map((lesson, lIdx) => (
                    <div
                      key={lesson.id}
                      className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {lesson.isWatched ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />
                        )}
                        <div className="truncate">
                          <p className="font-semibold text-slate-900 truncate">
                            {lIdx + 1}. {lesson.title}
                          </p>
                          {lesson.completedAt && (
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              Completada el {formatDateTime(lesson.completedAt)}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge
                        variant={lesson.isWatched ? "default" : "outline"}
                        className={`text-[10px] shrink-0 ${
                          lesson.isWatched
                            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                            : "text-slate-500 bg-slate-50"
                        }`}
                      >
                        {lesson.isWatched ? "Completada" : "Pendiente"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="pt-3 border-t border-slate-100 flex justify-end">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setDetailModalOpen(false)}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs px-4"
            >
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal para ver, editar e imprimir la Constancia de Participación */}
      {certData && (
        <ParticipationCertificateModal
          isOpen={certModalOpen}
          onOpenChange={setCertModalOpen}
          funcionarioName={certData.funcionarioName}
          funcionarioRut={certData.funcionarioRut}
          courseTitle={certData.courseTitle}
          institutionName={institutionName}
          institutionLogoUrl={institutionLogoUrl}
          completionDate={certData.completionDate}
        />
      )}
    </Card>
  );
}
