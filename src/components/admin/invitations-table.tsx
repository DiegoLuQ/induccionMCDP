"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  KeyRound,
  Link2,
  Mail,
  RefreshCw,
  Sparkles,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/utils";
import { formatRut } from "@/lib/rut";
import { SIN_ASIGNAR } from "@/lib/constants";
import type { InvitationState } from "@/server/queries/invitations";
import {
  deleteInvitationAction,
  deleteMultipleInvitationsAction,
  resendInvitationAction,
  revokeInvitationAction,
} from "@/server/actions/invitation-actions";
import { InvitationBadge } from "@/components/shared/status-badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ReissueModalData {
  invitationId: string;
  userName: string;
  userRut: string;
  courseTitle: string;
  link: string;
  pin: string | null;
  requiresPin: boolean;
}

export interface InvitationItemData {
  id: string;
  tokenHash: string;
  requiresPin: boolean;
  isUsed: boolean;
  attempts: number;
  expiresAt: Date;
  sentToEmail: string | null;
  ccEmails: string | null;
  state: InvitationState;
  user: {
    id: string;
    name: string;
    rut: string;
    email: string;
    position: { name: string } | null;
  };
  course: {
    id: string;
    title: string;
  };
}

export function InvitationsTable({
  invitations,
}: {
  invitations: InvitationItemData[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [modalData, setModalData] = useState<ReissueModalData | null>(null);
  const [reissuingId, setReissuingId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  const allSelected =
    invitations.length > 0 && selectedIds.length === invitations.length;
  const someSelected =
    selectedIds.length > 0 && selectedIds.length < invitations.length;

  function handleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds(invitations.map((i) => i.id));
    } else {
      setSelectedIds([]);
    }
  }

  function handleToggleRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function handleDeleteSingle(id: string, name: string) {
    if (!confirm(`¿Estás seguro de eliminar la invitación de ${name}?`)) return;

    startTransition(async () => {
      const toastId = toast.loading("Eliminando invitación...");
      const result = await deleteInvitationAction(id);
      if (result.success) {
        setSelectedIds((prev) => prev.filter((item) => item !== id));
        toast.success(result.message || "Invitación eliminada", { id: toastId });
        router.refresh();
      } else {
        toast.error(result.message || "No se pudo eliminar", { id: toastId });
      }
    });
  }

  function handleDeleteSelected() {
    if (selectedIds.length === 0) return;
    if (
      !confirm(
        `¿Estás seguro de eliminar las ${selectedIds.length} invitaciones seleccionadas?`,
      )
    )
      return;

    startTransition(async () => {
      const toastId = toast.loading("Eliminando seleccionadas...");
      const result = await deleteMultipleInvitationsAction(selectedIds);
      if (result.success) {
        setSelectedIds([]);
        toast.success(result.message, { id: toastId });
        router.refresh();
      } else {
        toast.error(result.message || "Error al eliminar", { id: toastId });
      }
    });
  }

  function handleDeleteAll() {
    if (invitations.length === 0) return;
    if (
      !confirm(
        `ATENCIÓN: ¿Estás seguro de ELIMINAR TODO el historial de ${invitations.length} invitaciones? Esta acción no se puede deshacer.`,
      )
    )
      return;

    startTransition(async () => {
      const toastId = toast.loading("Eliminando todo el historial...");
      const result = await deleteMultipleInvitationsAction();
      if (result.success) {
        setSelectedIds([]);
        toast.success(result.message, { id: toastId });
        router.refresh();
      } else {
        toast.error(result.message || "Error al eliminar todo", { id: toastId });
      }
    });
  }

  function handleReissue(invitation: InvitationItemData) {
    setReissuingId(invitation.id);
    startTransition(async () => {
      const result = await resendInvitationAction(invitation.id);
      if (result.success && result.data?.link) {
        setModalData({
          invitationId: invitation.id,
          userName: invitation.user.name,
          userRut: invitation.user.rut,
          courseTitle: invitation.course.title,
          link: result.data.link,
          pin: result.data.pin ?? null,
          requiresPin: invitation.requiresPin,
        });
        toast.success("Nueva invitación emitida exitosamente.");
        router.refresh();
      } else {
        toast.error(result.message ?? "No se pudo reemitir la invitación");
      }
      setReissuingId(null);
    });
  }

  const copyLink = () => {
    if (!modalData?.link) return;
    navigator.clipboard.writeText(modalData.link);
    setCopiedLink(true);
    toast.success("Enlace copiado al portapapeles");
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const copyPin = () => {
    if (!modalData?.pin) return;
    navigator.clipboard.writeText(modalData.pin);
    setCopiedPin(true);
    toast.success("Código PIN copiado");
    setTimeout(() => setCopiedPin(false), 2500);
  };

  const copyAll = () => {
    if (!modalData) return;
    const text = `Hola ${modalData.userName},\nTe compartimos tu acceso a la inducción «${modalData.courseTitle}»:\n\n🔗 Enlace: ${modalData.link}${modalData.pin ? `\n🔑 PIN de acceso: ${modalData.pin}` : ""}\n\nPor favor ingresa para realizar tu inducción.`;
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    toast.success("Mensaje completo copiado para compartir");
    setTimeout(() => setCopiedAll(false), 2500);
  };

  function handleRevoke(id: string) {
    startTransition(async () => {
      const result = await revokeInvitationAction(id);
      if (result.success) {
        toast.success(result.message ?? "Invitación revocada");
        router.refresh();
      } else {
        toast.error(result.message ?? "No se pudo revocar");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
        <div>
          <CardTitle>Historial de invitaciones</CardTitle>
          <CardDescription>
            {invitations.length === 0
              ? "Aún no hay invitaciones emitidas."
              : `${invitations.length} registros en total.`}
          </CardDescription>
        </div>

        {invitations.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelected}
                disabled={isPending}
                className="gap-1.5 text-xs h-8"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar Seleccionadas ({selectedIds.length})
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteAll}
              disabled={isPending}
              className="gap-1.5 text-xs h-8 text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar Todo
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="px-0 pb-0">
        {invitations.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            Aún no has emitido invitaciones.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                    title="Seleccionar todas"
                  />
                </TableHead>
                <TableHead>Funcionario</TableHead>
                <TableHead>Inducción</TableHead>
                <TableHead>Destinatario / Notificación</TableHead>
                <TableHead>Acceso</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((invitation) => {
                const isChecked = selectedIds.includes(invitation.id);
                return (
                  <TableRow
                    key={invitation.id}
                    className={isChecked ? "bg-muted/40" : undefined}
                  >
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleRow(invitation.id)}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                      />
                    </TableCell>

                    <TableCell>
                      <span className="block font-medium">
                        {invitation.user.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatRut(invitation.user.rut)} ·{" "}
                        {invitation.user.position?.name ?? SIN_ASIGNAR}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {invitation.user.email}
                      </span>
                    </TableCell>

                    <TableCell className="max-w-[200px] truncate">
                      {invitation.course.title}
                    </TableCell>

                    <TableCell className="text-xs">
                      {invitation.sentToEmail ? (
                        <div className="space-y-0.5">
                          <span className="flex items-center gap-1 font-medium text-foreground">
                            <Mail className="h-3 w-3 text-primary" />
                            {invitation.sentToEmail}
                          </span>
                          {invitation.ccEmails && (
                            <span
                              className="block text-[10px] text-muted-foreground truncate max-w-[180px]"
                              title={invitation.ccEmails}
                            >
                              CC: {invitation.ccEmails}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">
                          {invitation.user.email}
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      {invitation.requiresPin ? (
                        <Badge
                          variant="outline"
                          className="gap-1 text-[11px] font-normal"
                        >
                          <KeyRound className="h-3 w-3 text-amber-500" />
                          Con PIN
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="gap-1 text-[11px] font-normal bg-emerald-50 text-emerald-700 border-emerald-200"
                        >
                          <Zap className="h-3 w-3 text-emerald-600" />
                          Directo
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell>
                      <InvitationBadge state={invitation.state} />
                      {invitation.attempts > 0 && !invitation.isUsed && (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {invitation.attempts} intento(s) fallido(s)
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(invitation.expiresAt)}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleReissue(invitation)}
                          title="Reemitir y copiar nuevo enlace"
                          className="gap-1 text-xs h-8 text-slate-700 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${
                              isPending && reissuingId === invitation.id
                                ? "animate-spin text-blue-600"
                                : ""
                            }`}
                            aria-hidden
                          />
                          <span className="sr-only sm:not-sr-only">
                            Reemitir / Copiar Link
                          </span>
                        </Button>

                        {invitation.state === "ACTIVE" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleRevoke(invitation.id)}
                            title="Revocar invitación"
                            className="text-amber-600 hover:text-amber-700 h-8 px-2"
                          >
                            <XCircle className="h-4 w-4" aria-hidden />
                            <span className="sr-only">Revocar</span>
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() =>
                            handleDeleteSingle(
                              invitation.id,
                              invitation.user.name,
                            )
                          }
                          title="Eliminar invitación"
                          className="text-destructive hover:text-destructive h-8 px-2"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                          <span className="sr-only">Eliminar</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Modal de Enlace y PIN Reemitido por Fila */}
      <Dialog
        open={Boolean(modalData)}
        onOpenChange={(open) => {
          if (!open) setModalData(null);
        }}
      >
        <DialogContent className="max-w-md p-6 bg-white rounded-2xl shadow-2xl border-slate-200">
          <DialogHeader className="space-y-1.5 text-left">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                <Sparkles className="w-4 h-4" />
              </div>
              <DialogTitle className="text-lg font-bold text-slate-900">
                Acceso a Inducción Reemitido
              </DialogTitle>
            </div>
            {modalData && (
              <DialogDescription className="text-xs text-slate-600">
                Acceso para{" "}
                <strong className="text-slate-800">{modalData.userName}</strong>{" "}
                ({formatRut(modalData.userRut)}) en la inducción{" "}
                <strong>«{modalData.courseTitle}»</strong>.
              </DialogDescription>
            )}
          </DialogHeader>

          {modalData && (
            <div className="space-y-4 pt-1">
              {/* Campo 1: Enlace */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-blue-600" />
                    Enlace de Acceso
                  </span>
                  <span className="text-[11px] font-normal text-slate-500">Vigencia renovada</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={modalData.link}
                    className="font-mono text-xs bg-slate-50 border-slate-300 text-slate-800 h-9 select-all"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={copyLink}
                    className="shrink-0 h-9 px-3 border-slate-300 text-slate-700 hover:bg-slate-100"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                        <span className="text-emerald-700 font-semibold text-xs">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1 text-slate-600" />
                        <span className="text-xs">Copiar Link</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Campo 2: Código PIN (si tiene) */}
              {modalData.pin ? (
                <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                      Código PIN de 6 Dígitos
                    </Label>
                    <span className="text-[11px] text-amber-700 font-medium">Requerido al ingresar</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-1.5">
                    <div className="font-mono text-2xl font-bold tracking-[0.25em] text-slate-900 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm select-all">
                      {modalData.pin}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={copyPin}
                      className="h-10 px-4 border-slate-300 text-slate-700 hover:bg-white shadow-sm"
                    >
                      {copiedPin ? (
                        <>
                          <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                          <span className="text-emerald-700 font-semibold text-xs">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 mr-1 text-slate-600" />
                          <span className="text-xs">Copiar PIN</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Esta invitación no exige PIN (acceso directo mediante el enlace).</span>
                </div>
              )}

              {/* Botón para Copiar Mensaje Completo */}
              <div className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyAll}
                  className="w-full text-xs h-9 text-slate-700 border-slate-300 hover:bg-slate-50"
                >
                  {copiedAll ? (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                      <span className="text-emerald-700 font-semibold">
                        ¡Mensaje completo copiado!
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                      <span>Copiar Mensaje Completo (para WhatsApp o Correo)</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setModalData(null)}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs px-4"
            >
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
