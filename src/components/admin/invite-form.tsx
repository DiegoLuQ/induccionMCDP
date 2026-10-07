"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import {
  Briefcase,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  Mail,
  Plus,
  Search,
  Send,
  Trash2,
  Upload,
  User,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  MAX_INVITATION_TTL_HOURS,
  MIN_INVITATION_TTL_HOURS,
} from "@/lib/constants";
import { formatRut } from "@/lib/rut";
import { slugify } from "@/lib/utils";
import {
  createInvitationsSchema,
  parseBulkPaste,
  type CreateInvitationsInput,
} from "@/lib/validations/invitation";
import { createInvitationsAction } from "@/server/actions/invitation-actions";
import type { SearchFuncionarioItem } from "@/server/queries/funcionarios";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface CourseOption {
  id: string;
  title: string;
}

export interface PositionOption {
  id: string;
  name: string;
  slug: string;
}

export interface AreaOption {
  id: string;
  name: string;
  jefeNombre: string | null;
  jefeRut: string | null;
  jefeEmail: string | null;
  asistenteEmail: string | null;
  users?: Array<{ id: string; positionId: string | null }>;
}

const NO_POSITION = "__sin_cargo__";

const EMPTY_INVITEE = {
  userId: "",
  rut: "",
  name: "",
  email: "",
  positionId: "",
  areaId: "",
  sendToJefe: true,
  jefeNombre: "",
  jefeEmail: "",
  ccAsistente: true,
  asistenteEmail: "",
  ccFuncionario: false,
  customCcEmails: "",
};

