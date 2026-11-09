"use client";

import { useState, useTransition } from "react";
import { FileSignature, Loader2, MailCheck, Send } from "lucide-react";
import { toast } from "sonner";
import { requestSignatureEmailAction } from "@/server/actions/online-signature-actions";
import { Button } from "@/components/ui/button";

interface SignCertificateFormProps {
  courseId: string;
  courseTitle: string;
  /** Correo personal al que llegará el enlace (si se conoce). */
  email?: string | null;
}

function formatCl(date: Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(date);
}

/**
 * El funcionario acepta firmar su constancia: se le envía un correo a su
 * correo personal con el enlace (vigente 24 h) desde donde la firma.
 */
export function SignCertificateForm({ courseId, courseTitle, email }: SignCertificateFormProps) {
  const [accepted, setAccepted] = useState(false);
  const [sent, setSent] = useState<{ email: string; expiresAt: Date } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRequest() {
    if (!accepted) return;
    startTransition(async () => {
      const result = await requestSignatureEmailAction(courseId);
      if (!result.success || !result.data) {
        toast.error(result.message);
        return;
      }
      setSent({ email: result.data.email, expiresAt: new Date(result.data.expiresAt) });
      toast.success(result.message ?? "Te enviamos el enlace de firma.");
    });
  }

  if (sent) {
    return (
      <div className="space-y-3 rounded-lg border-2 border-emerald-500/30 bg-emerald-500/5 p-3">
        <div className="flex items-start gap-2.5">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="space-y-1 text-xs sm:text-sm">
            <p className="font-semibold text-emerald-800 dark:text-emerald-300">
              Revisa tu correo personal
            </p>
            <p className="text-muted-foreground">
              Te enviamos el enlace para firmar el acta a <strong className="break-all text-foreground">{sent.email}</strong>.
              Es válido por 24 horas (hasta el {formatCl(sent.expiresAt)}). Si no lo ves, revisa la carpeta de spam.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleRequest}
          disabled={isPending}
          className="w-full gap-2"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Reenviar enlace
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border-2 border-emerald-500/30 bg-emerald-500/5 p-3">
      <label
        htmlFor={`accept-online-signature-${courseId}`}
        className="flex cursor-pointer select-none items-start gap-2.5 rounded-md border border-emerald-500/20 bg-background p-2.5 transition-colors hover:bg-accent/40"
      >
        <input
          type="checkbox"
          id={`accept-online-signature-${courseId}`}
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 cursor-pointer rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
        />
        <span className="text-xs font-medium leading-snug sm:text-sm">
          Acepto firmar electrónicamente mi Constancia de Participación de la {courseTitle}.
        </span>
      </label>
      <p className="text-xs text-muted-foreground">
        Se enviará un correo a tu correo personal
        {email ? (
          <>
            {" "}(<strong className="break-all text-foreground">{email}</strong>)
          </>
        ) : null}{" "}
        con un enlace válido por <strong className="text-foreground">24 horas</strong> para firmar el acta de
        constancia. El acta quedará sellada como firmada desde tu correo personal.
      </p>
      <Button
        type="button"
        onClick={handleRequest}
        disabled={!accepted || isPending}
        className="w-full gap-2 bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Enviando...
          </>
        ) : (
          <>
            <FileSignature className="h-4 w-4" />
            Enviar enlace de firma a mi correo
          </>
        )}
      </Button>
    </div>
  );
}
