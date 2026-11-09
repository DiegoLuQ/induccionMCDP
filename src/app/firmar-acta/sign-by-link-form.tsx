"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSignature, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { signCertificateWithTokenAction } from "@/server/actions/online-signature-actions";
import { Button } from "@/components/ui/button";

interface SignByLinkFormProps {
  token: string;
  courseTitle: string;
  name: string;
  email: string;
}

export function SignByLinkForm({ token, courseTitle, name, email }: SignByLinkFormProps) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSign() {
    if (!accepted) return;
    startTransition(async () => {
      const result = await signCertificateWithTokenAction(token);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success("¡Acta firmada y registrada!");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border-2 border-emerald-500/30 bg-emerald-500/5 p-3">
      <label
        htmlFor="accept-sign-by-link"
        className="flex cursor-pointer select-none items-start gap-2.5 rounded-md border border-emerald-500/20 bg-background p-2.5 transition-colors hover:bg-accent/40"
      >
        <input
          type="checkbox"
          id="accept-sign-by-link"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 cursor-pointer rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
        />
        <span className="text-xs font-medium leading-snug sm:text-sm">
          Firmo electrónicamente mi Constancia de Participación de la {courseTitle}.
        </span>
      </label>
      <p className="text-xs text-muted-foreground">
        El acta quedará sellada como firmada desde el correo personal de{" "}
        <strong className="text-foreground">{name}</strong> (<span className="break-all">{email}</span>), con la
        fecha y hora de la firma. Una vez firmada no se puede deshacer.
      </p>
      <Button
        type="button"
        onClick={handleSign}
        disabled={!accepted || isPending}
        className="w-full gap-2 bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Firmando...
          </>
        ) : (
          <>
            <FileSignature className="h-4 w-4" />
            Firmar acta
          </>
        )}
      </Button>
    </div>
  );
}