export function InviteForm({
  courses,
  institutionDomain,
  positions,
  areas = [],
  funcionarios = [],
}: {
  courses: CourseOption[];
  institutionDomain: string;
  positions: PositionOption[];
  areas?: AreaOption[];
  funcionarios?: SearchFuncionarioItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [linksByEmail, setLinksByEmail] = useState<
    Record<string, { link: string; pin?: string | null }>
  >({});
  const [generatedLinks, setGeneratedLinks] = useState<
    Array<{ email: string; name?: string; link: string; pin?: string | null }>
  >([]);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateInvitationsInput>({
    resolver: zodResolver(createInvitationsSchema),
    defaultValues: {
      courseId: courses[0]?.id ?? "",
      requiresPin: true, // Siempre con PIN (obligatorio)
      expiresInHours: MIN_INVITATION_TTL_HOURS, // Por defecto 24h
      invitees: [],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "invitees",
  });

  const courseId = watch("courseId");
  const expiresInHours = watch("expiresInHours");

  // Filtrado reactivo de funcionarios para la barra de búsqueda
  const filteredFuncionarios = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const query = searchTerm.toLowerCase().trim();
    const cleanQuery = query.replace(/[^0-9kK]/g, "");

    return funcionarios
      .filter((f) => {
        const matchesName = f.name.toLowerCase().includes(query);
        const matchesEmail = f.email.toLowerCase().includes(query);
        const matchesRut = f.rut.toLowerCase().includes(query) || (cleanQuery && f.rut.replace(/[^0-9kK]/g, "").includes(cleanQuery));
        return matchesName || matchesEmail || matchesRut;
      })
      .slice(0, 8);
  }, [funcionarios, searchTerm]);

  // Agrupar funcionarios nuevos sin inducciones asignadas por cargo
  const groupedUnassignedByCargo = useMemo(() => {
    const unassigned = funcionarios.filter((f) => f.coursesCount === 0);
    const map = new Map<string, { positionName: string; staff: SearchFuncionarioItem[] }>();

    for (const f of unassigned) {
      const posName = f.positionName || "Sin Cargo Asignado";
      if (!map.has(posName)) {
        map.set(posName, { positionName: posName, staff: [] });
      }
      map.get(posName)!.staff.push(f);
    }

    // Ordenar por nombre del cargo
    return Array.from(map.values()).sort((a, b) =>
      a.positionName.localeCompare(b.positionName),
    );
  }, [funcionarios]);

  const totalUnassigned = useMemo(() => {
    return groupedUnassignedByCargo.reduce((acc, g) => acc + g.staff.length, 0);
  }, [groupedUnassignedByCargo]);

  const [expandedCargoNames, setExpandedCargoNames] = useState<string[]>([]);

  function toggleExpandCargo(cargoName: string) {
    setExpandedCargoNames((prev) =>
      prev.includes(cargoName)
        ? prev.filter((name) => name !== cargoName)
        : [...prev, cargoName],
    );
  }

  function getJefaturaForStaff(
    areaId?: string | null,
    positionId?: string | null,
    fallbackJefeNombre?: string | null,
    fallbackJefeEmail?: string | null,
    fallbackAsistenteEmail?: string | null,
  ) {
    // 1. Buscar el área directa por areaId
    let foundArea = areas.find((a) => a.id === areaId);

    // 2. Si no tiene área directa o no tiene jefeEmail pero tiene cargo, buscar el área que tiene asignado este cargo
    if ((!foundArea || !foundArea.jefeEmail) && positionId) {
      const areaByPos = areas.find((a) =>
        a.users?.some((u) => u.positionId === positionId),
      );
      if (areaByPos) {
        foundArea = areaByPos;
      }
    }

    const jefeNombre = foundArea?.jefeNombre || fallbackJefeNombre || "";
    const jefeEmail = foundArea?.jefeEmail || fallbackJefeEmail || "";
    const asistenteEmail = foundArea?.asistenteEmail || fallbackAsistenteEmail || "";
    const resolvedAreaId = foundArea?.id || areaId || "";

    return {
      areaId: resolvedAreaId,
      jefeNombre,
      jefeEmail,
      asistenteEmail,
      hasJefe: Boolean(jefeEmail),
      hasAsistente: Boolean(asistenteEmail),
    };
  }

  function handleSelectFuncionario(f: SearchFuncionarioItem) {
    const existingIndex = fields.findIndex((field) => field.rut === f.rut);
    if (existingIndex !== -1) {
      toast.info(`${f.name} ya está en la lista de destinatarios.`);
      setSearchTerm("");
      setShowSearchDropdown(false);
      return;
    }

    const info = getJefaturaForStaff(
      f.areaId,
      f.positionId,
      f.jefeNombre,
      f.jefeEmail,
      f.asistenteEmail,
    );

    append({
      userId: f.id,
      rut: f.rut,
      name: f.name,
      email: f.email,
      positionId: f.positionId ?? "",
      areaId: info.areaId,
      sendToJefe: info.hasJefe,
      jefeNombre: info.jefeNombre,
      jefeEmail: info.jefeEmail,
      ccAsistente: info.hasAsistente,
      asistenteEmail: info.asistenteEmail,
      ccFuncionario: false,
      customCcEmails: "",
    });

    setSearchTerm("");
    setShowSearchDropdown(false);
    toast.success(`Se agregó a ${f.name}`);
  }

  function handleAddMultipleFuncionarios(staffList: SearchFuncionarioItem[]) {
    let addedCount = 0;
    const currentRuts = new Set(fields.map((field) => field.rut));

    for (const f of staffList) {
      if (!currentRuts.has(f.rut)) {
        const info = getJefaturaForStaff(
          f.areaId,
          f.positionId,
          f.jefeNombre,
          f.jefeEmail,
          f.asistenteEmail,
        );

        append({
          userId: f.id,
          rut: f.rut,
          name: f.name,
          email: f.email,
          positionId: f.positionId ?? "",
          areaId: info.areaId,
          sendToJefe: info.hasJefe,
          jefeNombre: info.jefeNombre,
          jefeEmail: info.jefeEmail,
          ccAsistente: info.hasAsistente,
          asistenteEmail: info.asistenteEmail,
          ccFuncionario: false,
          customCcEmails: "",
        });
        currentRuts.add(f.rut);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      toast.success(`${addedCount} funcionario(s) agregado(s) a la lista.`);
    } else {
      toast.info("Todos los funcionarios de este grupo ya están en la lista.");
    }
  }

  function handleBulkImport() {
    const bySlug = new Map(positions.map((p) => [p.slug, p.id]));
    positions.forEach((p) => bySlug.set(slugify(p.name), p.id));

    const { rows } = parseBulkPaste(bulkText, bySlug);
    const valid = rows.filter((row) => !row.error);
    const invalid = rows.filter((row) => row.error);

    if (valid.length === 0) {
      toast.error("Ninguna línea pudo interpretarse. Formato: RUT;Nombre;Correo;CARGO");
      return;
    }

    replace(
      valid.map((row) => ({
        rut: row.rut!,
        name: row.name!,
        email: row.email!,
        positionId: row.positionId ?? "",
        areaId: "",
        sendToJefe: false,
        jefeNombre: "",
        jefeEmail: "",
        ccAsistente: false,
        asistenteEmail: "",
        ccFuncionario: false,
        customCcEmails: "",
      })),
    );
    setShowBulk(false);
    setBulkText("");
    toast.success(
      `${valid.length} funcionario(s) cargados.` +
        (invalid.length ? ` ${invalid.length} línea(s) con errores.` : ""),
    );
  }

  function onSubmit(values: CreateInvitationsInput) {
    if (values.invitees.length === 0) {
      toast.error("Debes agregar al menos un funcionario a la lista.");
      return;
    }

    startTransition(async () => {
      const result = await createInvitationsAction(values);

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      const data = result.data!;
      toast.success(result.message ?? `${data.sent} invitación(es) emitidas con éxito.`);

      if (data.previewLinks && data.previewLinks.length > 0) {
        setGeneratedLinks(data.previewLinks);
        // Si se emitió 1 invitación, copiar automáticamente al portapapeles para máxima rapidez
        if (data.previewLinks.length === 1 && data.previewLinks[0]) {
          navigator.clipboard.writeText(data.previewLinks[0].link);
          toast.success("¡Enlace copiado al portapapeles listo para enviar!", {
            duration: 4000,
          });
        }
      }

      data.errors.forEach((error) =>
        toast.error(`${error.email}: ${error.reason}`),
      );

      reset({
        courseId: values.courseId,
        requiresPin: values.requiresPin,
        expiresInHours: values.expiresInHours,
        invitees: [],
      });
      router.refresh();
    });
  }

  if (courses.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Primero debes crear y publicar al menos una inducción para poder
          invitar funcionarios.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/10 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5 text-primary" />
          Distribuir Inducción a Funcionarios
        </CardTitle>
        <CardDescription>
          Busca funcionarios por RUT o nombre, configura el envío a sus jefaturas de área con copias correspondientes y genera enlaces con vigencia de 24 a 48 horas.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {generatedLinks.length > 0 && (
          <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-50/50 p-4 dark:bg-emerald-950/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
                <Check className="h-4 w-4" />
                <span>Enlaces de Inducción Emitidos ({generatedLinks.length})</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setGeneratedLinks([])}
                className="text-xs text-muted-foreground hover:text-foreground h-7"
              >
                Ocultar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Puedes copiar los enlaces directamente para enviarlos por WhatsApp, Teams o el medio que prefieras:
            </p>
            <div className="space-y-2">
              {generatedLinks.map((item, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2.5 text-xs shadow-sm"
                >
                  <div>
                    <span className="font-semibold text-foreground">
                      {item.name || item.email}
                    </span>
                    <span className="ml-2 text-muted-foreground">({item.email})</span>
                    {item.pin && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        PIN: {item.pin}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(item.link);
                        toast.success(`Enlace copiado para ${item.name || item.email}`);
                      }}
                      className="gap-1.5 h-7 text-xs"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copiar Enlace
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      asChild
                      className="h-7 text-xs"
                    >
                      <a href={item.link} target="_blank" rel="noopener noreferrer" title="Abrir enlace">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
          {/* Fila superior: Inducción, Vigencia y PIN Switch */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="courseId" className="font-semibold">Inducción / Curso</Label>
              <Select
                value={courseId}
                onValueChange={(value) => setValue("courseId", value)}
              >
                <SelectTrigger id="courseId">
                  <SelectValue placeholder="Selecciona una inducción" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.courseId && (
                <p className="text-xs text-destructive">
                  {errors.courseId.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expiresInHours" className="font-semibold flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                Vigencia del enlace
              </Label>
              <Select
                value={String(expiresInHours)}
                onValueChange={(value) =>
                  setValue("expiresInHours", Number(value))
                }
              >
                <SelectTrigger id="expiresInHours">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={String(MIN_INVITATION_TTL_HOURS)}>
                    24 horas (Recomendado)
                  </SelectItem>
                  <SelectItem value="36">36 horas</SelectItem>
                  <SelectItem value={String(MAX_INVITATION_TTL_HOURS)}>
                    48 horas
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="font-semibold flex items-center gap-1">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                Seguridad de acceso
              </Label>
              <div className="flex h-10 items-center rounded-md border px-3 bg-muted/40">
                <span className="text-xs">PIN de 6 dígitos (obligatorio)</span>
              </div>
            </div>
          </div>

          {/* SECCIÓN: Funcionarios Nuevos sin Inducciones Asignadas (Agrupados por Cargo) */}
          {groupedUnassignedByCargo.length > 0 && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-sm text-foreground">
                      Funcionarios Nuevos sin Inducción Asignada
                    </span>
                    <Badge variant="default" className="text-xs px-2 py-0 bg-primary">
                      {totalUnassigned} pendiente{totalUnassigned !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Personal activo que aún no registra ninguna inducción. Organizados por cargo para agregarlos a la lista con 1 clic:
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const allUnassigned = groupedUnassignedByCargo.flatMap((g) => g.staff);
                      handleAddMultipleFuncionarios(allUnassigned);
                    }}
                    className="h-8 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10 font-medium"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    <span>Agregar Todos ({totalUnassigned})</span>
                  </Button>
                </div>
              </div>

              {/* Acordeón de grupos por Cargo */}
              <div className="space-y-2 pt-1">
                {groupedUnassignedByCargo.map((group) => {
                  const isExpanded = expandedCargoNames.includes(group.positionName);
                  const inListCount = group.staff.filter((s) =>
                    fields.some((f) => f.rut === s.rut),
                  ).length;
                  const allInList = inListCount === group.staff.length;

                  return (
                    <div
                      key={group.positionName}
                      className="rounded-md border bg-background/80 shadow-2xs overflow-hidden transition-all"
                    >
                      <div className="flex items-center justify-between p-3 gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => toggleExpandCargo(group.positionName)}
                          className="flex items-center gap-2 text-left text-xs font-semibold text-foreground hover:text-primary transition-colors flex-1"
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span>{group.positionName}</span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                            {group.staff.length}
                          </Badge>
                          {inListCount > 0 && (
                            <span className="text-[11px] text-emerald-600 font-normal">
                              ({inListCount} en lista)
                            </span>
                          )}
                        </button>

                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={allInList ? "secondary" : "outline"}
                            disabled={allInList}
                            onClick={() => handleAddMultipleFuncionarios(group.staff)}
                            className="h-7 text-[11px] px-2.5 gap-1 font-medium"
                          >
                            <UserPlus className="h-3 w-3" />
                            <span>{allInList ? "Todos agregados" : `Agregar grupo (${group.staff.length})`}</span>
                          </Button>
                        </div>
                      </div>

                      {/* Lista desplegada de funcionarios del cargo */}
                      {isExpanded && (
                        <div className="border-t bg-muted/10 p-3 grid gap-2 sm:grid-cols-2 text-xs animate-in fade-in-50 duration-150">
                          {group.staff.map((funcionario) => {
                            const isAlreadyInList = fields.some(
                              (f) => f.rut === funcionario.rut,
                            );

                            return (
                              <div
                                key={funcionario.id}
                                className={`flex items-start justify-between rounded-md border p-2.5 transition-colors ${
                                  isAlreadyInList
                                    ? "bg-emerald-50/50 border-emerald-500/30 dark:bg-emerald-950/20"
                                    : "bg-background border-border/80 shadow-2xs hover:border-primary/40"
                                }`}
                              >
                                <div className="space-y-0.5 min-w-0 flex-1 pr-2">
                                  <span className="font-semibold text-foreground block truncate">
                                    {funcionario.name}
                                  </span>
                                  <span className="block text-[11px] text-muted-foreground font-mono">
                                    {formatRut(funcionario.rut)}
                                  </span>
                                  <span className="block text-[10px] text-muted-foreground truncate">
                                    {funcionario.email}
                                  </span>
                                  {funcionario.areaName && (
                                    <span className="block text-[10px] text-primary">
                                      Área: {funcionario.areaName}
                                    </span>
                                  )}
                                </div>

                                <Button
                                  type="button"
                                  size="sm"
                                  variant={isAlreadyInList ? "secondary" : "outline"}
                                  disabled={isAlreadyInList}
                                  onClick={() => handleSelectFuncionario(funcionario)}
                                  className="h-7 text-[11px] px-2 shrink-0 gap-1"
                                >
                                  {isAlreadyInList ? (
                                    <>
                                      <Check className="h-3 w-3 text-emerald-600" />
                                      <span>En lista</span>
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="h-3 w-3" />
                                      <span>Agregar</span>
                                    </>
                                  )}
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sección de búsqueda interactiva de funcionario */}
          <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Users className="h-4 w-4 text-primary" />
                Buscar Funcionario en el Directorio
              </Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBulk((value) => !value)}
                  className="gap-1 text-xs"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                  Carga manual / pegado
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append(EMPTY_INVITEE)}
                  className="gap-1 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Agregar en blanco
                </Button>
              </div>
            </div>

            {/* Input con buscador en vivo */}
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowSearchDropdown(true);
                  }}
                  onFocus={() => setShowSearchDropdown(true)}
                  placeholder="Escribe el nombre o RUT del funcionario para agregarlo a la lista..."
                  className="pl-9 bg-background"
                />
              </div>

              {showSearchDropdown && searchTerm.trim().length > 0 && (
                <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 shadow-lg">
                  {filteredFuncionarios.length === 0 ? (
                    <div className="p-3 text-center text-xs text-muted-foreground">
                      No se encontraron funcionarios activos que coincidan.
                    </div>
                  ) : (
                    filteredFuncionarios.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => handleSelectFuncionario(f)}
                        className="flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        <div>
                          <span className="font-medium text-foreground">{f.name}</span>
                          <span className="ml-2 font-mono text-muted-foreground">
                            {formatRut(f.rut)}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {f.positionName ?? "Sin cargo"} · {f.areaName ?? "Sin área"}
                          </span>
                        </div>
                        {f.jefeNombre && (
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            Jefe: {f.jefeNombre}
                          </Badge>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {showBulk && (
              <div className="space-y-2 rounded-md border bg-background p-4 mt-2">
                <Label htmlFor="bulk" className="text-xs font-semibold">
                  Pega una línea por funcionario: RUT;Nombre;Correo;CARGO
                </Label>
                <Textarea
                  id="bulk"
                  value={bulkText}
                  onChange={(event) => setBulkText(event.target.value)}
                  placeholder={`12345678-9;Ana Pérez;ana.perez@${institutionDomain};Docente`}
                  rows={4}
                  className="text-xs"
                />
                <Button type="button" size="sm" onClick={handleBulkImport}>
                  Cargar lista
                </Button>
              </div>
            )}
          </div>

          {/* Lista de funcionarios seleccionados para invitar */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-semibold text-sm">
                Lista de destinatarios ({fields.length})
              </Label>
              {fields.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => replace([])}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Limpiar lista
                </Button>
              )}
            </div>

            {fields.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground bg-muted/10">
                <User className="mx-auto h-8 w-8 opacity-40 mb-2" />
                <p className="text-sm font-medium">Aún no has agregado funcionarios a la lista</p>
                <p className="text-xs mt-1">Usa la barra de búsqueda superior para encontrar y agregar colaboradores rápidamente.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => {
                  const watchSendToJefe = watch(`invitees.${index}.sendToJefe`);
                  const watchJefeEmail = watch(`invitees.${index}.jefeEmail`);
                  const watchJefeNombre = watch(`invitees.${index}.jefeNombre`);
                  const watchAsistenteEmail = watch(`invitees.${index}.asistenteEmail`);

                  return (
                    <div
                      key={field.id}
                      className="rounded-lg border bg-card p-4 shadow-sm space-y-3"
                    >
                      {/* Datos principales del funcionario */}
                      <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_1.6fr_1.2fr_auto] items-start">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">RUT</Label>
                          <Input
                            placeholder="12345678-9"
                            className="h-9 text-xs"
                            {...register(`invitees.${index}.rut`)}
                          />
                          {errors.invitees?.[index]?.rut && (
                            <p className="text-[10px] text-destructive">
                              {errors.invitees[index]?.rut?.message}
                            </p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Nombre funcionario</Label>
                          <Input
                            className="h-9 text-xs"
                            {...register(`invitees.${index}.name`)}
                          />
                          {errors.invitees?.[index]?.name && (
                            <p className="text-[10px] text-destructive">
                              {errors.invitees[index]?.name?.message}
                            </p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Correo institucional</Label>
                          <Input
                            type="email"
                            placeholder={`nombre@${institutionDomain}`}
                            className="h-9 text-xs"
                            {...register(`invitees.${index}.email`)}
                          />
                          {errors.invitees?.[index]?.email && (
                            <p className="text-[10px] text-destructive">
                              {errors.invitees[index]?.email?.message}
                            </p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Cargo</Label>
                          <Select
                            value={watch(`invitees.${index}.positionId`) || NO_POSITION}
                            onValueChange={(value) => {
                              const posId = value === NO_POSITION ? "" : value;
                              setValue(`invitees.${index}.positionId`, posId);

                              // Si cambia de cargo, auto-detectar la jefatura asociada a ese cargo en el catálogo
                              if (posId) {
                                const info = getJefaturaForStaff(
                                  watch(`invitees.${index}.areaId`),
                                  posId,
                                  watch(`invitees.${index}.jefeNombre`),
                                  watch(`invitees.${index}.jefeEmail`),
                                  watch(`invitees.${index}.asistenteEmail`),
                                );
                                if (info.jefeEmail) {
                                  setValue(`invitees.${index}.areaId`, info.areaId);
                                  setValue(`invitees.${index}.jefeNombre`, info.jefeNombre);
                                  setValue(`invitees.${index}.jefeEmail`, info.jefeEmail);
                                  setValue(`invitees.${index}.sendToJefe`, true);
                                  if (info.asistenteEmail) {
                                    setValue(`invitees.${index}.asistenteEmail`, info.asistenteEmail);
                                    setValue(`invitees.${index}.ccAsistente`, true);
                                  }
                                }
                              }
                            }}
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue placeholder="Sin cargo" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_POSITION}>Sin cargo</SelectItem>
                              {positions.map((position) => (
                                <SelectItem key={position.id} value={position.id}>
                                  {position.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center gap-1.5 pt-5">
                          {(() => {
                            const emailKey = watch(`invitees.${index}.email`)?.toLowerCase().trim() || "";
                            const existingLinkData = emailKey ? linksByEmail[emailKey] : null;

                            if (existingLinkData) {
                              return (
                                <Button
                                  type="button"
                                  variant="default"
                                  size="sm"
                                  onClick={() => {
                                    navigator.clipboard.writeText(existingLinkData.link);
                                    toast.success("¡Enlace copiado al portapapeles!", {
                                      description: existingLinkData.pin
                                        ? `PIN: ${existingLinkData.pin}`
                                        : "Acceso directo sin PIN",
                                    });
                                  }}
                                  className="h-9 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                                  title="Copiar enlace ya generado al portapapeles"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                  <span>Copiar Link</span>
                                </Button>
                              );
                            }

                            return (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isPending || !field.rut || !field.email}
                                onClick={() => {
                                  const currentCourseId = watch("courseId");
                                  const currentExpires = watch("expiresInHours");
                                  const currentPin = watch("requiresPin");
                                  const currentInvitee = {
                                    userId: field.userId || "",
                                    rut: watch(`invitees.${index}.rut`),
                                    name: watch(`invitees.${index}.name`),
                                    email: watch(`invitees.${index}.email`),
                                    positionId: watch(`invitees.${index}.positionId`) || "",
                                    areaId: watch(`invitees.${index}.areaId`) || "",
                                    sendToJefe: false,
                                    jefeNombre: "",
                                    jefeEmail: "",
                                    ccAsistente: false,
                                    asistenteEmail: "",
                                    ccFuncionario: false,
                                    customCcEmails: "",
                                  };

                                  if (!currentInvitee.rut || !currentInvitee.email || !currentInvitee.name) {
                                    toast.error("Completa RUT, Nombre y Correo para generar el enlace.");
                                    return;
                                  }

                                  startTransition(async () => {
                                    const toastId = toast.loading("Generando enlace...");
                                    const result = await createInvitationsAction({
                                      courseId: currentCourseId,
                                      expiresInHours: currentExpires,
                                      requiresPin: currentPin,
                                      sendEmail: false,
                                      invitees: [currentInvitee],
                                    });

                                    if (result.success && result.data?.previewLinks?.[0]?.link) {
                                      const item = result.data.previewLinks[0];
                                      navigator.clipboard.writeText(item.link);
                                      setLinksByEmail((prev) => ({
                                        ...prev,
                                        [currentInvitee.email.toLowerCase().trim()]: {
                                          link: item.link,
                                          pin: item.pin,
                                        },
                                      }));
                                      setGeneratedLinks(result.data.previewLinks);
                                      toast.success(`¡Enlace generado y copiado para ${currentInvitee.name}!`, {
                                        id: toastId,
                                        description: item.pin ? `PIN: ${item.pin}` : "Acceso directo sin PIN",
                                        duration: 5000,
                                      });
                                      router.refresh();
                                    } else {
                                      toast.error(result.message || "No se pudo generar el enlace.", { id: toastId });
                                    }
                                  });
                                }}
                                className="h-9 gap-1.5 text-xs border-primary/30 hover:bg-primary/5 text-primary font-medium"
                                title="Generar enlace de inducción para este funcionario"
                              >
                                <Link2 className="h-3.5 w-3.5" />
                                <span>Generar Link</span>
                              </Button>
                            );
                          })()}

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(index)}
                            className="h-9 w-9 text-muted-foreground hover:text-destructive"
                            title="Quitar de la lista"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Configuración de Enrutamiento a Jefatura y Copias CC */}
                      <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-2.5">
                        <div className="flex flex-wrap items-center gap-4">
                          <label className="flex items-center gap-1.5 cursor-pointer font-medium text-foreground">
                            <input
                              type="checkbox"
                              {...register(`invitees.${index}.sendToJefe`)}
                              className="rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <span>Enviar a Jefe de Área</span>
                          </label>

                          {watchSendToJefe && (
                            <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
                              <input
                                type="checkbox"
                                {...register(`invitees.${index}.ccAsistente`)}
                                className="rounded border-gray-300 text-primary focus:ring-primary"
                              />
                              <span>Copia al Asistente</span>
                            </label>
                          )}

                          <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
                            <input
                              type="checkbox"
                              {...register(`invitees.${index}.ccFuncionario`)}
                              className="rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <span>Copia al Funcionario</span>
                          </label>
                        </div>

                        {/* Campos de contacto de jefatura y copias */}
                        <div className={`grid gap-2 pt-1 ${watchSendToJefe ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2"}`}>
                          {watchSendToJefe ? (
                            <>
                              <div>
                                <Label className="text-[10px] text-muted-foreground">Jefe de Área (Nombre)</Label>
                                <Input
                                  placeholder="Nombre del Jefe"
                                  className="h-8 text-xs bg-background"
                                  {...register(`invitees.${index}.jefeNombre`)}
                                />
                              </div>
                              <div>
                                <Label className="text-[10px] text-muted-foreground">
                                  <span>Correo del Jefe (Destinatario)</span>
                                </Label>
                                <Input
                                  placeholder="jefe@colegio.cl (o separados por coma)"
                                  className="h-8 text-xs bg-background"
                                  {...register(`invitees.${index}.jefeEmail`)}
                                />
                              </div>
                              {watch(`invitees.${index}.ccAsistente`) && (
                                <div>
                                  <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <Mail className="h-3 w-3 text-primary" />
                                    <span>CC Asistente(s)</span>
                                  </Label>
                                  <Input
                                    placeholder="asistente@colegio.cl (o separados por coma)"
                                    className="h-8 text-xs bg-background"
                                    {...register(`invitees.${index}.asistenteEmail`)}
                                  />
                                  {watchAsistenteEmail && (
                                    <p className="text-[9px] text-primary mt-0.5 truncate" title={watchAsistenteEmail}>
                                      {watchAsistenteEmail}
                                    </p>
                                  )}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="sm:col-span-2 text-muted-foreground flex items-center text-xs">
                              Se enviará directamente al correo del funcionario: {watch(`invitees.${index}.email`)}
                            </div>
                          )}

                          <div>
                            <Label className="text-[10px] text-muted-foreground">Otras copias (CC separadas por coma)</Label>
                            <Input
                              placeholder="rrhh@colegio.cl, direccion@colegio.cl"
                              className="h-8 text-xs bg-background"
                              {...register(`invitees.${index}.customCcEmails`)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {errors.invitees?.root && (
              <p className="text-xs text-destructive">
                {errors.invitees.root.message}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={fields.length === 0 || isPending}
              onClick={() => {
                const values = watch();
                if (!values.invitees || values.invitees.length === 0) {
                  toast.error("Agrega al menos un funcionario a la lista.");
                  return;
                }
                startTransition(async () => {
                  const toastId = toast.loading("Generando enlaces...");
                  const result = await createInvitationsAction({
                    ...values,
                    sendEmail: false,
                  });
                  if (result.success && result.data?.previewLinks && result.data.previewLinks.length > 0) {
                    setGeneratedLinks(result.data.previewLinks);
                    const newMap: Record<string, { link: string; pin?: string | null }> = {};
                    result.data.previewLinks.forEach((item) => {
                      newMap[item.email.toLowerCase().trim()] = { link: item.link, pin: item.pin };
                    });
                    setLinksByEmail((prev) => ({ ...prev, ...newMap }));

                    if (result.data.previewLinks.length === 1 && result.data.previewLinks[0]) {
                      navigator.clipboard.writeText(result.data.previewLinks[0].link);
                      toast.success(`¡Enlace copiado al portapapeles!`, { id: toastId });
                    } else {
                      toast.success(`¡${result.data.previewLinks.length} enlace(s) generados con éxito!`, { id: toastId });
                    }
                    router.refresh();
                  } else {
                    toast.error(result.message || "Error generando enlaces.", { id: toastId });
                  }
                });
              }}
              className="gap-2 text-xs border-primary/30 hover:bg-primary/5 text-primary font-medium"
            >
              <Copy className="h-4 w-4" />
              Generar y Copiar Enlace(s)
            </Button>

            <Button
              type="submit"
              disabled={fields.length === 0 || isPending}
              isLoading={isPending}
              className="gap-2 px-6"
            >
              <Send className="h-4 w-4" />
              Emitir y Enviar {fields.length} Invitación(es)
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
