"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Layers,
  Mail,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatRut } from "@/lib/rut";
import type { ActionResult } from "@/lib/validations/common";
import type { SearchFuncionarioItem } from "@/server/queries/funcionarios";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface AreaUserItem {
  id: string;
  name: string;
  rut: string;
  email: string;
  positionId?: string | null;
  positionName: string | null;
  areaName?: string | null;
}

export interface CatalogItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color?: string | null;
  jefeNombre?: string | null;
  jefeRut?: string | null;
  jefeEmail?: string | null;
  asistenteEmail?: string | null;
  orderIndex: number;
  isActive: boolean;
  /** Cuántos registros dependen del ítem (usuarios/cursos). */
  usage: number;
  usageLabel: string;
  /** Funcionarios pertenecientes a esta área */
  users?: AreaUserItem[];
}

interface CatalogManagerProps {
  title: string;
  description: string;
  items: CatalogItem[];
  institutionId: string;
  /** Lista opcional de funcionarios para autocompletar jefaturas */
  funcionarios?: SearchFuncionarioItem[];
  /** Todos los cargos del colegio (para vincular cargos a un área/jefatura) */
  allPositions?: Array<{ id: string; name: string }>;
  /** Los tipos de curso llevan color; los cargos no. */
  withColor?: boolean;
  /** Si es un área, permite configurar jefatura y asistente para copias */
  isArea?: boolean;
  onCreate: (input: unknown) => Promise<ActionResult<{ id: string; name: string }>>;
  onUpdate: (input: unknown) => Promise<ActionResult>;
  onDelete: (id: string) => Promise<ActionResult>;
}

export interface JefeEntry {
  nombre: string;
  rut: string;
  email: string;
}

const EMPTY_JEFE: JefeEntry = { nombre: "", rut: "", email: "" };

function parseJefeEntries(
  jefeNombre?: string | null,
  jefeRut?: string | null,
  jefeEmail?: string | null,
): JefeEntry[] {
  const nombres = (jefeNombre ?? "").split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  const ruts = (jefeRut ?? "").split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  const emails = (jefeEmail ?? "").split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);

  const maxLen = Math.max(nombres.length, ruts.length, emails.length);
  if (maxLen === 0) return [{ ...EMPTY_JEFE }];

  const list: JefeEntry[] = [];
  for (let i = 0; i < maxLen; i++) {
    list.push({
      nombre: nombres[i] || "",
      rut: ruts[i] || "",
      email: emails[i] || "",
    });
  }
  return list;
}

function serializeJefeEntries(entries: JefeEntry[]) {
  const valid = entries.filter((e) => e.nombre.trim() || e.rut.trim() || e.email.trim());
  return {
    jefeNombre: valid.map((e) => e.nombre.trim()).filter(Boolean).join(", "),
    jefeRut: valid.map((e) => e.rut.trim()).filter(Boolean).join(", "),
    jefeEmail: valid.map((e) => e.email.trim()).filter(Boolean).join(", "),
  };
}

