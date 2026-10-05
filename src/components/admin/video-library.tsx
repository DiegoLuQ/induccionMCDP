"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, ExternalLink, HardDrive, Play, Trash2, Video } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/utils";
import type { UploadedVideoItem } from "@/server/queries/videos";
import { deleteOrphanVideosAction } from "@/server/actions/video-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Filter = "ALL" | "IN_USE" | "ORPHAN";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

/** Nombre legible: quita el prefijo "<timestamp>-<hash>_" que agrega la subida. */
function displayName(filename: string): string {
  return filename.replace(/^(\d+-[a-f0-9]+_)+/, "") || filename;
}

export function VideoLibrary({ videos }: { videos: UploadedVideoItem[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [selected, setSelected] = useState<string[]>([]);
  /** Videos a eliminar mientras el diálogo de confirmación está abierto. */
  const [toDelete, setToDelete] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preview, setPreview] = useState<UploadedVideoItem | null>(null);

  const deletable = useMemo(
    () => videos.filter((v) => v.usages.length === 0 && !v.isRecent),
    [videos],
  );
  const stats = useMemo(() => {
    const inUse = videos.filter((v) => v.usages.length > 0);
    const orphans = videos.filter((v) => v.usages.length === 0);
    const sum = (list: UploadedVideoItem[]) => list.reduce((acc, v) => acc + v.size, 0);
    return {
      total: videos.length,
      totalSize: sum(videos),
      inUse: inUse.length,
      inUseSize: sum(inUse),
      orphans: orphans.length,
      orphansSize: sum(orphans),
    };
  }, [videos]);

  const visible = useMemo(() => {
    if (filter === "IN_USE") return videos.filter((v) => v.usages.length > 0);
    if (filter === "ORPHAN") return videos.filter((v) => v.usages.length === 0);
    return videos;
  }, [videos, filter]);

  const visibleDeletable = visible.filter((v) => v.usages.length === 0 && !v.isRecent);

  function toggleAllVisible() {
    const names = visibleDeletable.map((v) => v.filename);
    const allSelected = names.every((n) => selected.includes(n));
    setSelected((prev) =>
      allSelected ? prev.filter((f) => !names.includes(f)) : [...new Set([...prev, ...names])],
    );
  }

  const toDeleteSize = videos
    .filter((v) => toDelete.includes(v.filename))
    .reduce((acc, v) => acc + v.size, 0);

  function toggle(filename: string) {
    setSelected((prev) =>
      prev.includes(filename) ? prev.filter((f) => f !== filename) : [...prev, filename],
    );
  }

  function openConfirm(filenames: string[]) {
    setToDelete(filenames);
    setConfirmOpen(true);
  }

  function handleDelete() {
    startTransition(async () => {
      const toastId = toast.loading("Eliminando videos...");
      try {
        const result = await deleteOrphanVideosAction(toDelete);
        if (result.success) {
          toast.success(result.message || "Videos eliminados.", { id: toastId, duration: 8000 });
          setSelected([]);
          setConfirmOpen(false);
        } else {
          toast.error(result.message || "No se pudieron eliminar los videos.", {
            id: toastId,
            duration: 10000,
          });
        }
        router.refresh();
      } catch (error) {
        console.error("[VideoLibrary] Error al eliminar videos:", error);
        toast.error(
          "No se pudo contactar al servidor para eliminar los videos. Recarga la página e inténtalo de nuevo.",
          { id: toastId, duration: 10000 },
        );
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={HardDrive}
          label="Total en servidor"
          value={`${stats.total} video(s)`}
          hint={formatBytes(stats.totalSize)}
        />
        <StatCard
          icon={Video}
          label="En uso"
          value={`${stats.inUse} video(s)`}
          hint={formatBytes(stats.inUseSize)}
        />
        <StatCard
          icon={AlertTriangle}
          label="Sueltos (sin uso)"
          value={`${stats.orphans} video(s)`}
          hint={formatBytes(stats.orphansSize)}
          tone={stats.orphans > 0 ? "warning" : "default"}
        />
      </div>

      <Card>
        <CardContent className="space-y-3 px-0 py-0">
          {/* Filtros y acciones */}
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["ALL", `Todos (${stats.total})`],
                  ["IN_USE", `En uso (${stats.inUse})`],
                  ["ORPHAN", `Sueltos (${stats.orphans})`],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={filter === value ? "default" : "outline"}
                  onClick={() => setFilter(value)}
                  className="h-8 text-xs"
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="destructive"
                className="h-8 gap-1.5 text-xs"
                disabled={selected.length === 0}
                onClick={() => openConfirm(selected)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar seleccionados ({selected.length})
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs text-destructive"
                disabled={deletable.length === 0}
                onClick={() => openConfirm(deletable.map((v) => v.filename))}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar todos los sueltos ({deletable.length})
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-10 px-3 text-center">
                    <input
                      type="checkbox"
                      checked={visibleDeletable.length > 0 && visibleDeletable.every((v) => selected.includes(v.filename))}
                      disabled={visibleDeletable.length === 0}
                      onChange={toggleAllVisible}
                      className="h-4 w-4 cursor-pointer rounded border-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
                      title={
                        visibleDeletable.length === 0
                          ? "No hay videos sueltos para seleccionar"
                          : "Seleccionar todos los sueltos visibles"
                      }
                      aria-label="Seleccionar todos los sueltos visibles"
                    />
                  </TableHead>
                  <TableHead className="min-w-[220px]">Video</TableHead>
                  <TableHead className="w-24">Tamaño</TableHead>
                  <TableHead className="w-40">Subido</TableHead>
                  <TableHead className="min-w-[240px]">Usado en</TableHead>
                  <TableHead className="w-28 text-right pr-4">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">
                      No hay videos en esta vista.
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((video) => {
                    const isOrphan = video.usages.length === 0;
                    const canDelete = isOrphan && !video.isRecent;
                    return (
                      <TableRow key={video.filename}>
                        <TableCell className="px-3 text-center">
                          <input
                            type="checkbox"
                            checked={canDelete && selected.includes(video.filename)}
                            disabled={!canDelete}
                            onChange={() => toggle(video.filename)}
                            className="h-4 w-4 cursor-pointer rounded border-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
                            title={
                              canDelete
                                ? "Seleccionar para eliminar"
                                : isOrphan
                                  ? "Subido hace menos de 24 h: aún no se puede eliminar"
                                  : "En uso por una lección: no se puede eliminar"
                            }
                            aria-label={`Seleccionar ${displayName(video.filename)}`}
                          />
                        </TableCell>
                        <TableCell>
                          <span className="block font-medium text-foreground break-all">
                            {displayName(video.filename)}
                          </span>
                          <span className="block text-[11px] text-muted-foreground font-mono break-all">
                            {video.filename}
                          </span>
                        </TableCell>
                        <TableCell className="tabular-nums text-xs">
                          {formatBytes(video.size)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground" suppressHydrationWarning>
                          {formatDateTime(video.uploadedAt)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {isOrphan ? (
                            video.isRecent ? (
                              <Badge variant="secondary" className="gap-1">
                                <Clock className="h-3 w-3" />
                                Reciente (menos de 24 h)
                              </Badge>
                            ) : (
                              <Badge variant="warning">Suelto</Badge>
                            )
                          ) : (
                            <ul className="space-y-1">
                              {video.usages.map((usage, index) => (
                                <li key={`${usage.courseId}-${index}`}>
                                  <Link
                                    href={`/admin/cursos/${usage.courseId}`}
                                    className="font-medium text-foreground hover:underline"
                                  >
                                    {usage.courseTitle}
                                  </Link>
                                  <span className="text-muted-foreground">
                                    {" "}· {usage.lessonTitle} · {usage.institutionName}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              title="Ver video"
                              onClick={() => setPreview(video)}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                title="Eliminar video"
                                onClick={() => openConfirm([video.filename])}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Confirmación de borrado */}
      <Dialog open={confirmOpen} onOpenChange={(open) => !isPending && setConfirmOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Eliminar videos sueltos
            </DialogTitle>
            <DialogDescription className="text-xs">
              Se eliminarán <strong className="text-foreground">{toDelete.length}</strong> video(s)
              del servidor ({formatBytes(toDeleteSize)}). Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2 text-xs">
            {toDelete.map((filename) => (
              <li key={filename} className="break-all">
                {displayName(filename)}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vista previa */}
      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="break-all pr-6">
              {preview ? displayName(preview.filename) : ""}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {preview ? formatBytes(preview.size) : ""}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <>
              <video
                key={preview.filename}
                src={preview.url}
                controls
                preload="metadata"
                className="w-full rounded-md bg-black"
              />
              <a
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Abrir en otra pestaña
              </a>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: typeof Video;
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "warning";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={`rounded-md p-2 ${
            tone === "warning" ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary"
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold leading-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}
