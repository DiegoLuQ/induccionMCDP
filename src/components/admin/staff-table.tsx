"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Award,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  GraduationCap,
  Mail,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  Video,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { ROLE_LABELS, SIN_ASIGNAR } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import { formatRut } from "@/lib/rut";
import type { StaffDirectoryItem, UserCourseItem } from "@/server/queries/funcionarios";
import {
  bulkDeleteUsersAction,
  deleteUserAction,
  removeCourseFromUsersAction,
  toggleUserActiveAction,
} from "@/server/actions/user-actions";
import { UserActiveToggle } from "@/components/admin/user-actions";
import {
  AssignCourseModal,
  type AvailableCourseOption,
} from "@/components/admin/assign-course-modal";
import { RemoveCourseModal } from "@/components/admin/remove-course-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface StaffTableProps {
  users: StaffDirectoryItem[];
  availableCourses: AvailableCourseOption[];
  currentUserId: string;
}

export function StaffTable({
  users,
  availableCourses,
  currentUserId,
}: StaffTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [isPending, startTransition] = useTransition();
  const [searchTerm, setSearchTerm] = useState(initialQuery);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [targetUserForAssign, setTargetUserForAssign] = useState<{
    ids: string[];
    summary: string;
  } | null>(null);

  const [removeModalOpen, setRemoveModalOpen] = useState(false);
  const [targetUserForRemove, setTargetUserForRemove] = useState<{
    ids: string[];
    summary: string;
  } | null>(null);

  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ACTIVE");

  // Filtros por inducción/curso específico
  const [selectedCourseId, setSelectedCourseId] = useState<string>("ALL");
  const [courseStatusFilter, setCourseStatusFilter] = useState<
    "ALL" | "COMPLETED" | "NOT_COMPLETED" | "IN_PROGRESS" | "NOT_ASSIGNED"
  >("ALL");

  // Orden de la tabla (clic en los encabezados Funcionario, RUT y Fecha ingreso)
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "name",
    dir: "asc",
  });

  function handleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }

  // Filtrado reactivo por nombre, rut, email, cargo, estado institucional y curso/evaluación
  const unsortedUsers = useMemo(() => {
    let list = users;

    // 1. Filtro por estado institucional (Activo / Inactivo)
    if (statusFilter === "ACTIVE") {
      list = list.filter((u) => u.isActive);
    } else if (statusFilter === "INACTIVE") {
      list = list.filter((u) => !u.isActive);
    }

    // 2. Filtro por curso / inducción seleccionada y su estado
    if (selectedCourseId === "NO_COURSES") {
      // Funcionarios sin ninguna inducción asignada
      list = list.filter((u) => u.courses.length === 0);
    } else if (selectedCourseId !== "ALL") {
      list = list.filter((u) => {
        const course = u.courses.find((c) => c.courseId === selectedCourseId);

        if (courseStatusFilter === "ALL") {
          // Asignado a este curso (cualquier estado)
          return Boolean(course);
        }
        if (courseStatusFilter === "COMPLETED") {
          // Ya lo dio / lo completó aprobado
          return course?.status === "COMPLETED";
        }
        if (courseStatusFilter === "NOT_COMPLETED") {
          // NO lo ha completado (ya sea que no lo tiene asignado, está pendiente, en curso o reprobado)
          return !course || course.status !== "COMPLETED";
        }
        if (courseStatusFilter === "IN_PROGRESS") {
          // En curso o pendiente
          return course && (course.status === "IN_PROGRESS" || course.status === "PENDING");
        }
        if (courseStatusFilter === "NOT_ASSIGNED") {
          // Ni siquiera tiene asignado este curso
          return !course;
        }
        return true;
      });
    } else if (courseStatusFilter !== "ALL") {
      // Si seleccionó "Todos los cursos" pero eligió una condición general:
      if (courseStatusFilter === "COMPLETED") {
        // Al menos un curso completado
        list = list.filter((u) => u.courses.some((c) => c.status === "COMPLETED"));
      } else if (courseStatusFilter === "NOT_COMPLETED") {
        // Ningún curso completado o con inducciones pendientes
        list = list.filter((u) => !u.courses.some((c) => c.status === "COMPLETED"));
      } else if (courseStatusFilter === "IN_PROGRESS") {
        list = list.filter((u) =>
          u.courses.some((c) => c.status === "IN_PROGRESS" || c.status === "PENDING"),
        );
      } else if (courseStatusFilter === "NOT_ASSIGNED") {
        list = list.filter((u) => u.courses.length === 0);
      }
    }

    // 3. Filtro por texto de búsqueda
    if (!searchTerm.trim()) return list;
    const query = searchTerm.toLowerCase().trim();
    const cleanQuery = query.replace(/[^0-9kK]/g, "");

    return list.filter((u) => {
      const matchesName = u.name.toLowerCase().includes(query);
      const matchesEmail = u.email.toLowerCase().includes(query);
      const matchesCorp = u.corporateEmail?.toLowerCase().includes(query);
      const matchesRut =
        u.rut.toLowerCase().includes(query) ||
        (cleanQuery && u.rut.replace(/[^0-9kK]/g, "").includes(cleanQuery));
      const matchesPosition = u.positionName?.toLowerCase().includes(query);
      const matchesArea = u.areaName?.toLowerCase().includes(query);

      return (
        matchesName ||
        matchesEmail ||
        matchesCorp ||
        matchesRut ||
        matchesPosition ||
        matchesArea
      );
    });
  }, [users, searchTerm, statusFilter, selectedCourseId, courseStatusFilter]);

  const filteredUsers = useMemo(
    () => [...unsortedUsers].sort((a, b) => compareStaff(a, b, sort.key, sort.dir)),
    [unsortedUsers, sort],
  );

  const allFilteredSelected =
    filteredUsers.length > 0 &&
    filteredUsers.every((u) => selectedIds.includes(u.id));

  function handleToggleSelectAll() {
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredUsers.map((u) => u.id));
      setSelectedIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      const newIds = new Set([...selectedIds, ...filteredUsers.map((u) => u.id)]);
      setSelectedIds(Array.from(newIds));
    }
  }

  function handleToggleRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  }

  function handleSingleDelete(user: StaffDirectoryItem) {
    if (user.id === currentUserId) {
      toast.error("No puedes eliminar tu propia cuenta de administrador.");
      return;
    }

    if (
      !confirm(
        `¿Eliminar al funcionario ${user.name} (${formatRut(user.rut)})?\n\nEsta acción eliminará su acceso y registros vinculados.`,
      )
    )
      return;

    startTransition(async () => {
      const toastId = toast.loading(`Eliminando a ${user.name}...`);
      const result = await deleteUserAction(user.id);
      if (result.success) {
        toast.success(result.message, { id: toastId });
        setSelectedIds((prev) => prev.filter((id) => id !== user.id));
        router.refresh();
      } else {
        toast.error(result.message, { id: toastId });
      }
    });
  }

  function handleBulkDelete() {
    const validIds = selectedIds.filter((id) => id !== currentUserId);
    if (validIds.length === 0) {
      toast.error("Selecciona al menos un funcionario para eliminar.");
      return;
    }

    if (
      !confirm(
        `¿Estás seguro de ELIMINAR los ${validIds.length} funcionario(s) seleccionados?\n\nEsta acción no se puede deshacer.`,
      )
    )
      return;

    startTransition(async () => {
      const toastId = toast.loading(`Eliminando ${validIds.length} funcionarios...`);
      const result = await bulkDeleteUsersAction(validIds);
      if (result.success) {
        toast.success(result.message, { id: toastId });
        setSelectedIds([]);
        router.refresh();
      } else {
        toast.error(result.message, { id: toastId });
      }
    });
  }

  function openAssignModalForSelected() {
    if (selectedIds.length === 0) return;
    const selectedUsers = users.filter((u) => selectedIds.includes(u.id));
    const summary =
      selectedUsers.length === 1
        ? selectedUsers[0]!.name
        : `${selectedUsers[0]!.name} y ${selectedUsers.length - 1} más`;

    setTargetUserForAssign({
      ids: selectedIds,
      summary,
    });
    setAssignModalOpen(true);
  }

  function openAssignModalForSingle(user: StaffDirectoryItem) {
    setTargetUserForAssign({
      ids: [user.id],
      summary: user.name,
    });
    setAssignModalOpen(true);
  }

  function openRemoveModalForSelected() {
    if (selectedIds.length === 0) return;
    const selectedUsers = users.filter((u) => selectedIds.includes(u.id));
    const summary =
      selectedUsers.length === 1
        ? selectedUsers[0]!.name
        : `${selectedUsers[0]!.name} y ${selectedUsers.length - 1} más`;

    setTargetUserForRemove({
      ids: selectedIds,
      summary,
    });
    setRemoveModalOpen(true);
  }

  function handleRemoveCourse(
    userId: string,
    userName: string,
    courseId: string,
    courseTitle: string,
  ) {
    if (
      !confirm(
        `¿Quitar la asignación de "${courseTitle}" a ${userName}?\n\nEsto restablecerá su progreso para que pueda realizar la inducción nuevamente desde cero.`,
      )
    )
      return;

    startTransition(async () => {
      const toastId = toast.loading("Quitando asignación...");
      const result = await removeCourseFromUsersAction({
        userIds: [userId],
        courseId,
      });
      if (result.success) {
        toast.success(result.message, { id: toastId });
        router.refresh();
      } else {
        toast.error(result.message, { id: toastId });
      }
    });
  }

  return (
    <>
      <Card className="shadow-xs" suppressHydrationWarning>
        <CardHeader className="p-4 border-b bg-muted/20" suppressHydrationWarning>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            {/* Buscador interactivo y filtros de estado */}
            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, RUT, cargo o correo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-9 text-xs bg-background"
                />
              </div>

              {/* Selector de estado (Activos / Inactivos / Todos) */}
              <div className="flex items-center rounded-lg border bg-muted/30 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter("ACTIVE")}
                  className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                    statusFilter === "ACTIVE"
                      ? "bg-background shadow-2xs text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Activos ({users.filter((u) => u.isActive).length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("INACTIVE")}
                  className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                    statusFilter === "INACTIVE"
                      ? "bg-background shadow-2xs text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Inactivos ({users.filter((u) => !u.isActive).length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("ALL")}
                  className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                    statusFilter === "ALL"
                      ? "bg-background shadow-2xs text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Todos ({users.length})
                </button>
              </div>

              {/* Filtro por Inducción / Curso específico */}
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <Select
                  value={selectedCourseId}
                  onValueChange={(val) => {
                    setSelectedCourseId(val);
                    if (val === "NO_COURSES") {
                      setCourseStatusFilter("ALL");
                    }
                  }}
                >
                  <SelectTrigger className="h-9 text-xs w-full sm:w-56 bg-background">
                    <BookOpen className="h-3.5 w-3.5 mr-1.5 text-primary shrink-0" />
                    <SelectValue placeholder="Filtrar por curso..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos los cursos</SelectItem>
                    <SelectItem value="NO_COURSES">⚠️ Sin inducciones asignadas</SelectItem>
                    {availableCourses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Filtro por estado del curso (Quiénes lo dieron / Quiénes no) */}
                {selectedCourseId !== "NO_COURSES" && (
                  <Select
                    value={courseStatusFilter}
                    onValueChange={(val) =>
                      setCourseStatusFilter(val as typeof courseStatusFilter)
                    }
                  >
                    <SelectTrigger className="h-9 text-xs w-full sm:w-48 bg-background">
                      <GraduationCap className="h-3.5 w-3.5 mr-1.5 text-primary shrink-0" />
                      <SelectValue placeholder="Estado..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Cualquier estado</SelectItem>
                      <SelectItem value="COMPLETED">
                        ✅ Ya lo dieron (Aprobado)
                      </SelectItem>
                      <SelectItem value="NOT_COMPLETED">
                        ❌ No lo han dado / Pendiente
                      </SelectItem>
                      <SelectItem value="IN_PROGRESS">
                        ⏳ En progreso / Iniciado
                      </SelectItem>
                      {selectedCourseId !== "ALL" && (
                        <SelectItem value="NOT_ASSIGNED">
                          🚫 No tienen este curso asignado
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                )}

                {(selectedCourseId !== "ALL" || courseStatusFilter !== "ALL") && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedCourseId("ALL");
                      setCourseStatusFilter("ALL");
                    }}
                    className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
                    title="Restablecer filtros de cursos"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Limpiar
                  </Button>
                )}
              </div>
            </div>

            {/* Barra de acciones masivas cuando hay seleccionados */}
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
              {selectedIds.length > 0 ? (
                <>
                  <Badge variant="secondary" className="px-2.5 py-1 text-xs">
                    {selectedIds.length} seleccionado(s)
                  </Badge>

                  <Button
                    type="button"
                    size="sm"
                    onClick={openAssignModalForSelected}
                    className="gap-1.5 h-8 text-xs bg-primary hover:bg-primary/90"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Asignar Inducción / Video
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={openRemoveModalForSelected}
                    className="gap-1.5 h-8 text-xs border-amber-500/30 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                    title="Quitar una inducción asignada a los seleccionados y restablecer su avance"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
                    Quitar Asignación
                  </Button>

                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkDelete}
                    disabled={isPending}
                    className="gap-1.5 h-8 text-xs"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedIds([])}
                    className="h-8 text-xs px-2"
                  >
                    Desmarcar
                  </Button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Mostrando: <strong>{filteredUsers.length}</strong> funcionario(s)
                </span>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0" suppressHydrationWarning>
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-10 px-3 text-center">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={handleToggleSelectAll}
                    disabled={filteredUsers.length === 0}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                    title="Seleccionar todos"
                  />
                </TableHead>
                <TableHead className="min-w-[180px]">
                  <SortableHeader label="Funcionario" sortKey="name" sort={sort} onSort={handleSort} />
                </TableHead>
                <TableHead className="w-32">
                  <SortableHeader label="RUT" sortKey="rut" sort={sort} onSort={handleSort} />
                </TableHead>
                <TableHead className="w-28">
                  <SortableHeader label="Fecha ingreso" sortKey="hireDate" sort={sort} onSort={handleSort} />
                </TableHead>
                <TableHead className="min-w-[150px]">Cargo y Área</TableHead>
                <TableHead className="min-w-[240px]">
                  Inducciones y Capacitaciones
                </TableHead>
                <TableHead className="w-24 text-center">Estado</TableHead>
                <TableHead className="w-24 text-right pr-4">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-40 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 py-6 text-muted-foreground">
                      <Users className="h-8 w-8 text-muted-foreground/50" />
                      <p className="text-sm font-medium text-foreground">
                        No se encontraron funcionarios
                      </p>
                      <p className="max-w-md text-xs">
                        {searchTerm
                          ? "Intenta con otro término de búsqueda."
                          : "Puedes sincronizar el personal desde la base de datos institucional o agregar uno nuevo."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => {
                  const isSelected = selectedIds.includes(user.id);
                  return (
                    <TableRow
                      key={user.id}
                      className={`transition-colors ${
                        isSelected ? "bg-primary/5 hover:bg-primary/10" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <TableCell className="px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleRow(user.id)}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                        />
                      </TableCell>

                      {/* Funcionario (Nombre, Correo, Acceso) */}
                      <TableCell>
                        <span className="block font-medium text-foreground">
                          {user.name}
                        </span>
                        <span className="block text-xs text-muted-foreground font-mono">
                          {user.email}
                        </span>
                        {user.corporateEmail && (
                          <span className="block text-[11px] text-muted-foreground">
                            {user.corporateEmail}
                          </span>
                        )}
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Badge variant="outline" className="text-[9px] py-0 px-1">
                            {ROLE_LABELS[user.role] ?? user.role}
                          </Badge>
                          {user.lastLoginAt && (
                            <span suppressHydrationWarning>
                              Último: {formatDateTime(user.lastLoginAt)}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* RUT */}
                      <TableCell className="tabular-nums font-mono text-xs">
                        {formatRut(user.rut)}
                      </TableCell>

                      {/* Fecha de ingreso */}
                      <TableCell className="tabular-nums text-xs">
                        {user.hireDate ? (
                          formatHireDate(user.hireDate)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Cargo y Área */}
                      <TableCell className="text-xs">
                        <span className="block font-medium text-foreground">
                          {user.positionName ?? SIN_ASIGNAR}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {user.areaName ?? "Sin departamento"}
                        </span>
                      </TableCell>

                      {/* Lista de Inducciones / Cursos asignados */}
                      <TableCell className="py-2">
                        <div className="space-y-1.5">
                          {user.courses.length === 0 ? (
                            <span className="text-xs text-muted-foreground italic block">
                              Sin inducciones asignadas
                            </span>
                          ) : (
                            <div className="flex flex-col gap-1 max-h-32 overflow-y-auto pr-1">
                              {user.courses.map((c) => (
                                <div
                                  key={c.courseId}
                                  className="flex items-center justify-between gap-1.5 rounded-md border bg-background/80 px-2 py-1 text-xs shadow-2xs"
                                >
                                  <div className="min-w-0 flex-1">
                                    <span className="font-medium text-foreground truncate block text-[11px]">
                                      {c.courseTitle}
                                    </span>
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                      <Video className="h-3 w-3" />
                                      <span>
                                        {c.watchedLessons}/{c.totalLessons} videos
                                      </span>
                                      {c.finalScore !== null && (
                                        <span className="font-bold text-foreground ml-1">
                                          · Nota: {c.finalScore}%
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="shrink-0 flex items-center gap-1">
                                    {c.status === "COMPLETED" ? (
                                      <Badge
                                        variant="default"
                                        className="h-5 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white gap-0.5 px-1.5"
                                      >
                                        <CheckCircle2 className="h-3 w-3" />
                                        Aprobado
                                      </Badge>
                                    ) : c.status === "IN_PROGRESS" ? (
                                      <Badge
                                        variant="outline"
                                        className="h-5 text-[10px] border-amber-500 text-amber-600 bg-amber-50 gap-0.5 px-1.5"
                                      >
                                        <Clock className="h-3 w-3" />
                                        En curso ({c.progressPercent}%)
                                      </Badge>
                                    ) : c.status === "FAILED" ? (
                                      <Badge
                                        variant="destructive"
                                        className="h-5 text-[10px] gap-0.5 px-1.5"
                                      >
                                        <XCircle className="h-3 w-3" />
                                        Reprobado
                                      </Badge>
                                    ) : (
                                      <Badge
                                        variant="secondary"
                                        className="h-5 text-[10px] gap-0.5 px-1.5"
                                      >
                                        Pendiente
                                      </Badge>
                                    )}

                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        handleRemoveCourse(
                                          user.id,
                                          user.name,
                                          c.courseId,
                                          c.courseTitle,
                                        )
                                      }
                                      disabled={isPending}
                                      title="Quitar asignación y reiniciar progreso para hacerlo de nuevo"
                                      className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-sm"
                                    >
                                      <X className="h-3 w-3" />
                                      <span className="sr-only">Quitar asignación</span>
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Botón rápido para asignar inducción a este funcionario */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openAssignModalForSingle(user)}
                            className="h-6 px-2 text-[11px] text-primary hover:bg-primary/10 gap-1 w-full justify-start font-medium"
                          >
                            <Plus className="h-3 w-3" />
                            Asignar curso / inducción
                          </Button>
                        </div>
                      </TableCell>

                      {/* Estado (Activo / Inactivo) */}
                      <TableCell className="text-center">
                        <Badge
                          variant={user.isActive ? "default" : "secondary"}
                          className={`text-[10px] ${
                            user.isActive
                              ? "bg-emerald-600 text-white"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {user.isActive ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>

                      {/* Acciones por fila */}
                      <TableCell className="text-right pr-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            asChild
                            className="h-7 w-7 p-0"
                            title="Editar usuario"
                          >
                            <Link href={`/admin/funcionarios/${user.id}`}>
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                            </Link>
                          </Button>

                          <UserActiveToggle
                            userId={user.id}
                            isActive={user.isActive}
                            disabled={user.id === currentUserId}
                          />

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isPending || user.id === currentUserId}
                            onClick={() => handleSingleDelete(user)}
                            className="h-7 w-7 p-0 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                            title="Eliminar funcionario"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal de Asignación de Cursos */}
      {targetUserForAssign && (
        <AssignCourseModal
          isOpen={assignModalOpen}
          onClose={() => {
            setAssignModalOpen(false);
            setTargetUserForAssign(null);
          }}
          userIds={targetUserForAssign.ids}
          userNamesSummary={targetUserForAssign.summary}
          courses={availableCourses}
        />
      )}

      {/* Modal para Quitar Asignación / Reiniciar */}
      {targetUserForRemove && (
        <RemoveCourseModal
          isOpen={removeModalOpen}
          onClose={() => {
            setRemoveModalOpen(false);
            setTargetUserForRemove(null);
          }}
          userIds={targetUserForRemove.ids}
          userNamesSummary={targetUserForRemove.summary}
          courses={availableCourses}
        />
      )}
    </>
  );
}

type SortKey = "name" | "rut" | "hireDate";

/** La fecha se guarda como medianoche UTC; se muestra en UTC para no correr el día. */
function formatHireDate(value: Date | string): string {
  return new Date(value).toLocaleDateString("es-CL", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function rutBody(rut: string): number {
  return Number(rut.split("-")[0]?.replace(/\D/g, "")) || 0;
}

/** Ordena por la columna elegida; los funcionarios sin fecha de ingreso van al final. */
function compareStaff(
  a: StaffDirectoryItem,
  b: StaffDirectoryItem,
  key: SortKey,
  dir: "asc" | "desc",
): number {
  const sign = dir === "asc" ? 1 : -1;
  if (key === "hireDate") {
    if (!a.hireDate && !b.hireDate) return a.name.localeCompare(b.name, "es");
    if (!a.hireDate) return 1;
    if (!b.hireDate) return -1;
    return sign * (new Date(a.hireDate).getTime() - new Date(b.hireDate).getTime());
  }
  if (key === "rut") return sign * (rutBody(a.rut) - rutBody(b.rut));
  return sign * a.name.localeCompare(b.name, "es", { sensitivity: "base" });
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 hover:text-foreground ${
        active ? "text-foreground" : ""
      }`}
      title={`Ordenar por ${label.toLowerCase()}`}
    >
      {label}
      <Icon className={`h-3.5 w-3.5 ${active ? "" : "opacity-50"}`} />
    </button>
  );
}
