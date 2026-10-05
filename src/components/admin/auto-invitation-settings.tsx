"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  BellRing,
  Clock,
  Mail,
  Play,
  Save,
  ShieldCheck,
  Sparkles,
  Users,
  CheckCircle2,
  AlertCircle,
  Loader2,
  CalendarCheck,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import type { AutoInvitationConfigDTO } from "@/server/services/auto-invitation-service";
import {
  saveAutoInvitationConfigAction,
  runAutoInvitationsNowAction,
} from "@/server/actions/auto-invitation-actions";

interface CourseOption {
  id: string;
  title: string;
}

interface AutoInvitationSettingsProps {
  initialConfig: AutoInvitationConfigDTO;
  courses: CourseOption[];
}

export function AutoInvitationSettings({
  initialConfig,
  courses,
}: AutoInvitationSettingsProps) {
  const [isEnabled, setIsEnabled] = useState<boolean>(initialConfig.isEnabled);
  const [scheduledTime, setScheduledTime] = useState<string>(
    initialConfig.scheduledTime || "09:00",
  );
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    initialConfig.courseId || courses[0]?.id || "",
  );
  const [sendToJefe, setSendToJefe] = useState<boolean>(initialConfig.sendToJefe);
  const [customCcEmails, setCustomCcEmails] = useState<string>(
    initialConfig.customCcEmails || "",
  );

  const [lastRunAt, setLastRunAt] = useState<Date | null>(
    initialConfig.lastRunAt ? new Date(initialConfig.lastRunAt) : null,
  );
  const [lastRunStatus, setLastRunStatus] = useState<string | null>(
    initialConfig.lastRunStatus,
  );

  const [isSaving, startSaving] = useTransition();
  const [isTesting, startTesting] = useTransition();

  const handleSave = () => {
    startSaving(async () => {
      const res = await saveAutoInvitationConfigAction({
        isEnabled,
        scheduledTime,
        courseId: selectedCourseId || null,
        sendToJefe,
        customCcEmails,
      });

      if (!res.success) {
        toast.error(res.message || "Error al guardar la configuración");
        return;
      }

      toast.success(res.message);
    });
  };

  const handleTestNow = () => {
    if (!selectedCourseId) {
      toast.error("Selecciona primero una inducción activa para ejecutar la prueba.");
      return;
    }

    startTesting(async () => {
      const toastId = toast.loading("Verificando funcionarios y ejecutando disparador...");
      const res = await runAutoInvitationsNowAction();

      if (!res.success) {
        toast.error(res.message, { id: toastId });
        return;
      }

      toast.success(res.message, { id: toastId });
      setLastRunAt(new Date());
      setLastRunStatus(res.message ?? null);
    });
  };

  const formatCLDate = (date: Date) => {
    return new Intl.DateTimeFormat("es-CL", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Santiago",
    }).format(date);
  };

  return (
    <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
      {/* Encabezado con estado del disparador */}
      <CardHeader className="bg-slate-50/60 border-b border-slate-100 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-100/80 text-blue-700">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                Disparador Automático de Invitaciones
                <Badge
                  variant={isEnabled ? "default" : "secondary"}
                  className={`text-xs ${
                    isEnabled
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {isEnabled ? "ACTIVO" : "DESACTIVADO"}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Envía automáticamente correos a las jefaturas cuando haya nuevos funcionarios sin la inducción realizada.
              </CardDescription>
            </div>
          </div>

          {/* Toggle Principal */}
          <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-700">
              {isEnabled ? "Disparador habilitado" : "Disparador deshabilitado"}
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 1. Selección de Inducción Vigente */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Inducción Vigente / Activa *
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
                  </option>
                ))
              )}
            </select>
            <p className="text-[11px] text-slate-500">
              Define la inducción obligatoria actual. Puedes cambiarla cuando inicie el ciclo (ej. de 2026 a 2027).
            </p>
          </div>

          {/* 2. Hora de Ejecución Diaria */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              Hora Diaria de Ejecución *
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full text-sm h-9 bg-white border-slate-300"
              />
              <span className="text-xs text-slate-500 whitespace-nowrap">
                (Hora de Chile)
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Cada día a esta hora se revisarán nuevos funcionarios ingresados que aún no hayan hecho la inducción.
            </p>
          </div>
        </div>

        <Separator />

        {/* 3. Opciones de Envío y Destinatarios */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-slate-600" />
            Configuración de Destinatarios
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Checkbox Enviar a Jefatura */}
            <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/50">
              <input
                type="checkbox"
                id="sendToJefeCheckbox"
                checked={sendToJefe}
                onChange={(e) => setSendToJefe(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 mt-0.5 cursor-pointer"
              />
              <div className="space-y-0.5">
                <label
                  htmlFor="sendToJefeCheckbox"
                  className="text-xs font-semibold text-slate-900 cursor-pointer"
                >
                  Enviar correo a la Jefatura del Área
                </label>
                <p className="text-[11px] text-slate-500">
                  Despacha el correo consolidado al correo del jefe configurado en el catálogo. Si se desactiva,
                  el envío irá únicamente a los correos fijos en copia o directo al funcionario.
                </p>
              </div>
            </div>

            {/* Input Correos Fijos en Copia (CC) */}
            <div className="space-y-1.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50">
              <Label className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                <Users className="w-3 h-3 text-slate-500" />
                Correos adicionales en copia (CC):
              </Label>
              <Input
                type="text"
                placeholder="rrhh@colegio.cl, asistente@colegio.cl"
                value={customCcEmails}
                onChange={(e) => setCustomCcEmails(e.target.value)}
                className="text-xs h-8 bg-white border-slate-300"
              />
              <p className="text-[10px] text-slate-500">
                Separa múltiples correos con comas. Recibirán copia de cada notificación enviada.
              </p>
            </div>
          </div>
        </div>

        {/* 4. Estado de la Última Ejecución */}
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-slate-500 shrink-0" />
            <div>
              <span className="text-slate-600">Última ejecución: </span>
              <strong>
                {lastRunAt ? formatCLDate(lastRunAt) : "Aún no se ha ejecutado"}
              </strong>
            </div>
          </div>

          {lastRunStatus && (
            <div className="text-slate-700 bg-white px-2.5 py-1 rounded border border-slate-200 truncate max-w-md">
              {lastRunStatus}
            </div>
          )}
        </div>

        {/* 5. Barra de Acciones */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestNow}
            disabled={isTesting || isSaving}
            className="text-xs h-9 border-slate-300 text-slate-700 hover:bg-slate-50 w-full sm:w-auto"
          >
            {isTesting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <Play className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
            )}
            Probar Ejecución Ahora
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || isTesting}
            className="text-xs h-9 bg-slate-900 hover:bg-slate-800 text-white font-semibold shadow-sm w-full sm:w-auto"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
            )}
            Guardar Configuración
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
