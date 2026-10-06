"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, FileCheck2, Search, Trash2, Upload, UserRound } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/utils";
import { formatRut } from "@/lib/rut";
import {
  deleteOrphanSignedFilesAction,
  deleteSignedCertificateAction,
} from "@/server/actions/signed-certificate-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ProgressStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

interface CourseOption {
  id: string;
  title: string;
  isPublished: boolean;
}

interface OrphanFile {
  fileName: string;
  isPdf: boolean;
  size: number;
  modifiedAt: Date;
}

const ALL_COURSES = "__todas__";

interface StaffOption {
  id: string;
  name: string;
  rut: string;
  isActive: boolean;
  areaName: string | null;
  progress: Record<string, ProgressStatus>;
}

interface SignedCertificateItem {
  id: string;
  userId: string;
  courseId: string;
  originalName: string;
  isPdf: boolean;
  size: number;
  originalSize: number;
  updatedAt: Date;
  uploadedByName: string | null;
}

const STATUS_LABELS: Record<ProgressStatus, string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En curso",
  COMPLETED: "Completada",
  FAILED: "Reprobada",
};

const ACCEPT = ".pdf,.jpg,.jpeg,application/pdf,image/jpeg";
const MAX_BYTES = 20 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function matches(user: StaffOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/[^0-9k]/g, "");
  return (
    user.name.toLowerCase().includes(q) ||
    (digits.length >= 3 && user.rut.toLowerCase().replace(/[^0-9k]/g, "").includes(digits))
  );
}

