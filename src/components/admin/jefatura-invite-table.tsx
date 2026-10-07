"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Users,
  Mail,
  Link2,
  Send,
  ChevronDown,
  ChevronRight,
  Search,
  Check,
  Copy,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Building2,
  Clock,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  UserX,
  Filter,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import type { SearchFuncionarioItem } from "@/server/queries/funcionarios";
import { createConsolidatedInvitationsAction } from "@/server/actions/invitation-actions";
import type { IssueConsolidatedResult } from "@/server/services/invitation-service";

export interface CourseOption {
  id: string;
  title: string;
  type?: unknown;
  isMandatory?: boolean;
  currentPeriod?: number | null;
}

type StaffCourseStatus = "COMPLETED" | "IN_PROGRESS" | "PENDING" | "INVITED" | "NONE";

const COURSE_STATUS_BADGE: Record<StaffCourseStatus, { label: string; className: string }> = {
  COMPLETED: { label: "Ya completó", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  IN_PROGRESS: { label: "En curso", className: "bg-blue-50 text-blue-700 border-blue-200" },
  PENDING: { label: "Asignado sin empezar", className: "bg-amber-50 text-amber-800 border-amber-200" },
  INVITED: { label: "Invitación vigente", className: "bg-violet-50 text-violet-700 border-violet-200" },
  NONE: { label: "Sin invitación", className: "bg-slate-50 text-slate-600 border-slate-200" },
};

interface AreaOption {
  id: string;
  name: string;
  jefeNombre?: string | null;
  jefeRut?: string | null;
  jefeEmail?: string | null;
  asistenteEmail?: string | null;
  users?: Array<{ id: string; positionId: string | null }>;
}

interface PositionOption {
  id: string;
  name: string;
  slug: string;
}

interface JefaturaInviteTableProps {
  courses: CourseOption[];
  institutionDomain: string;
  positions: PositionOption[];
  areas: AreaOption[];
  funcionarios: SearchFuncionarioItem[];
  /** userId -> courseId -> situación en el curso (período vigente). */
  courseStatus: Record<string, Record<string, StaffCourseStatus>>;
}

interface EditableGroupData {
  areaId: string;
  areaName: string;
  jefeNombre: string;
  jefeEmail: string;
  asistenteEmail: string;
  sendToJefe: boolean;
  ccAsistente: boolean;
  ccFuncionario: boolean;
  customCcEmails: string;
  selectedStaffIds: Set<string>;
}

export function JefaturaInviteTable({
  courses,
  institutionDomain,
  positions,
  areas,
  funcionarios,
  courseStatus,
}: JefaturaInviteTableProps) {
  // Configuración general
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    courses[0]?.id ?? "",
  );
  const [expiresInHours, setExpiresInHours] = useState<number>(24);
  // Política: las invitaciones siempre exigen PIN.
  const requiresPin = true;
  // true: sólo quienes NO han completado el curso elegido.
  const [onlyUnassigned, setOnlyUnassigned] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Control de grupos expandidos (por key de área)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Grupos seleccionados para acciones masivas (Set de areaKeys)
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<Set<string>>(new Set());

  // Estados editables en vivo por cada grupo (jefeEmail, asistenteEmail, etc.)
  const [groupOverrides, setGroupOverrides] = useState<Record<string, Partial<EditableGroupData>>>({});

  // Deselección individual de funcionarios dentro de un grupo: Record<groupKey, Set<funcionarioId>>
  const [excludedStaff, setExcludedStaff] = useState<Record<string, Set<string>>>({});

  // Estados de carga
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingGroupKey, setProcessingGroupKey] = useState<string | null>(null);

  // Modal de resultados
  const [resultModalOpen, setResultModalOpen] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<IssueConsolidatedResult | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal de confirmación antes de enviar correo
  const [confirmSendModalOpen, setConfirmSendModalOpen] = useState<boolean>(false);
  const [keysToConfirmSend, setKeysToConfirmSend] = useState<string[]>([]);

  // Enlaces generados por ID de funcionario (para copiar directamente desde la subtabla)
  const [generatedByStaffId, setGeneratedByStaffId] = useState<
    Record<string, { link: string; pin: string | null }>
  >({});

  // Mapeo auxiliar de cargos
  const positionMap = useMemo(() => {
    return new Map(positions.map((p) => [p.id, p.name]));
  }, [positions]);

  // Helper para resolver el área y jefatura de un funcionario
  const resolveJefatura = (f: SearchFuncionarioItem) => {
    let foundArea = areas.find((a) => a.id === f.areaId);

    if ((!foundArea || !foundArea.jefeEmail) && f.positionId) {
      const areaByPos = areas.find((a) =>
        a.users?.some((u) => u.positionId === f.positionId),
      );
      if (areaByPos) {
        foundArea = areaByPos;
      }
    }

    const areaId = foundArea?.id || f.areaId || "_sin_jefatura";
    const areaName = foundArea?.name || f.areaName || "Sin Jefatura Asignada";
    const jefeNombre = foundArea?.jefeNombre || f.jefeNombre || "";
    const jefeEmail = foundArea?.jefeEmail || f.jefeEmail || "";
    const asistenteEmail = foundArea?.asistenteEmail || f.asistenteEmail || "";

    return {
      areaId,
      areaName,
      jefeNombre,
      jefeEmail,
      asistenteEmail,
      hasJefe: Boolean(jefeEmail),
      hasAsistente: Boolean(asistenteEmail),
    };
  };

  /** Situación del funcionario en el curso elegido. */
  const statusOf = (userId: string): StaffCourseStatus =>
    courseStatus[userId]?.[selectedCourseId] ?? "NONE";

  /** Quien ya completó el curso nunca se incluye en un envío. */
  const isSendable = (userId: string, excluded: Set<string>) =>
    !excluded.has(userId) && statusOf(userId) !== "COMPLETED";

  // Pendientes y total por área (sin filtros de búsqueda), para los contadores.
  const areaCounters = useMemo(() => {
    const map = new Map<string, { pending: number; total: number }>();
    for (const f of funcionarios) {
      const key = resolveJefatura(f).areaId;
      const entry = map.get(key) ?? { pending: 0, total: 0 };
      entry.total += 1;
      if ((courseStatus[f.id]?.[selectedCourseId] ?? "NONE") !== "COMPLETED") entry.pending += 1;
      map.set(key, entry);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funcionarios, courseStatus, selectedCourseId]);

  // Filtrar funcionarios según búsqueda y switch de inducciones asignadas
  const filteredFuncionarios = useMemo(() => {
    let list = funcionarios;
    if (onlyUnassigned) {
      list = list.filter((f) => statusOf(f.id) !== "COMPLETED");
    }

    if (!searchQuery.trim()) return list;

    const q = searchQuery.toLowerCase().trim();
    const cleanRut = q.replace(/[^0-9kK]/g, "");

    return list.filter((f) => {
      const matchName = f.name.toLowerCase().includes(q);
      const matchEmail = f.email.toLowerCase().includes(q);
      const matchCargo = (f.positionName || "").toLowerCase().includes(q);
      const matchArea = (f.areaName || "").toLowerCase().includes(q);
      const matchRut =
        f.rut.toLowerCase().includes(q) ||
        (cleanRut && f.rut.replace(/[^0-9kK]/g, "").includes(cleanRut));
      return matchName || matchEmail || matchCargo || matchArea || matchRut;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funcionarios, onlyUnassigned, searchQuery, selectedCourseId, courseStatus]);

  // Agrupación de los funcionarios por Jefatura / Área
  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        areaId: string;
        areaName: string;
        defaultJefeNombre: string;
        defaultJefeEmail: string;
        defaultAsistenteEmail: string;
        staff: SearchFuncionarioItem[];
      }
    >();

    for (const f of filteredFuncionarios) {
      const info = resolveJefatura(f);
      const groupKey = info.areaId;

      if (!map.has(groupKey)) {
        map.set(groupKey, {
          key: groupKey,
          areaId: info.areaId,
          areaName: info.areaName,
          defaultJefeNombre: info.jefeNombre,
          defaultJefeEmail: info.jefeEmail,
          defaultAsistenteEmail: info.asistenteEmail,
          staff: [],
        });
      }

      map.get(groupKey)!.staff.push(f);
    }

    // Ordenar: primero áreas con jefatura y al final "Sin Jefatura Asignada"
    return Array.from(map.values()).sort((a, b) => {
      if (a.key === "_sin_jefatura") return 1;
      if (b.key === "_sin_jefatura") return -1;
      return a.areaName.localeCompare(b.areaName);
    });
  }, [filteredFuncionarios]);

  // Obtener los datos actuales consolidados de un grupo (combinando defaults y overrides de usuario)
  const getGroupData = (groupKey: string) => {
    const group = groups.find((g) => g.key === groupKey);
    const overrides = groupOverrides[groupKey] || {};

    const areaId = group?.areaId === "_sin_jefatura" ? "" : (group?.areaId ?? "");
    const areaName = group?.areaName ?? "Sin Jefatura Asignada";
    const jefeNombre = overrides.jefeNombre !== undefined ? overrides.jefeNombre : (group?.defaultJefeNombre ?? "");
    const jefeEmail = overrides.jefeEmail !== undefined ? overrides.jefeEmail : (group?.defaultJefeEmail ?? "");
    const asistenteEmail =
      overrides.asistenteEmail !== undefined ? overrides.asistenteEmail : (group?.defaultAsistenteEmail ?? "");
    const sendToJefe = overrides.sendToJefe !== undefined ? overrides.sendToJefe : Boolean(jefeEmail);
    const ccAsistente = overrides.ccAsistente !== undefined ? overrides.ccAsistente : Boolean(asistenteEmail);
    const ccFuncionario = overrides.ccFuncionario !== undefined ? overrides.ccFuncionario : false;
    const customCcEmails = overrides.customCcEmails || "";

    return {
      areaId,
      areaName,
      jefeNombre,
      jefeEmail,
      asistenteEmail,
      sendToJefe,
      ccAsistente,
      ccFuncionario,
      customCcEmails,
    };
  };

  // Manejar cambio en inputs de correo o jefe
  const updateGroupOverride = (groupKey: string, updates: Partial<EditableGroupData>) => {
    setGroupOverrides((prev) => ({
      ...prev,
      [groupKey]: {
        ...(prev[groupKey] || {}),
        ...updates,
      },
    }));
  };

  // Toggle de expandir grupo
  const toggleGroupExpand = (groupKey: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  // Toggle selección de grupo completo
  const toggleGroupSelect = (groupKey: string) => {
    setSelectedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  // Seleccionar o deseleccionar todos los grupos
  const handleSelectAllGroups = () => {
    if (selectedGroupKeys.size === groups.length) {
      setSelectedGroupKeys(new Set());
    } else {
      setSelectedGroupKeys(new Set(groups.map((g) => g.key)));
    }
  };

  // Toggle exclusión individual de un funcionario dentro de un grupo
  const toggleStaffExclusion = (groupKey: string, staffId: string) => {
    setExcludedStaff((prev) => {
      const current = prev[groupKey] ? new Set(prev[groupKey]) : new Set<string>();
      if (current.has(staffId)) {
        current.delete(staffId);
      } else {
        current.add(staffId);
      }
      return { ...prev, [groupKey]: current };
    });
  };

  // Preparar payload para la Server Action
  const buildPayloadForGroups = (groupKeys: string[], sendEmail: boolean) => {
    if (!selectedCourseId) {
      toast.error("Por favor selecciona una inducción o curso.");
      return null;
    }

    const payloadGroups = [];

    for (const key of groupKeys) {
      const grp = groups.find((g) => g.key === key);
      if (!grp) continue;

      const groupData = getGroupData(key);
      const excluded = excludedStaff[key] || new Set<string>();
      const activeStaff = grp.staff.filter((s) => isSendable(s.id, excluded));

      if (activeStaff.length === 0) continue;

      payloadGroups.push({
        areaId: groupData.areaId,
        areaName: groupData.areaName,
        jefeNombre: groupData.jefeNombre,
        jefeEmail: groupData.jefeEmail,
        asistenteEmail: groupData.asistenteEmail,
        sendToJefe: groupData.sendToJefe,
        ccAsistente: groupData.ccAsistente,
        ccFuncionario: groupData.ccFuncionario,
        customCcEmails: groupData.customCcEmails,
        invitees: activeStaff.map((s) => ({
          userId: s.id,
          rut: s.rut,
          name: s.name,
          email: s.email,
          positionId: s.positionId ?? "",
          areaId: groupData.areaId,
          sendToJefe: groupData.sendToJefe,
          jefeNombre: groupData.jefeNombre,
          jefeEmail: groupData.jefeEmail,
          ccAsistente: groupData.ccAsistente,
          asistenteEmail: groupData.asistenteEmail,
          ccFuncionario: groupData.ccFuncionario,
          customCcEmails: groupData.customCcEmails,
        })),
      });
    }

    if (payloadGroups.length === 0) {
      toast.error("No hay funcionarios seleccionados para procesar.");
      return null;
    }

    return {
      courseId: selectedCourseId,
      requiresPin,
      sendEmail,
      expiresInHours,
      groups: payloadGroups,
    };
  };

  // Ejecutar proceso para un solo grupo
  const handleProcessSingleGroup = async (groupKey: string, sendEmail: boolean) => {
    const payload = buildPayloadForGroups([groupKey], sendEmail);
    if (!payload) return;

    setProcessingGroupKey(groupKey);
    const toastId = toast.loading(
      sendEmail
        ? "Enviando correo consolidado a la jefatura..."
        : "Generando enlaces de acceso...",
    );

    try {
      const res = await createConsolidatedInvitationsAction(payload);
      if (!res.success) {
        toast.error(res.message || "Error al procesar invitaciones", { id: toastId });
        return;
      }

      toast.success(res.message, { id: toastId });
      const responseData = res.data;
      setLastResult(responseData ?? null);
      if (responseData) {
        setGeneratedByStaffId((prev) => {
          const updated = { ...prev };
          responseData.groups.forEach((g) => {
            g.issued.forEach((inv) => {
              updated[inv.userId] = { link: inv.link, pin: inv.pin };
            });
          });
          return updated;
        });
      }
      setResultModalOpen(true);
    } catch (err) {
      console.error(err);
      toast.error("Ocurrió un error inesperado al emitir las invitaciones", { id: toastId });
    } finally {
      setProcessingGroupKey(null);
    }
  };

  // Solicitar confirmación para un solo grupo
  const handleRequestSendSingle = (groupKey: string) => {
    if (!selectedCourseId) {
      toast.error("Por favor selecciona una inducción o curso.");
      return;
    }
    const groupData = getGroupData(groupKey);
    if (groupKey !== "_sin_jefatura" && !groupData.jefeEmail) {
      toast.error("Ingresa el correo de la jefatura para enviar.");
      return;
    }
    setKeysToConfirmSend([groupKey]);
    setConfirmSendModalOpen(true);
  };

  // Solicitar confirmación para todos los grupos seleccionados (o todos)
  const handleRequestSendBulk = () => {
    if (!selectedCourseId) {
      toast.error("Por favor selecciona una inducción o curso.");
      return;
    }
    const targetKeys =
      selectedGroupKeys.size > 0
        ? Array.from(selectedGroupKeys)
        : groups.map((g) => g.key);

    if (targetKeys.length === 0) {
      toast.error("No hay funcionarios ni áreas seleccionadas para enviar.");
      return;
    }

    setKeysToConfirmSend(targetKeys);
    setConfirmSendModalOpen(true);
  };

  // Ejecutar el envío una vez confirmado en el modal
  const handleConfirmSendExecution = async () => {
    setConfirmSendModalOpen(false);
    if (keysToConfirmSend.length === 1 && keysToConfirmSend[0]) {
      await handleProcessSingleGroup(keysToConfirmSend[0], true);
    } else if (keysToConfirmSend.length > 0) {
      await handleProcessBulkInternal(keysToConfirmSend, true);
    }
  };

  const handleProcessBulkInternal = async (targetKeys: string[], sendEmail: boolean) => {
    const payload = buildPayloadForGroups(targetKeys, sendEmail);
    if (!payload) return;

    setIsProcessing(true);
    const toastId = toast.loading(
      sendEmail
        ? `Enviando correos consolidados a ${payload.groups.length} jefatura(s)...`
        : `Generando enlaces para ${payload.groups.length} grupo(s)...`,
    );

    try {
      const res = await createConsolidatedInvitationsAction(payload);
      if (!res.success) {
        toast.error(res.message || "Error al procesar invitaciones", { id: toastId });
        return;
      }

      toast.success(res.message, { id: toastId });
      const responseData = res.data;
      setLastResult(responseData ?? null);
      if (responseData) {
        setGeneratedByStaffId((prev) => {
          const updated = { ...prev };
          responseData.groups.forEach((g) => {
            g.issued.forEach((inv) => {
              updated[inv.userId] = { link: inv.link, pin: inv.pin };
            });
          });
          return updated;
        });
      }
      setResultModalOpen(true);
      // Limpiar selección tras éxito
      setSelectedGroupKeys(new Set());
    } catch (err) {
      console.error(err);
      toast.error("Ocurrió un error inesperado al emitir las invitaciones", { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  // Generar y copiar enlace individual para un funcionario directamente desde la subtabla
  const handleGenerateSingleStaffLink = async (groupKey: string, staff: SearchFuncionarioItem) => {
    if (!selectedCourseId) {
      toast.error("Por favor selecciona una inducción o curso.");
      return;
    }
    const groupData = getGroupData(groupKey);
    const toastId = toast.loading(`Generando enlace para ${staff.name}...`);
    try {
      const payload = {
        courseId: selectedCourseId,
        requiresPin,
        sendEmail: false,
        expiresInHours,
        groups: [
          {
            areaId: groupData.areaId,
            areaName: groupData.areaName,
            jefeNombre: groupData.jefeNombre,
            jefeEmail: groupData.jefeEmail,
            asistenteEmail: groupData.asistenteEmail,
            sendToJefe: false,
            ccAsistente: false,
            ccFuncionario: false,
            customCcEmails: "",
            invitees: [
              {
                userId: staff.id,
                rut: staff.rut,
                name: staff.name,
                email: staff.email,
                positionId: staff.positionId ?? "",
                areaId: groupData.areaId,
                sendToJefe: false,
                jefeNombre: groupData.jefeNombre,
                jefeEmail: groupData.jefeEmail,
                ccAsistente: false,
                asistenteEmail: groupData.asistenteEmail,
                ccFuncionario: false,
                customCcEmails: "",
              },
            ],
          },
        ],
      };

      const res = await createConsolidatedInvitationsAction(payload);
      if (!res.success || !res.data) {
        toast.error(res.message || "Error al generar enlace", { id: toastId });
        return;
      }

      const issued = res.data.groups[0]?.issued[0];
      if (issued) {
        setGeneratedByStaffId((prev) => ({
          ...prev,
          [staff.id]: { link: issued.link, pin: issued.pin },
        }));
        await copyToClipboard(issued.link, staff.id);
        toast.success(`Enlace copiado para ${staff.name}`, { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al generar enlace", { id: toastId });
    }
  };

  // Generar enlaces en lote sin enviar correo
  const handleGenerateLinksBulk = async () => {
    const targetKeys =
      selectedGroupKeys.size > 0
        ? Array.from(selectedGroupKeys)
        : groups.map((g) => g.key);
    await handleProcessBulkInternal(targetKeys, false);
  };

  // Copiar al portapapeles
  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast.success("Copiado al portapapeles");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  // Copiar todos los enlaces generados en texto consolidado
  const copyAllGeneratedLinks = () => {
    if (!lastResult) return;
    const lines: string[] = [];

    lines.push(`=== ACCESOS A INDUCCIÓN OBLIGATORIA ===`);
    lines.push(
      `Curso: ${courses.find((c) => c.id === selectedCourseId)?.title || "Inducción"}`,
    );
    lines.push("");

    lastResult.groups.forEach((grp) => {
      lines.push(`--- ${grp.areaName.toUpperCase()} ---`);
      if (grp.jefeNombre) lines.push(`Jefatura: ${grp.jefeNombre}`);
      lines.push("");

      grp.issued.forEach((item) => {
        lines.push(`• Funcionario: ${item.name}`);
        lines.push(`  RUT: ${item.email}`);
        lines.push(`  Enlace: ${item.link}`);
        if (item.pin) lines.push(`  PIN de Acceso: ${item.pin}`);
        lines.push("");
      });
    });

    copyToClipboard(lines.join("\n"), "all-generated");
  };

  // Métricas rápidas
  const totalNewStaff = useMemo(() => {
    return funcionarios.filter((f) => f.coursesCount === 0).length;
  }, [funcionarios]);

  const totalVisibleStaff = useMemo(() => {
    return groups.reduce((acc, g) => acc + g.staff.length, 0);
  }, [groups]);

  const groupsWithoutEmail = useMemo(() => {
    return groups.filter((g) => {
      const data = getGroupData(g.key);
      return !data.jefeEmail;
    }).length;
  }, [groups, groupOverrides]);

  return (
    <div className="space-y-6">
      {/* 1. Panel de Configuración Superior */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                Gestión y Envío de Invitaciones por Jefatura
              </CardTitle>
              <CardDescription className="text-slate-600 mt-1">
                Genera accesos individuales y envía un correo consolidado por cada área o jefatura.
              </CardDescription>
            </div>

            {/* Badges de Estado Rápido */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="bg-slate-50 text-slate-700 py-1.5 px-3">
                <Users className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                {totalNewStaff} funcionario{totalNewStaff === 1 ? "" : "s"} nuevo(s)
              </Badge>
              <Badge variant="outline" className="bg-slate-50 text-slate-700 py-1.5 px-3">
                <Building2 className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                {groups.length} área(s) detectada(s)
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
            {/* Selector de Inducción / Curso */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                Inducción Obligatoria *
              </Label>
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="w-full text-sm rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {courses.length === 0 ? (
                  <option value="">No hay inducciones publicadas</option>
                ) : (
                  courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                      {c.isMandatory ? ` · Obligatorio${c.currentPeriod ? ` ${c.currentPeriod}` : ""}` : ""}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Vigencia */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                Vigencia del Enlace
              </Label>
              <select
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(Number(e.target.value))}
                className="w-full text-sm rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value={24}>24 horas (Recomendado)</option>
                <option value={48}>48 horas (2 días)</option>
                <option value={72}>72 horas (3 días)</option>
              </select>
            </div>

            {/* Seguridad / PIN */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Validación de Seguridad
              </Label>
              <div className="flex items-center gap-2 text-sm text-slate-800 h-10 px-3 border border-slate-200 rounded-md bg-slate-50">
                <span className="font-medium">PIN de 6 dígitos (obligatorio)</span>
              </div>
            </div>
          </div>

          {/* Filtros y Buscador */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <Input
                  type="text"
                  placeholder="Buscar por funcionario, RUT, cargo o área..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 text-sm h-9 bg-slate-50 border-slate-200"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer whitespace-nowrap bg-slate-100/80 px-3 py-2 rounded-md hover:bg-slate-200/70 transition">
                <input
                  type="checkbox"
                  checked={onlyUnassigned}
                  onChange={(e) => setOnlyUnassigned(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                />
                <span>Solo pendientes de este curso</span>
              </label>
            </div>

            {/* Botones de acción masiva */}
            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateLinksBulk}
                disabled={isProcessing || Boolean(processingGroupKey) || groups.length === 0}
                className="text-xs h-9 border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                {isProcessing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <Link2 className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                )}
                Generar Enlaces {selectedGroupKeys.size > 0 ? `(${selectedGroupKeys.size})` : "(Todos)"}
              </Button>

              <Button
                size="sm"
                onClick={handleRequestSendBulk}
                disabled={isProcessing || Boolean(processingGroupKey) || groups.length === 0}
                className="text-xs h-9 bg-slate-900 hover:bg-slate-800 text-white font-semibold shadow-sm"
              >
                {isProcessing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <Send className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                )}
                Enviar Correo a Jefaturas {selectedGroupKeys.size > 0 ? `(${selectedGroupKeys.size})` : "(Todas)"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Listado Principal Agrupado por Jefatura */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectAllGroups}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition"
            >
              <input
                type="checkbox"
                checked={selectedGroupKeys.size === groups.length && groups.length > 0}
                onChange={handleSelectAllGroups}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
              <span>
                {selectedGroupKeys.size === groups.length
                  ? "Deseleccionar todos"
                  : `Seleccionar todas las áreas (${groups.length})`}
              </span>
            </button>

            {selectedGroupKeys.size > 0 && (
              <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                {selectedGroupKeys.size} área(s) seleccionada(s)
              </Badge>
            )}
          </div>

          <div className="text-xs text-slate-500">
            Mostrando <strong>{totalVisibleStaff}</strong> funcionario{totalVisibleStaff === 1 ? "" : "s"} en{" "}
            <strong>{groups.length}</strong> jefatura(s)
          </div>
        </div>

        {groups.length === 0 ? (
          <Card className="p-8 text-center bg-white border-dashed border-slate-300">
            <UserX className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-800">No se encontraron funcionarios</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
              {onlyUnassigned
                ? "Todos los funcionarios activos ya completaron este curso o no coinciden con la búsqueda."
                : "No hay funcionarios que coincidan con los filtros aplicados."}
            </p>
            {onlyUnassigned && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOnlyUnassigned(false)}
                className="mt-4 text-xs"
              >
                Ver también a quienes ya lo completaron
              </Button>
            )}
          </Card>
        ) : (
          groups.map((group) => {
            const isExpanded = Boolean(expandedGroups[group.key]);
            const isGroupSelected = selectedGroupKeys.has(group.key);
            const groupData = getGroupData(group.key);
            const isSinJefatura = group.key === "_sin_jefatura";

            const excluded = excludedStaff[group.key] || new Set<string>();
            const activeStaffCount = group.staff.filter((s) => isSendable(s.id, excluded)).length;
            const counters = areaCounters.get(group.key) ?? { pending: 0, total: 0 };
            const isCurrentProcessing = processingGroupKey === group.key;

            return (
              <div
                key={group.key}
                className={`bg-white rounded-xl border transition-all duration-200 ${
                  isGroupSelected
                    ? "border-blue-300 shadow-md ring-1 ring-blue-200"
                    : "border-slate-200 shadow-sm hover:border-slate-300"
                }`}
              >
                {/* Cabecera del Grupo / Fila Jefatura */}
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Checkbox, Botón Expandir y Título de Área */}
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={isGroupSelected}
                        onChange={() => toggleGroupSelect(group.key)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 mt-1 sm:mt-0 cursor-pointer"
                      />

                      <button
                        type="button"
                        onClick={() => toggleGroupExpand(group.key)}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                        title={isExpanded ? "Colapsar funcionarios" : "Ver funcionarios"}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-slate-600" />
                        ) : (
                          <ChevronRight className="w-5 h-5" />
                        )}
                      </button>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-base">
                            {groupData.areaName}
                          </span>
                          <Badge
                            variant="secondary"
                            className={`text-xs font-semibold ${
                              isSinJefatura
                                ? "bg-amber-100 text-amber-800"
                                : "bg-blue-50 text-blue-700 border border-blue-200"
                            }`}
                          >
                            {activeStaffCount} funcionario{activeStaffCount === 1 ? "" : "s"}
                            {excluded.size > 0 && ` (${excluded.size} excluido)`}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-xs font-semibold ${
                              counters.pending === 0
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-white text-slate-700 border-slate-300"
                            }`}
                            title="Pendientes del curso seleccionado en esta área"
                          >
                            {counters.pending === 0
                              ? "Área al día ✓"
                              : `${counters.pending} pendiente${counters.pending === 1 ? "" : "s"} de ${counters.total}`}
                          </Badge>
                          {isSinJefatura && (
                            <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              Envío directo a funcionarios
                            </span>
                          )}
                        </div>

                        {/* Nombre del Jefe */}
                        {!isSinJefatura && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            Jefatura a cargo:{" "}
                            <strong className="text-slate-700">
                              {groupData.jefeNombre || "Sin nombre registrado"}
                            </strong>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Inputs Editables en Línea: Correo Jefatura, Asistente y Otros CC */}
                    {!isSinJefatura ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 lg:max-w-2xl w-full">
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1 truncate">
                            <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                            Correo(s) Jefatura:
                          </label>
                          <Input
                            type="text"
                            placeholder="jefe@colegio.cl"
                            value={groupData.jefeEmail}
                            onChange={(e) =>
                              updateGroupOverride(group.key, { jefeEmail: e.target.value })
                            }
                            className={`h-8 text-xs bg-slate-50 ${
                              !groupData.jefeEmail
                                ? "border-amber-300 bg-amber-50/40"
                                : "border-slate-200"
                            }`}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1 truncate">
                            <Users className="w-3 h-3 text-slate-500 shrink-0" />
                            Asistente (CC):
                          </label>
                          <Input
                            type="text"
                            placeholder="asistente@colegio.cl"
                            value={groupData.asistenteEmail}
                            onChange={(e) =>
                              updateGroupOverride(group.key, { asistenteEmail: e.target.value })
                            }
                            className="h-8 text-xs bg-slate-50 border-slate-200"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1 truncate">
                            <Mail className="w-3 h-3 text-blue-500 shrink-0" />
                            Otro(s) CC:
                          </label>
                          <Input
                            type="text"
                            placeholder="copia@colegio.cl"
                            value={groupData.customCcEmails}
                            onChange={(e) =>
                              updateGroupOverride(group.key, { customCcEmails: e.target.value })
                            }
                            className="h-8 text-xs bg-slate-50 border-slate-200"
                            title="Puedes ingresar correos adicionales en copia separados por coma"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded-md border border-slate-200 lg:max-w-md">
                        Estos funcionarios no tienen jefatura asignada en el catálogo. Al enviar, el correo
                        se dirigirá individualmente a la casilla de cada funcionario.
                      </div>
                    )}

                    {/* Acciones individuales del grupo */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleProcessSingleGroup(group.key, false)}
                        disabled={isProcessing || isCurrentProcessing || activeStaffCount === 0}
                        className="text-xs h-8 px-3 border-slate-300 text-slate-700 hover:bg-slate-100"
                      >
                        {isCurrentProcessing ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <Link2 className="w-3 h-3 mr-1 text-blue-600" />
                        )}
                        Generar Enlaces
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleRequestSendSingle(group.key)}
                        disabled={
                          isProcessing ||
                          isCurrentProcessing ||
                          activeStaffCount === 0 ||
                          (!isSinJefatura && !groupData.jefeEmail)
                        }
                        className="text-xs h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white font-medium shadow-sm"
                        title={
                          !isSinJefatura && !groupData.jefeEmail
                            ? "Ingresa el correo de la jefatura para enviar"
                            : "Enviar correo consolidado con los accesos"
                        }
                      >
                        {isCurrentProcessing ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <Send className="w-3 h-3 mr-1 text-amber-400" />
                        )}
                        Enviar Correo
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Subtabla Expandible: Funcionarios de este grupo */}
                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50/50 p-4 rounded-b-xl">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Funcionarios de {groupData.areaName} ({group.staff.length})
                      </h4>
                      <span className="text-[11px] text-slate-500">
                        Desmarca un funcionario si no deseas incluirlo en el envío
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600">
                            <th className="py-2.5 px-3 w-10 text-center">Incluir</th>
                            <th className="py-2.5 px-3 font-semibold">Funcionario</th>
                            <th className="py-2.5 px-3 font-semibold">RUT</th>
                            <th className="py-2.5 px-3 font-semibold">Cargo</th>
                            <th className="py-2.5 px-3 font-semibold">Correo Institucional</th>
                            <th className="py-2.5 px-3 font-semibold text-center">Estado</th>
                            <th className="py-2.5 px-3 font-semibold text-center w-48">Enlace / Copiar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {group.staff.map((staff) => {
                            const isExcluded = excluded.has(staff.id);
                            const generated = generatedByStaffId[staff.id];
                            return (
                              <tr
                                key={staff.id}
                                className={`transition-colors ${
                                  isExcluded
                                    ? "bg-slate-50/60 opacity-50"
                                    : "hover:bg-slate-50"
                                }`}
                              >
                                <td className="py-2.5 px-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={!isExcluded && statusOf(staff.id) !== "COMPLETED"}
                                    disabled={statusOf(staff.id) === "COMPLETED"}
                                    title={statusOf(staff.id) === "COMPLETED" ? "Ya completó este curso: no se le envía" : undefined}
                                    onChange={() => toggleStaffExclusion(group.key, staff.id)}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                                  />
                                </td>
                                <td className="py-2.5 px-3 font-medium text-slate-900">
                                  {staff.name}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-slate-600">
                                  {staff.rut}
                                </td>
                                <td className="py-2.5 px-3 text-slate-700">
                                  {staff.positionName || "Sin cargo"}
                                </td>
                                <td className="py-2.5 px-3 text-slate-600 font-mono">
                                  {staff.email}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] ${COURSE_STATUS_BADGE[statusOf(staff.id)].className}`}
                                  >
                                    {COURSE_STATUS_BADGE[statusOf(staff.id)].label}
                                  </Badge>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {generated ? (
                                    <div className="flex items-center justify-center gap-1.5">
                                      {generated.pin && (
                                        <span className="font-mono text-[10px] font-bold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                          PIN: {generated.pin}
                                        </span>
                                      )}
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => copyToClipboard(generated.link, staff.id)}
                                        className="h-6 text-[10px] px-2 bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                                      >
                                        {copiedId === staff.id ? (
                                          <>
                                            <Check className="w-3 h-3 mr-1 text-emerald-600" />
                                            Copiado
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="w-3 h-3 mr-1 text-emerald-600" />
                                            Copiar Link
                                          </>
                                        )}
                                      </Button>
                                    </div>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleGenerateSingleStaffLink(group.key, staff)}
                                      className="h-6 text-[10px] px-2 text-slate-700 hover:bg-slate-100 border-slate-300"
                                    >
                                      <Link2 className="w-3 h-3 mr-1 text-blue-600" />
                                      Generar y Copiar
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 3. Modal de Resultados con Enlaces Generados */}
      <Dialog open={resultModalOpen} onOpenChange={setResultModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-slate-900">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Invitaciones Procesadas con Éxito
            </DialogTitle>
            <DialogDescription className="text-slate-600 text-xs">
              Se han emitido los accesos para la inducción. Puedes copiar los enlaces directos o
              compartirlos con las jefaturas correspondientes.
            </DialogDescription>
          </DialogHeader>

          {lastResult && (
            <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
              {lastResult.groups.map((grp, idx) => (
                <div key={idx} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-slate-500" />
                      {grp.areaName}
                    </div>
                    {grp.emailSent ? (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">
                        ✓ Correo consolidado enviado a {grp.sentToEmail}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-white text-slate-600 text-xs">
                        Enlaces generados (sin correo)
                      </Badge>
                    )}
                  </div>

                  {grp.ccEmails.length > 0 && (
                    <p className="text-[11px] text-slate-500 mb-2">
                      Con copia (CC) a: {grp.ccEmails.join(", ")}
                    </p>
                  )}

                  {grp.portal && (
                    <div className="mb-2 rounded border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-900">
                      <span className="font-semibold">Portal del área:</span>{" "}
                      <a href={grp.portal.url} target="_blank" rel="noreferrer" className="underline">
                        {grp.portal.url.replace(/^https?:\/\//, "")}
                      </a>
                      {" · "}
                      <span className="font-semibold">Clave:</span>{" "}
                      <span className="font-mono font-bold tracking-wider">{grp.portal.key}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {grp.issued.map((inv) => (
                      <div
                        key={inv.invitationId}
                        className="flex items-center justify-between gap-2 p-2 bg-white rounded border border-slate-200 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{inv.name}</p>
                          <p className="text-[11px] text-slate-500 font-mono truncate">{inv.email}</p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {inv.pin && (
                            <span className="font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-800 border border-slate-200">
                              PIN: {inv.pin}
                            </span>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyToClipboard(inv.link, inv.invitationId)}
                            className="h-7 text-[11px] px-2"
                          >
                            {copiedId === inv.invitationId ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600 mr-1" />
                                Copiado
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 mr-1" />
                                Copiar Link
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2 border-t pt-3">
            <Button
              variant="outline"
              onClick={copyAllGeneratedLinks}
              className="text-xs border-slate-300 text-slate-700"
            >
              {copiedId === "all-generated" ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 mr-1" />
                  Todos los enlaces copiados
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  Copiar Todo el Reporte (WhatsApp / Teams)
                </>
              )}
            </Button>
            <Button
              onClick={() => setResultModalOpen(false)}
              className="text-xs bg-slate-900 text-white"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. Modal de Confirmación de Envío */}
      <Dialog open={confirmSendModalOpen} onOpenChange={setConfirmSendModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-slate-900">
              <Mail className="w-5 h-5 text-blue-600" />
              Confirmar Envío de Invitaciones
            </DialogTitle>
            <DialogDescription className="text-slate-600 text-xs">
              Revisa los destinatarios, correos en copia y funcionarios antes de enviar las invitaciones.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
            {/* Resumen del curso */}
            <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 flex items-center justify-between">
              <div>
                <span className="text-blue-600 font-semibold block text-[11px] uppercase tracking-wider">
                  Inducción Seleccionada
                </span>
                <span className="font-bold text-sm text-blue-950">
                  {courses.find((c) => c.id === selectedCourseId)?.title || "Inducción"}
                </span>
              </div>
              <div className="text-right">
                <Badge variant="outline" className="bg-white text-blue-800 border-blue-300">
                  {keysToConfirmSend.length} área(s) a notificar
                </Badge>
              </div>
            </div>

            {/* Listado de áreas a notificar */}
            <div className="space-y-3">
              {keysToConfirmSend.map((key) => {
                const grp = groups.find((g) => g.key === key);
                if (!grp) return null;
                const groupData = getGroupData(key);
                const excluded = excludedStaff[key] || new Set<string>();
                const activeStaff = grp.staff.filter((s) => isSendable(s.id, excluded));
                const isSinJef = key === "_sin_jefatura";

                return (
                  <div
                    key={key}
                    className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/60 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-slate-500" />
                        {groupData.areaName}
                      </span>
                      <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-700">
                        {activeStaff.length} funcionario{activeStaff.length === 1 ? "" : "s"}
                      </Badge>
                    </div>

                    {!isSinJef ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-[11px] font-medium text-slate-500 block">
                            Destinatario (Jefatura):
                          </span>
                          <span className="font-semibold text-slate-800 font-mono text-[11px] truncate block" title={groupData.jefeEmail}>
                            {groupData.jefeEmail || "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] font-medium text-slate-500 block">
                            Asistente (CC):
                          </span>
                          <span className="font-semibold text-slate-800 font-mono text-[11px] truncate block" title={groupData.asistenteEmail}>
                            {groupData.asistenteEmail || "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] font-medium text-slate-500 block">
                            Otro(s) CC:
                          </span>
                          <Input
                            type="text"
                            placeholder="copia@colegio.cl"
                            value={groupData.customCcEmails}
                            onChange={(e) =>
                              updateGroupOverride(key, { customCcEmails: e.target.value })
                            }
                            className="h-7 text-xs bg-white mt-0.5 border-slate-200"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                        Se enviará la invitación individual directa a la casilla institucional de cada funcionario.
                      </div>
                    )}

                    {/* Lista desplegable o chips de funcionarios */}
                    <div className="bg-white rounded border border-slate-200 p-2 text-xs">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                        Colaboradores incluidos en el correo:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {activeStaff.map((s) => (
                          <span
                            key={s.id}
                            className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[11px]"
                          >
                            <strong>{s.name}</strong>
                            <span className="text-slate-500">({s.positionName || "Sin cargo"})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-slate-500 bg-slate-100/70 p-2.5 rounded-lg border border-slate-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
              <span>
                Cada jefatura recibirá un correo consolidado con el detalle, PIN y enlaces directos de
                sus funcionarios. Las copias (CC) recibirán el mismo correo informativo.
              </span>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 border-t pt-3">
            <Button
              variant="outline"
              onClick={() => setConfirmSendModalOpen(false)}
              className="text-xs border-slate-300 text-slate-700"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmSendExecution}
              disabled={isProcessing}
              className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-semibold shadow-sm"
            >
              {isProcessing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <Send className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
              )}
              Confirmar y Enviar Correo(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
