"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { loginAction } from "@/server/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  function onSubmit(values: LoginInput) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("identifier", values.identifier);
      formData.set("password", values.password);

      const result = await loginAction(null, formData);

      if (!result.success) {
        toast.error(result.message);
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            setError(field as keyof LoginInput, {
              message: messages?.[0] ?? "Dato inválido",
            });
          }
        }
        return;
      }

      const next = searchParams.get("next");
      router.replace(next ?? result.data?.redirectTo ?? "/dashboard");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="identifier">RUT o Correo institucional</Label>
            <Input
              id="identifier"
              type="text"
              autoComplete="username"
              placeholder="12345678-9 o correo@colegio.cl"
              aria-invalid={Boolean(errors.identifier)}
              {...register("identifier")}
            />
            {errors.identifier && (
              <p className="text-xs text-destructive">
                {errors.identifier.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña o Clave de 6 dígitos</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••"
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" isLoading={isPending}>
            Ingresar
          </Button>

          <p className="text-[11px] text-slate-500 text-center leading-relaxed">
            Funcionarios: ingresen con su <strong>RUT</strong> y su <strong>clave de 6 dígitos</strong>.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
