"use client";

import { forwardRef, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  changePasswordSchema,
  type ChangePasswordInput,
} from "@/lib/validations/auth";
import { changePasswordAction } from "@/server/actions/auth-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordForm() {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  function onSubmit(values: ChangePasswordInput) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("currentPassword", values.currentPassword);
      formData.set("newPassword", values.newPassword);
      formData.set("confirmPassword", values.confirmPassword);

      const result = await changePasswordAction(null, formData);
      if (result.success) {
        toast.success(result.message ?? "Contraseña actualizada");
        reset();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cambiar contraseña</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field
            id="currentPassword"
            label="Contraseña actual"
            error={errors.currentPassword?.message}
            {...register("currentPassword")}
          />
          <Field
            id="newPassword"
            label="Nueva contraseña"
            error={errors.newPassword?.message}
            {...register("newPassword")}
          />
          <Field
            id="confirmPassword"
            label="Repite la nueva contraseña"
            error={errors.confirmPassword?.message}
            {...register("confirmPassword")}
          />
          <Button type="submit" isLoading={isPending}>
            Guardar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** forwardRef es indispensable: react-hook-form inyecta la ref en el input. */
const Field = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    id: string;
    label: string;
    error?: string;
  }
>(({ id, label, error, ...props }, ref) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} type="password" autoComplete="off" ref={ref} {...props} />
    {error && <p className="text-xs text-destructive">{error}</p>}
  </div>
));
Field.displayName = "Field";
