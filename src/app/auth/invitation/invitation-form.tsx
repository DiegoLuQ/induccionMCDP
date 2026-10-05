"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  redeemInvitationSchema,
  type RedeemInvitationInput,
} from "@/lib/validations/auth";
import { redeemInvitationAction } from "@/server/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function InvitationForm({
  token,
  autoSubmit = false,
  isInvalid = false,
}: {
  token: string;
  autoSubmit?: boolean;
  isInvalid?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const autoSubmitted = useRef(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RedeemInvitationInput>({
    resolver: zodResolver(redeemInvitationSchema),
    defaultValues: { token, pin: "" },
  });

  function executeRedeem(values: RedeemInvitationInput) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("token", values.token);
      formData.set("pin", values.pin ?? "");

      const result = await redeemInvitationAction(null, formData);

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success("¡Bienvenido/a! Comencemos tu inducción.");
      router.replace(result.data?.redirectTo ?? "/mis-inducciones");
      router.refresh();
    });
  }

  function onSubmit(values: RedeemInvitationInput) {
    executeRedeem(values);
  }

  useEffect(() => {
    if (autoSubmit && token && !autoSubmitted.current) {
      autoSubmitted.current = true;
      executeRedeem({ token, pin: "" });
    }
  }, [autoSubmit, token]);

  if (!token || isInvalid) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6 text-center">
          <p className="text-sm font-medium text-destructive">
            {isInvalid
              ? "Este enlace de invitación ya venció o no es válido."
              : "Abre el enlace que te enviamos por correo o WhatsApp."}
          </p>
          <p className="text-xs text-muted-foreground">
            {isInvalid
              ? "Por favor, solicita a RRHH o Administración que te reemita un nuevo enlace."
              : "Debe incluir tu token de invitación para poder ingresar."}
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Ir al ingreso administrativo</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <input type="hidden" {...register("token")} />

          <div className="space-y-2">
            <Label htmlFor="pin">Código PIN</Label>
            <Input
              id="pin"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="text-center text-2xl tracking-[0.5em]"
              aria-invalid={Boolean(errors.pin)}
              {...register("pin")}
            />
            {errors.pin && (
              <p className="text-xs text-destructive">{errors.pin.message}</p>
            )}
            {errors.token && (
              <p className="text-xs text-destructive">
                El enlace de invitación no es válido.
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" isLoading={isPending}>
            Validar y comenzar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
