"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, ShieldCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { setupInitialAccessAction } from "@/server/actions/auth-actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface FirstAccessModalProps {
  user: {
    name: string;
    rut: string;
    corporateEmail?: string | null;
    email?: string | null;
    institution: {
      name: string;
      domain: string;
    };
  };
}

export function FirstAccessModal({ user }: FirstAccessModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const initialLocalPart = () => {
    if (user.corporateEmail && user.corporateEmail.includes("@")) {
      return user.corporateEmail.split("@")[0] || "";
    }
    return "";
  };

  const [emailLocalPart, setEmailLocalPart] = useState(initialLocalPart());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      toast.error("La clave debe tener exactamente 6 dígitos numéricos.");
      return;
    }

    if (pin !== confirmPin) {
      toast.error("Las claves ingresadas no coinciden.");
      return;
    }

    const trimmedLocal = emailLocalPart.trim().replace(/@.*$/, "");
    let finalCorporateEmail: string | undefined = undefined;

    if (trimmedLocal) {
      finalCorporateEmail = `${trimmedLocal.toLowerCase()}@${user.institution.domain.toLowerCase()}`;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("pin", pin);
      formData.set("confirmPin", confirmPin);
      if (finalCorporateEmail) {
        formData.set("corporateEmail", finalCorporateEmail);
      }

      const res = await setupInitialAccessAction(null, formData);

      if (!res.success) {
        toast.error(res.message || "Error al configurar la clave.");
        return;
      }

      toast.success("¡Clave de acceso y correo guardados con éxito!");
      router.refresh();
    });
  };

  return (
    <Dialog open={true}>
      <DialogContent
        className="max-w-md p-6 bg-white rounded-2xl shadow-2xl border-slate-200"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-center sm:text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-1">
            <KeyRound className="w-6 h-6" />
          </div>
          <DialogTitle className="text-xl font-bold text-slate-900">
            ¡Bienvenido(a), {user.name.split(" ")[0]}!
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-600 max-w-sm mx-auto">
            Para acceder en el futuro directamente con tu <strong>RUT ({user.rut})</strong>, por favor crea tu clave personal de 6 dígitos numéricos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Campo Clave de 6 Dígitos */}
          <div className="space-y-1.5">
            <Label htmlFor="new-pin" className="text-xs font-semibold text-slate-700 flex items-center justify-between">
              <span>Crear Clave de 6 Dígitos *</span>
              <span className="text-[11px] font-normal text-slate-500">Solo números</span>
            </Label>
            <Input
              id="new-pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="000000"
              className="text-center font-mono text-xl tracking-[0.5em] h-11 bg-slate-50 border-slate-300 focus:border-blue-500"
              autoFocus
              required
            />
          </div>

          {/* Confirmar Clave */}
          <div className="space-y-1.5">
            <Label htmlFor="confirm-pin" className="text-xs font-semibold text-slate-700">
              Confirmar Clave de 6 Dígitos *
            </Label>
            <Input
              id="confirm-pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="000000"
              className="text-center font-mono text-xl tracking-[0.5em] h-11 bg-slate-50 border-slate-300 focus:border-blue-500"
              required
            />
          </div>

          {/* Correo Institucional */}
          <div className="space-y-1.5 pt-1">
            <Label htmlFor="corporate-email" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-blue-600" />
              <span>Correo Institucional (Recomendado)</span>
            </Label>
            <div className="flex items-center rounded-md border border-slate-300 bg-slate-50 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 overflow-hidden">
              <input
                id="corporate-email"
                type="text"
                value={emailLocalPart}
                onChange={(e) => setEmailLocalPart(e.target.value)}
                placeholder="nombre.apellido"
                className="flex-1 bg-transparent px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <span className="bg-slate-200/80 px-3 py-2 text-xs font-semibold text-slate-700 select-none border-l border-slate-300">
                @{user.institution.domain}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Tu correo oficial en <strong>{user.institution.name}</strong>.
            </p>
          </div>

          <div className="bg-blue-50/70 border border-blue-200/60 rounded-lg p-3 text-[11px] text-blue-900 space-y-1">
            <div className="font-semibold flex items-center gap-1.5 text-blue-800">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              ¿Cómo ingresarás la próxima vez?
            </div>
            <p className="text-blue-700 leading-relaxed">
              Podrás iniciar sesión en la pantalla de inicio ingresando tu <strong>RUT ({user.rut})</strong> y esta <strong>clave de 6 dígitos</strong>, sin requerir una nueva invitación.
            </p>
          </div>

          <Button
            type="submit"
            className="w-full h-11 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all mt-2"
            isLoading={isPending}
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Guardar y Continuar a mi Inducción
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