export function SignedCertificatesManager({
  courses,
  users,
  certificates,
  orphans,
  canManageOrphans,
}: {
  courses: CourseOption[];
  users: StaffOption[];
  certificates: SignedCertificateItem[];
  orphans: OrphanFile[];
  canManageOrphans: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [extraCourseId, setExtraCourseId] = useState("");
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [listSearch, setListSearch] = useState("");
  const [listCourseId, setListCourseId] = useState(ALL_COURSES);
  const [selectedOrphans, setSelectedOrphans] = useState<string[]>([]);
  const topRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<{ userId: string; courseId: string } | null>(null);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const certByKey = useMemo(
    () => new Map(certificates.map((c) => [`${c.userId}:${c.courseId}`, c])),
    [certificates],
  );

  const results = useMemo(
    () => (search.trim().length >= 2 ? users.filter((u) => matches(u, search)).slice(0, 8) : []),
    [users, search],
  );
  const selectedUser = selectedUserId ? userById.get(selectedUserId) ?? null : null;

  // Cursos del funcionario: los asignados + los que ya tienen constancia subida.
  const userCourseIds = useMemo(() => {
    if (!selectedUser) return [];
    const ids = new Set(Object.keys(selectedUser.progress));
    certificates.filter((c) => c.userId === selectedUser.id).forEach((c) => ids.add(c.courseId));
    return courses.map((c) => c.id).filter((id) => ids.has(id));
  }, [selectedUser, certificates, courses]);
  const otherCourses = courses.filter((c) => !userCourseIds.includes(c.id));

  const listed = useMemo(
    () =>
      certificates.filter((c) => {
        const user = userById.get(c.userId);
        const course = courseById.get(c.courseId);
        if (listCourseId !== ALL_COURSES && c.courseId !== listCourseId) return false;
        if (!listSearch.trim()) return true;
        const q = listSearch.trim().toLowerCase();
        return (
          (user && matches(user, listSearch)) || course?.title.toLowerCase().includes(q)
        );
      }),
    [certificates, listSearch, listCourseId, userById, courseById],
  );

  /** Abre el historial del funcionario (todas sus inducciones y constancias). */
  function showHistory(userId: string) {
    setSelectedUserId(userId);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function removeOrphans(fileNames: string[]) {
    if (fileNames.length === 0) return;
    if (!window.confirm(`¿Eliminar ${fileNames.length} archivo(s) suelto(s) del servidor? No se puede deshacer.`)) return;
    startTransition(async () => {
      const result = await deleteOrphanSignedFilesAction(fileNames);
      if (result.success) {
        toast.success(result.message ?? "Archivos eliminados.");
        setSelectedOrphans([]);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function pickFile(userId: string, courseId: string) {
    uploadTarget.current = { userId, courseId };
    fileInput.current?.click();
  }

  async function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const target = uploadTarget.current;
    if (!file || !target) return;

    if (!/\.(pdf|jpe?g)$/i.test(file.name)) {
      toast.error("Sólo se aceptan archivos PDF o JPG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("El archivo supera el máximo de 20 MB.");
      return;
    }

    const key = `${target.userId}:${target.courseId}`;
    setUploadingKey(key);
    const toastId = toast.loading("Subiendo y optimizando la constancia...");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("userId", target.userId);
      body.append("courseId", target.courseId);
      const response = await fetch("/api/constancias-firmadas", { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? "No se pudo subir la constancia.", { id: toastId });
        return;
      }
      const saved =
        data.optimized && data.originalSize > data.size
          ? ` Peso: ${formatBytes(data.originalSize)} → ${formatBytes(data.size)}.`
          : ` Peso: ${formatBytes(data.size)}.`;
      toast.success(`${data.message}${saved}`, { id: toastId, duration: 6000 });
      setExtraCourseId("");
      router.refresh();
    } catch {
      toast.error("Error de conexión al subir la constancia.", { id: toastId });
    } finally {
      setUploadingKey(null);
    }
  }

  function remove(cert: SignedCertificateItem) {
    const user = userById.get(cert.userId);
    if (!window.confirm(`¿Eliminar la constancia firmada de ${user?.name ?? "este funcionario"}?`)) return;
    startTransition(async () => {
      const result = await deleteSignedCertificateAction(cert.id);
      if (result.success) {
        toast.success(result.message ?? "Constancia eliminada.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function CertActions({ cert }: { cert: SignedCertificateItem }) {
    return (
      <div className="flex items-center justify-end gap-1">
        <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0" title="Ver">
          <a href={`/api/constancias-firmadas/${cert.id}`} target="_blank" rel="noreferrer">
            <Eye className="h-4 w-4" />
          </a>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0" title="Descargar">
          <a href={`/api/constancias-firmadas/${cert.id}?download=1`}>
            <Download className="h-4 w-4" />
          </a>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
          title="Eliminar"
          disabled={isPending}
          onClick={() => remove(cert)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div ref={topRef} />
      <input ref={fileInput} type="file" accept={ACCEPT} className="hidden" onChange={onFileChosen} />

      {/* 1. Buscar funcionario */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subir constancia firmada</CardTitle>
          <CardDescription>
            Sólo PDF o JPG, hasta 20 MB. Se optimiza automáticamente; si ya existe una para esa
            inducción, se reemplaza.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar funcionario por nombre o RUT"
              className="pl-8"
            />
          </div>

          {results.length > 0 && (
            <div className="divide-y rounded-md border">
              {results.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => {
                    setSelectedUserId(user.id);
                    setSearch("");
                  }}
                  className="flex w-full items-center justify-between gap-3 p-2.5 text-left hover:bg-muted/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{user.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatRut(user.rut)} · {user.areaName ?? "Sin área"}
                    </span>
                  </span>
                  {!user.isActive && <Badge variant="secondary">Inactivo</Badge>}
                </button>
              ))}
            </div>
          )}
          {search.trim().length >= 2 && results.length === 0 && (
            <p className="text-xs text-muted-foreground">No hay funcionarios que coincidan.</p>
          )}

          {/* 2. Inducciones del funcionario elegido */}
          {selectedUser && (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-primary" />
                <span className="font-medium">{selectedUser.name}</span>
                <span className="text-xs text-muted-foreground">{formatRut(selectedUser.rut)}</span>
              </div>

              {userCourseIds.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No tiene inducciones asignadas. Elige una abajo para subir su constancia.
                </p>
              )}

              {userCourseIds.map((courseId) => {
                const course = courseById.get(courseId);
                const cert = certByKey.get(`${selectedUser.id}:${courseId}`);
                const status = selectedUser.progress[courseId];
                const busy = uploadingKey === `${selectedUser.id}:${courseId}`;
                return (
                  <div
                    key={courseId}
                    className="flex flex-col gap-2 rounded-md border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <span className="block text-sm font-medium">
                        {course?.title}
                        {course && !course.isPublished && (
                          <Badge variant="secondary" className="ml-2 text-[10px]">No publicada</Badge>
                        )}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {status ? STATUS_LABELS[status] : "No asignada"}
                        {cert ? (
                          <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
                            <FileCheck2 className="h-3 w-3" />
                            Constancia subida · {cert.isPdf ? "PDF" : "JPG"} · {formatBytes(cert.size)}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Sin constancia</Badge>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {cert && <CertActions cert={cert} />}
                      <Button
                        size="sm"
                        variant={cert ? "outline" : "default"}
                        className="h-8 gap-1.5 text-xs"
                        disabled={uploadingKey !== null}
                        onClick={() => pickFile(selectedUser.id, courseId)}
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {busy ? "Subiendo..." : cert ? "Reemplazar" : "Subir PDF/JPG"}
                      </Button>
                    </div>
                  </div>
                );
              })}

              {otherCourses.length > 0 && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select value={extraCourseId} onValueChange={setExtraCourseId}>
                    <SelectTrigger className="sm:w-80">
                      <SelectValue placeholder="Otra inducción o capacitación..." />
                    </SelectTrigger>
                    <SelectContent>
                      {otherCourses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={!extraCourseId || uploadingKey !== null}
                    onClick={() => pickFile(selectedUser.id, extraCourseId)}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Subir PDF/JPG
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Listado de constancias subidas */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Constancias subidas ({certificates.length})</CardTitle>
            <CardDescription>
              Del colegio activo, cada una asociada a su inducción. Haz clic en un funcionario para ver su historial.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={listCourseId} onValueChange={setListCourseId}>
              <SelectTrigger className="sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_COURSES}>Todas las inducciones</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Filtrar por funcionario o RUT"
              className="sm:w-60"
            />
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="min-w-[200px]">Funcionario</TableHead>
                  <TableHead className="min-w-[160px]">Inducción</TableHead>
                  <TableHead className="w-36">Archivo</TableHead>
                  <TableHead className="w-40">Subida</TableHead>
                  <TableHead className="w-32 text-right pr-4">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listed.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                      Aún no hay constancias subidas.
                    </TableCell>
                  </TableRow>
                ) : (
                  listed.map((cert) => {
                    const user = userById.get(cert.userId);
                    return (
                      <TableRow key={cert.id}>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => user && showHistory(user.id)}
                            className="block text-left font-medium hover:underline"
                            title="Ver historial de constancias de este funcionario"
                          >
                            {user?.name ?? "—"}
                          </button>
                          <span className="block text-xs text-muted-foreground">
                            {user ? formatRut(user.rut) : ""}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{courseById.get(cert.courseId)?.title ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          <span className="block">
                            {cert.isPdf ? "PDF" : "JPG"} · {formatBytes(cert.size)}
                          </span>
                          {cert.originalSize > cert.size && (
                            <span className="block text-muted-foreground">
                              antes {formatBytes(cert.originalSize)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground" suppressHydrationWarning>
                          {formatDateTime(cert.updatedAt)}
                          {cert.uploadedByName && <span className="block">por {cert.uploadedByName}</span>}
                        </TableCell>
                        <TableCell className="pr-4">
                          <CertActions cert={cert} />
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

      {/* 4. Archivos sueltos (sólo SUPER_ADMIN) */}
      {canManageOrphans && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Archivos sueltos ({orphans.length})</CardTitle>
              <CardDescription>
                Archivos en el servidor sin constancia asociada (por ejemplo, de un curso o funcionario
                eliminado). Revísalos y elimínalos manualmente.
              </CardDescription>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              disabled={isPending || selectedOrphans.length === 0}
              onClick={() => removeOrphans(selectedOrphans)}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar seleccionados ({selectedOrphans.length})
            </Button>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {orphans.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No hay archivos sueltos.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="w-10 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedOrphans.length === orphans.length}
                          onChange={() =>
                            setSelectedOrphans(
                              selectedOrphans.length === orphans.length ? [] : orphans.map((o) => o.fileName),
                            )
                          }
                          className="h-4 w-4 cursor-pointer rounded border-gray-300"
                          aria-label="Seleccionar todos los archivos sueltos"
                        />
                      </TableHead>
                      <TableHead>Archivo</TableHead>
                      <TableHead className="w-32">Tamaño</TableHead>
                      <TableHead className="w-44">Fecha</TableHead>
                      <TableHead className="w-28 text-right pr-4">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orphans.map((orphan) => (
                      <TableRow key={orphan.fileName}>
                        <TableCell className="px-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedOrphans.includes(orphan.fileName)}
                            onChange={() =>
                              setSelectedOrphans((prev) =>
                                prev.includes(orphan.fileName)
                                  ? prev.filter((f) => f !== orphan.fileName)
                                  : [...prev, orphan.fileName],
                              )
                            }
                            className="h-4 w-4 cursor-pointer rounded border-gray-300"
                            aria-label={`Seleccionar ${orphan.fileName}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{orphan.fileName}</TableCell>
                        <TableCell className="text-xs">
                          {orphan.isPdf ? "PDF" : "JPG"} · {formatBytes(orphan.size)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground" suppressHydrationWarning>
                          {formatDateTime(orphan.modifiedAt)}
                        </TableCell>
                        <TableCell className="pr-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0" title="Ver">
                              <a
                                href={`/api/constancias-firmadas/sueltos/${encodeURIComponent(orphan.fileName)}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <Eye className="h-4 w-4" />
                              </a>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              title="Eliminar del servidor"
                              disabled={isPending}
                              onClick={() => removeOrphans([orphan.fileName])}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