export function CatalogManager({
  title,
  description,
  items,
  institutionId,
  funcionarios = [],
  allPositions = [],
  withColor = false,
  isArea = false,
  onCreate,
  onUpdate,
  onDelete,
}: CatalogManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#0ea5e9");
  
  // Lista de jefes al crear
  const [newJefes, setNewJefes] = useState<JefeEntry[]>([{ ...EMPTY_JEFE }]);
  const [newAsistenteEmail, setNewAsistenteEmail] = useState("");
  const [activeNewJefeIndex, setActiveNewJefeIndex] = useState<number | null>(null);

  // Lista de jefes al editar
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState("#0ea5e9");
  const [draftJefes, setDraftJefes] = useState<JefeEntry[]>([{ ...EMPTY_JEFE }]);
  const [draftAsistenteEmail, setDraftAsistenteEmail] = useState("");
  const [activeDraftJefeIndex, setActiveDraftJefeIndex] = useState<number | null>(null);
  const [expandedAreaIds, setExpandedAreaIds] = useState<string[]>([]);

  // Cargos vinculados al área (para crear y editar)
  const [newPositionIds, setNewPositionIds] = useState<string[]>([]);
  const [draftPositionIds, setDraftPositionIds] = useState<string[]>([]);

  // Filtro por cargo dentro del acordeón expandido de personal (por areaId: cargoName o "TODOS")
  const [cargoFilterByArea, setCargoFilterByArea] = useState<Record<string, string>>({});

  // Búsqueda para el jefe activo en el formulario de creación
  const filteredNewFuncionarios = useMemo(() => {
    if (activeNewJefeIndex === null) return [];
    const query = (newJefes[activeNewJefeIndex]?.nombre || "").toLowerCase().trim();
    if (!query) return [];
    const cleanQuery = query.replace(/[^0-9kK]/g, "");

    return funcionarios
      .filter((f) => {
        const matchesName = f.name.toLowerCase().includes(query);
        const matchesEmail = f.email.toLowerCase().includes(query);
        const matchesRut =
          f.rut.toLowerCase().includes(query) ||
          (cleanQuery && f.rut.replace(/[^0-9kK]/g, "").includes(cleanQuery));
        return matchesName || matchesEmail || matchesRut;
      })
      .slice(0, 8);
  }, [funcionarios, newJefes, activeNewJefeIndex]);

  // Búsqueda para el jefe activo en el formulario de edición
  const filteredDraftFuncionarios = useMemo(() => {
    if (activeDraftJefeIndex === null) return [];
    const query = (draftJefes[activeDraftJefeIndex]?.nombre || "").toLowerCase().trim();
    if (!query) return [];
    const cleanQuery = query.replace(/[^0-9kK]/g, "");

    return funcionarios
      .filter((f) => {
        const matchesName = f.name.toLowerCase().includes(query);
        const matchesEmail = f.email.toLowerCase().includes(query);
        const matchesRut =
          f.rut.toLowerCase().includes(query) ||
          (cleanQuery && f.rut.replace(/[^0-9kK]/g, "").includes(cleanQuery));
        return matchesName || matchesEmail || matchesRut;
      })
      .slice(0, 8);
  }, [funcionarios, draftJefes, activeDraftJefeIndex]);

  function handleSelectNewJefe(index: number, f: SearchFuncionarioItem) {
    setNewJefes((prev) => {
      const next = [...prev];
      next[index] = {
        nombre: f.name,
        rut: formatRut(f.rut),
        email: f.email || f.corporateEmail || "",
      };
      return next;
    });
    if (f.asistenteEmail && !newAsistenteEmail) {
      setNewAsistenteEmail(f.asistenteEmail);
    }
    setActiveNewJefeIndex(null);
    toast.success(`Datos de ${f.name} cargados`);
  }

  function handleSelectDraftJefe(index: number, f: SearchFuncionarioItem) {
    setDraftJefes((prev) => {
      const next = [...prev];
      next[index] = {
        nombre: f.name,
        rut: formatRut(f.rut),
        email: f.email || f.corporateEmail || "",
      };
      return next;
    });
    if (f.asistenteEmail && !draftAsistenteEmail) {
      setDraftAsistenteEmail(f.asistenteEmail);
    }
    setActiveDraftJefeIndex(null);
    toast.success(`Datos de ${f.name} cargados`);
  }

  function run(action: () => Promise<ActionResult<unknown>>, onDone?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        toast.success(result.message ?? "Listo");
        onDone?.();
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const serialized = serializeJefeEntries(newJefes);
    run(
      () =>
        onCreate({
          institutionId,
          name,
          orderIndex: items.length,
          isActive: true,
          ...(withColor ? { color: newColor } : {}),
          ...(isArea
            ? {
                jefeNombre: serialized.jefeNombre || undefined,
                jefeRut: serialized.jefeRut || undefined,
                jefeEmail: serialized.jefeEmail || undefined,
                asistenteEmail: newAsistenteEmail.trim() || undefined,
                positionIds: newPositionIds.length > 0 ? newPositionIds : undefined,
              }
            : {}),
        }),
      () => {
        setNewName("");
        setNewColor("#0ea5e9");
        setNewJefes([{ ...EMPTY_JEFE }]);
        setNewAsistenteEmail("");
        setNewPositionIds([]);
        setActiveNewJefeIndex(null);
        setShowAdvancedCreate(false);
      },
    );
  }

  function startEdit(item: CatalogItem) {
    setEditingId(item.id);
    setDraftName(item.name);
    setDraftColor(item.color ?? "#0ea5e9");
    setDraftJefes(parseJefeEntries(item.jefeNombre, item.jefeRut, item.jefeEmail));
    setDraftAsistenteEmail(item.asistenteEmail ?? "");
    setActiveDraftJefeIndex(null);

    // Inicializar los cargos vinculados al área a partir de los funcionarios actuales del área
    const currentCargoIds = Array.from(
      new Set(
        (item.users ?? [])
          .map((u) => u.positionId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    setDraftPositionIds(currentCargoIds);
  }

  function handleSaveEdit(item: CatalogItem) {
    const name = draftName.trim();
    if (!name) return;
    const serialized = serializeJefeEntries(draftJefes);
    run(
      () =>
        onUpdate({
          id: item.id,
          name,
          ...(withColor ? { color: draftColor } : {}),
          ...(isArea
            ? {
                jefeNombre: serialized.jefeNombre || "",
                jefeRut: serialized.jefeRut || "",
                jefeEmail: serialized.jefeEmail || "",
                asistenteEmail: draftAsistenteEmail.trim() || "",
                positionIds: draftPositionIds,
              }
            : {}),
        }),
      () => {
        setEditingId(null);
        setActiveDraftJefeIndex(null);
        setDraftPositionIds([]);
      },
    );
  }

  return (
    <Card suppressHydrationWarning>
      <CardHeader suppressHydrationWarning>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4" suppressHydrationWarning>
        {/* -------------------------- alta -------------------------- */}
        <div className="space-y-3 rounded-md border bg-muted/40 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[180px] flex-1 space-y-1">
              <Label htmlFor={`new-${title}`} className="text-xs">
                Nuevo {title.toLowerCase().slice(0, -1) || "elemento"}
              </Label>
              <Input
                id={`new-${title}`}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !isArea) {
                    event.preventDefault();
                    handleCreate();
                  }
                }}
                placeholder="Nombre"
              />
            </div>

            {withColor && (
              <div className="space-y-1">
                <Label htmlFor={`color-${title}`} className="text-xs">
                  Color
                </Label>
                <Input
                  id={`color-${title}`}
                  type="color"
                  value={newColor}
                  onChange={(event) => setNewColor(event.target.value)}
                  className="h-10 w-16 p-1"
                />
              </div>
            )}

            {isArea && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAdvancedCreate((v) => !v)}
                className="gap-1 text-xs"
              >
                <UserCheck className="h-3.5 w-3.5" />
                Jefatura
                {showAdvancedCreate ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            )}

            <Button
              type="button"
              onClick={handleCreate}
              disabled={isPending || !newName.trim()}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Agregar
            </Button>
          </div>

          {isArea && showAdvancedCreate && (
            <div className="space-y-3 border-t pt-3 text-xs">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                    <UserCheck className="h-3.5 w-3.5 text-primary" />
                    Jefatura(s) a Cargo ({newJefes.length})
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setNewJefes((prev) => [...prev, { ...EMPTY_JEFE }])}
                    className="h-7 gap-1 text-[11px] text-primary border-primary/30 hover:bg-primary/5"
                  >
                    <Plus className="h-3 w-3" />
                    Agregar otro jefe
                  </Button>
                </div>

                {newJefes.map((jefe, idx) => (
                  <div
                    key={idx}
                    className="relative rounded-md border bg-background/60 p-2.5 shadow-sm space-y-2"
                  >
                    <div className="flex items-center justify-between border-b pb-1">
                      <span className="font-medium text-[11px] text-muted-foreground">
                        Jefe #{idx + 1}
                      </span>
                      {newJefes.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setNewJefes((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="h-5 px-1.5 text-[10px] text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Quitar
                        </Button>
                      )}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="relative">
                        <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Search className="h-3 w-3 text-primary" />
                          Buscar Funcionario / Nombre
                        </Label>
                        <div className="relative mt-1">
                          <Input
                            value={jefe.nombre}
                            onChange={(e) => {
                              const val = e.target.value;
                              setNewJefes((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx]!, nombre: val };
                                return next;
                              });
                              setActiveNewJefeIndex(idx);
                            }}
                            onFocus={() => setActiveNewJefeIndex(idx)}
                            placeholder="Buscar o escribir nombre..."
                            className="h-8 text-xs pr-6"
                          />
                          {jefe.nombre && (
                            <button
                              type="button"
                              onClick={() => {
                                setNewJefes((prev) => {
                                  const next = [...prev];
                                  next[idx] = { ...EMPTY_JEFE };
                                  return next;
                                });
                              }}
                              className="absolute right-1.5 top-2 text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {activeNewJefeIndex === idx && filteredNewFuncionarios.length > 0 && (
                          <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 shadow-lg">
                            {filteredNewFuncionarios.map((f) => (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() => handleSelectNewJefe(idx, f)}
                                className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                              >
                                <div>
                                  <span className="font-medium text-foreground">{f.name}</span>
                                  <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                                    {formatRut(f.rut)}
                                  </span>
                                  <span className="block text-[10px] text-muted-foreground">
                                    {f.positionName ?? "Sin cargo"} · {f.email || f.corporateEmail || "Sin correo"}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <Label className="text-[11px] text-muted-foreground">RUT del Jefe</Label>
                        <Input
                          value={jefe.rut}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNewJefes((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx]!, rut: val };
                              return next;
                            });
                          }}
                          placeholder="12345678-9"
                          className="h-8 text-xs mt-1"
                        />
                      </div>

                      <div>
                        <Label className="text-[11px] text-muted-foreground">Correo del Jefe</Label>
                        <Input
                          value={jefe.email}
                          type="email"
                          onChange={(e) => {
                            const val = e.target.value;
                            setNewJefes((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx]!, email: val };
                              return next;
                            });
                          }}
                          placeholder="jefe@colegio.cl"
                          className="h-8 text-xs mt-1"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <Label className="text-[11px] text-muted-foreground">Correo Asistente / Secretaría (Copia CC)</Label>
                <Input
                  value={newAsistenteEmail}
                  type="email"
                  onChange={(e) => setNewAsistenteEmail(e.target.value)}
                  placeholder="asistente@colegio.cl"
                  className="h-8 text-xs mt-1 max-w-sm"
                />
              </div>

              {allPositions.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                        <Briefcase className="h-3.5 w-3.5 text-primary" />
                        Cargos asignados a esta jefatura ({newPositionIds.length})
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Los funcionarios con los cargos seleccionados pertenecerán automáticamente a esta área/jefatura.
                      </p>
                    </div>
                    {newPositionIds.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setNewPositionIds([])}
                        className="h-6 text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        Limpiar selección
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {allPositions.map((pos) => {
                      const isSelected = newPositionIds.includes(pos.id);
                      return (
                        <button
                          type="button"
                          key={pos.id}
                          onClick={() => {
                            setNewPositionIds((prev) =>
                              isSelected ? prev.filter((id) => id !== pos.id) : [...prev, pos.id],
                            );
                          }}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-all cursor-pointer",
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary shadow-xs"
                              : "bg-background text-muted-foreground border-border/80 hover:border-primary/50 hover:text-foreground",
                          )}
                        >
                          <Briefcase className={cn("h-3 w-3", isSelected ? "text-primary-foreground" : "text-muted-foreground")} />
                          <span>{pos.name}</span>
                          {isSelected && <Check className="h-3 w-3 ml-0.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ------------------------- listado ------------------------- */}
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Todavía no hay elementos.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {items.map((item) => {
              const isEditing = editingId === item.id;
              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 p-3 transition-colors hover:bg-muted/10"
                >
                  {isEditing ? (
                    <div className="space-y-3 rounded-md bg-muted/30 p-2.5">
                      <div className="flex items-center gap-2">
                        {withColor && (
                          <Input
                            type="color"
                            value={draftColor}
                            onChange={(event) => setDraftColor(event.target.value)}
                            className="h-9 w-14 shrink-0 p-1"
                            aria-label="Color"
                          />
                        )}
                        <Input
                          value={draftName}
                          onChange={(event) => setDraftName(event.target.value)}
                          className="min-w-[160px] flex-1"
                          autoFocus
                          aria-label="Nombre"
                        />
                        <Button
                          size="sm"
                          onClick={() => handleSaveEdit(item)}
                          disabled={isPending}
                        >
                          <Check className="h-4 w-4" aria-hidden />
                          Guardar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(null);
                            setActiveDraftJefeIndex(null);
                          }}
                        >
                          <X className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>

                      {isArea && (
                        <div className="space-y-3 border-t pt-3 text-xs">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                                <UserCheck className="h-3.5 w-3.5 text-primary" />
                                Jefatura(s) a Cargo ({draftJefes.length})
                              </Label>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setDraftJefes((prev) => [...prev, { ...EMPTY_JEFE }])}
                                className="h-7 gap-1 text-[11px] text-primary border-primary/30 hover:bg-primary/5"
                              >
                                <Plus className="h-3 w-3" />
                                Agregar otro jefe
                              </Button>
                            </div>

                            {draftJefes.map((jefe, idx) => (
                              <div
                                key={idx}
                                className="relative rounded-md border bg-background/60 p-2.5 shadow-sm space-y-2"
                              >
                                <div className="flex items-center justify-between border-b pb-1">
                                  <span className="font-medium text-[11px] text-muted-foreground">
                                    Jefe #{idx + 1}
                                  </span>
                                  {draftJefes.length > 1 && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        setDraftJefes((prev) => prev.filter((_, i) => i !== idx))
                                      }
                                      className="h-5 px-1.5 text-[10px] text-destructive hover:bg-destructive/10"
                                    >
                                      <Trash2 className="h-3 w-3 mr-1" />
                                      Quitar
                                    </Button>
                                  )}
                                </div>

                                <div className="grid gap-2 sm:grid-cols-3">
                                  <div className="relative">
                                    <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                                      <Search className="h-3 w-3 text-primary" />
                                      Buscar Funcionario / Nombre
                                    </Label>
                                    <div className="relative mt-1">
                                      <Input
                                        value={jefe.nombre}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setDraftJefes((prev) => {
                                            const next = [...prev];
                                            next[idx] = { ...next[idx]!, nombre: val };
                                            return next;
                                          });
                                          setActiveDraftJefeIndex(idx);
                                        }}
                                        onFocus={() => setActiveDraftJefeIndex(idx)}
                                        placeholder="Buscar o escribir nombre..."
                                        className="h-8 text-xs pr-6"
                                      />
                                      {jefe.nombre && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setDraftJefes((prev) => {
                                              const next = [...prev];
                                              next[idx] = { ...EMPTY_JEFE };
                                              return next;
                                            });
                                          }}
                                          className="absolute right-1.5 top-2 text-muted-foreground hover:text-foreground"
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </div>

                                    {activeDraftJefeIndex === idx && filteredDraftFuncionarios.length > 0 && (
                                      <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 shadow-lg">
                                        {filteredDraftFuncionarios.map((f) => (
                                          <button
                                            key={f.id}
                                            type="button"
                                            onClick={() => handleSelectDraftJefe(idx, f)}
                                            className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                                          >
                                            <div>
                                              <span className="font-medium text-foreground">{f.name}</span>
                                              <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                                                {formatRut(f.rut)}
                                              </span>
                                              <span className="block text-[10px] text-muted-foreground">
                                                {f.positionName ?? "Sin cargo"} · {f.email || f.corporateEmail || "Sin correo"}
                                              </span>
                                            </div>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  <div>
                                    <Label className="text-[11px] text-muted-foreground">RUT del Jefe</Label>
                                    <Input
                                      value={jefe.rut}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setDraftJefes((prev) => {
                                          const next = [...prev];
                                          next[idx] = { ...next[idx]!, rut: val };
                                          return next;
                                        });
                                      }}
                                      placeholder="12345678-9"
                                      className="h-8 text-xs mt-1"
                                    />
                                  </div>

                                  <div>
                                    <Label className="text-[11px] text-muted-foreground">Correo del Jefe</Label>
                                    <Input
                                      value={jefe.email}
                                      type="email"
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setDraftJefes((prev) => {
                                          const next = [...prev];
                                          next[idx] = { ...next[idx]!, email: val };
                                          return next;
                                        });
                                      }}
                                      placeholder="jefe@colegio.cl"
                                      className="h-8 text-xs mt-1"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div>
                            <Label className="text-[11px] text-muted-foreground">Correo Asistente / Secretaría (Copia CC)</Label>
                            <Input
                              value={draftAsistenteEmail}
                              type="email"
                              onChange={(e) => setDraftAsistenteEmail(e.target.value)}
                              placeholder="asistente@colegio.cl"
                              className="h-8 text-xs mt-1 max-w-sm"
                            />
                          </div>

                          {allPositions.length > 0 && (
                            <div className="space-y-2 border-t pt-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                                    <Briefcase className="h-3.5 w-3.5 text-primary" />
                                    Cargos asignados a esta jefatura ({draftPositionIds.length})
                                  </Label>
                                  <p className="text-[11px] text-muted-foreground">
                                    Los funcionarios con los cargos marcados quedarán asociados a esta jefatura.
                                  </p>
                                </div>
                                {draftPositionIds.length > 0 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDraftPositionIds([])}
                                    className="h-6 text-[10px] text-muted-foreground hover:text-foreground"
                                  >
                                    Desmarcar todos
                                  </Button>
                                )}
                              </div>

                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {allPositions.map((pos) => {
                                  const isSelected = draftPositionIds.includes(pos.id);
                                  return (
                                    <button
                                      type="button"
                                      key={pos.id}
                                      onClick={() => {
                                        setDraftPositionIds((prev) =>
                                          isSelected ? prev.filter((id) => id !== pos.id) : [...prev, pos.id],
                                        );
                                      }}
                                      className={cn(
                                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-all cursor-pointer",
                                        isSelected
                                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                                          : "bg-background text-muted-foreground border-border/80 hover:border-primary/50 hover:text-foreground",
                                      )}
                                    >
                                      <Briefcase className={cn("h-3 w-3", isSelected ? "text-primary-foreground" : "text-muted-foreground")} />
                                      <span>{pos.name}</span>
                                      {isSelected && <Check className="h-3 w-3 ml-0.5" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      {withColor && (
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border"
                          style={{ backgroundColor: item.color ?? "transparent" }}
                          aria-hidden
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block font-medium",
                            !item.isActive && "text-muted-foreground line-through",
                          )}
                        >
                          {item.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {item.usage > 0
                            ? `${item.usage} ${item.usageLabel}`
                            : "Sin uso"}
                        </span>
                        {isArea && (item.jefeNombre || item.jefeEmail) && (
                          <div className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
                            <div className="flex flex-wrap items-center gap-2">
                              {parseJefeEntries(item.jefeNombre, item.jefeRut, item.jefeEmail)
                                .filter((j) => j.nombre || j.email)
                                .map((j, jIdx) => (
                                  <span
                                    key={jIdx}
                                    className="inline-flex items-center gap-1.5 rounded bg-muted/60 px-2 py-0.5 font-medium text-foreground border border-border/50"
                                  >
                                    <UserCheck className="h-3 w-3 text-primary" />
                                    <span>
                                      {j.nombre || "Jefe sin nombre"}
                                      {j.rut ? ` (${j.rut})` : ""}
                                    </span>
                                    {j.email && (
                                      <span className="text-primary font-mono text-[10px]">
                                        · {j.email}
                                      </span>
                                    )}
                                  </span>
                                ))}
                            </div>
                            {item.asistenteEmail && (
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                <span>CC Asistente: {item.asistenteEmail}</span>
                              </div>
                            )}
                          </div>
                        )}
                        {isArea && (!item.jefeNombre || item.jefeNombre.trim() === "") && (
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 font-medium border border-amber-500/30">
                              ⚠️ Sin jefatura registrada
                            </span>
                          </div>
                        )}

                        {/* Visualización de Cargos asociados al Área / Jefatura */}
                        {isArea && Boolean(item.users && item.users.length > 0) && (() => {
                          const cargoCounts: Record<string, number> = {};
                          for (const u of item.users!) {
                            const cName = u.positionName || "Sin cargo asignado";
                            cargoCounts[cName] = (cargoCounts[cName] || 0) + 1;
                          }
                          const cargoList = Object.entries(cargoCounts);

                          return (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 mr-1">
                                <Briefcase className="h-3 w-3 text-primary" />
                                Cargos a cargo ({cargoList.length}):
                              </span>
                              {cargoList.map(([cargo, count]) => (
                                <Badge
                                  key={cargo}
                                  variant="secondary"
                                  className="text-[11px] font-normal px-2 py-0.5 h-5 bg-background border border-border/80 text-foreground"
                                >
                                  {cargo}
                                  <span className="ml-1 text-[10px] font-semibold text-primary">
                                    ({count})
                                  </span>
                                </Badge>
                              ))}
                            </div>
                          );
                        })()}
                      </span>

                      {!item.isActive && (
                        <Badge variant="secondary">Inactivo</Badge>
                      )}

                      {Boolean(item.users && item.users.length > 0) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setExpandedAreaIds((prev) =>
                              prev.includes(item.id)
                                ? prev.filter((id) => id !== item.id)
                                : [...prev, item.id],
                            )
                          }
                          className="gap-1.5 text-xs h-8 border-primary/20 hover:bg-primary/5 text-primary font-medium"
                          title="Ver funcionarios con este cargo o departamento"
                        >
                          <Users className="h-3.5 w-3.5" />
                          <span>
                            {expandedAreaIds.includes(item.id)
                              ? "Ocultar Personal"
                              : `Ver Personal (${item.users?.length ?? item.usage})`}
                          </span>
                          {expandedAreaIds.includes(item.id) ? (
                            <ChevronUp className="h-3.5 w-3.5 ml-0.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 ml-0.5" />
                          )}
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          run(() =>
                            onUpdate({ id: item.id, isActive: !item.isActive }),
                          )
                        }
                        disabled={isPending}
                        title={
                          item.isActive
                            ? "Ocultar de los formularios"
                            : "Volver a mostrar"
                        }
                      >
                        {item.isActive ? "Desactivar" : "Activar"}
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEdit(item)}
                        aria-label={`Editar ${item.name}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => run(() => onDelete(item.id))}
                        disabled={isPending}
                        aria-label={`Eliminar ${item.name}`}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  )}

                  {/* Detalle expandible del personal (Área o Cargo) */}
                  {!isEditing && expandedAreaIds.includes(item.id) && Boolean(item.users && item.users.length > 0) && (() => {
                    const activeFilter = cargoFilterByArea[item.id] || "TODOS";
                    const filteredUsers = item.users!.filter((u) => {
                      if (activeFilter === "TODOS") return true;
                      return (u.positionName || "Sin cargo asignado") === activeFilter;
                    });

                    // Grupos únicos para los filtros rápidos de cargos
                    const cargoGroupMap: Record<string, number> = {};
                    for (const u of item.users!) {
                      const cName = u.positionName || "Sin cargo asignado";
                      cargoGroupMap[cName] = (cargoGroupMap[cName] || 0) + 1;
                    }
                    const cargoGroups = Object.entries(cargoGroupMap);

                    return (
                      <div className="mt-2 rounded-lg border bg-muted/20 p-3.5 space-y-3 text-xs animate-in fade-in-50 duration-150">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                          <span className="font-semibold text-foreground flex items-center gap-1.5">
                            <Users className="h-4 w-4 text-primary" />
                            {isArea ? "Personal a cargo" : "Funcionarios con este cargo"} ({item.users?.length ?? 0} funcionarios)
                          </span>
                          {isArea && item.jefeNombre && (
                            <span className="text-muted-foreground text-[11px]">
                              Jefe responsable: <strong className="text-foreground">{item.jefeNombre}</strong>
                            </span>
                          )}
                        </div>

                        {/* Pestañas de filtrado rápido por Cargo si es un Área y hay varios cargos */}
                        {isArea && cargoGroups.length > 1 && (
                          <div className="flex flex-wrap items-center gap-1.5 bg-background/50 p-1.5 rounded-md border">
                            <span className="text-[11px] font-medium text-muted-foreground mr-1">
                              Filtrar por grupo:
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setCargoFilterByArea((prev) => ({
                                  ...prev,
                                  [item.id]: "TODOS",
                                }))
                              }
                              className={cn(
                                "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                                activeFilter === "TODOS"
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                              )}
                            >
                              Todos ({item.users!.length})
                            </button>
                            {cargoGroups.map(([cargo, count]) => (
                              <button
                                type="button"
                                key={cargo}
                                onClick={() =>
                                  setCargoFilterByArea((prev) => ({
                                    ...prev,
                                    [item.id]: cargo,
                                  }))
                                }
                                className={cn(
                                  "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                                  activeFilter === cargo
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                )}
                              >
                                {cargo} ({count})
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="grid gap-2 sm:grid-cols-2">
                          {filteredUsers.map((user) => (
                            <div
                              key={user.id}
                              className="flex items-start justify-between rounded-md border bg-background p-2.5 shadow-xs hover:border-primary/40 transition-colors"
                            >
                              <div className="space-y-0.5 min-w-0 flex-1">
                                <span className="block font-medium text-foreground truncate">
                                  {user.name}
                                </span>
                                <span className="block text-[11px] text-muted-foreground font-mono">
                                  {formatRut(user.rut)} · {isArea ? (user.positionName ?? "Sin cargo") : (user.areaName ?? "Sin departamento")}
                                </span>
                                <span className="block text-[10px] text-muted-foreground truncate">
                                  {user.email}
                                </span>
                              </div>

                              <Button asChild size="sm" variant="ghost" className="h-6 text-[11px] px-1.5 ml-2 text-primary hover:text-primary">
                                <a href={`/admin/funcionarios?q=${encodeURIComponent(user.rut)}`} target="_blank" rel="noopener noreferrer" title="Ver en directorio">
                                  Ver →
                                </a>
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          Los elementos en uso no se pueden eliminar: desactívalos para que dejen
          de aparecer en los formularios sin perder los registros históricos.
        </p>
      </CardContent>
    </Card>
  );
}
