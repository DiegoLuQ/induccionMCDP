"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { formatRut } from "@/lib/rut";
import { updateProfileSchema, type UpdateProfileInput } from "@/lib/validations/profile";
import { updateProfileAction } from "@/server/actions/profile-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileForm({
  rut,
  email,
  corporateEmail,
  institutionDomain,
  canEditRut,
}: {
  rut: string;
  email: string;
  corporateEmail: string | null;
  institutionDomain: string;
  canEditRut: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      rut: canEditRut ? formatRut(rut) : undefined,
      email,
      corporateEmail: corporateEmail ?? "",
    },
  });

  function onSubmit(values: UpdateProfileInput) {
    startTransition(async () => {
      const result = await updateProfileAction(canEditRut ? values : { ...values, rut: undefined });
      if (result.success) {
        toast.success(result.message ?? "Datos actualizados.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">RUT y correos</CardTitle>
        <CardDescription>
          {canEditRut
            ? "Cuida que el RUT coincida con la base central de funcionarios: la sincronización identifica a cada persona por su RUT."
            : "Puedes actualizar tus correos. Si tu RUT está mal, solicita la corrección a Recursos Humanos."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="rut">RUT</Label>
            {canEditRut ? (
              <Input id="rut" placeholder="12.345.678-9" {...register("rut")} />
            ) : (
              <Input id="rut" value={formatRut(rut)} disabled readOnly />
            )}
            {errors.rut && <p className="text-xs text-destructive">{errors.rut.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Correo personal</Label>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="corporateEmail">Correo institucional</Label>
            <Input
              id="corporateEmail"
              type="email"
              placeholder={`nombre@${institutionDomain}`}
              {...register("corporateEmail")}
            />
            {errors.corporateEmail ? (
              <p className="text-xs text-destructive">{errors.corporateEmail.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Opcional. Debe terminar en @{institutionDomain}.</p>
            )}
          </div>
          <div className="flex justify-end">
            <Button type="submit" isLoading={isPending} disabled={!isDirty}>
              Guardar cambios
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
