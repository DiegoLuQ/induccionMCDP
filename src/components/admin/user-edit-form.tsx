"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Role } from "@prisma/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ROLE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { updateUserSchema, type UpdateUserInput } from "@/lib/validations/user";
import { updateUserAction } from "@/server/actions/user-actions";
import { CatalogSelect, Field, NONE, type Choice } from "@/components/admin/user-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export interface EditableUser {
  id: string;
  rut: string;
  name: string;
  email: string;
  corporateEmail: string | null;
  username: string | null;
  phone: string | null;
  role: Role;
  positionId: string | null;
  areaId: string | null;
  institutionId: string;
  institutionName: string;
  extraInstitutionIds: string[];
  hasPassword: boolean;
}

export function UserEditForm({
  user,
  institutions,
  positions,
  areas,
  canAssignAdminRoles,
  isSelf,
}: {
  user: EditableUser;
  institutions: Choice[];
  positions: Choice[];
  areas: Choice[];
  /** Sólo un SUPER_ADMIN cambia roles y edita a otros administradores. */
  canAssignAdminRoles: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      id: user.id,
      rut: user.rut,
      name: user.name,
      email: user.email,
      corporateEmail: user.corporateEmail ?? "",
      username: user.username ?? "",
      phone: user.phone ?? "",
      role: user.role,
      positionId: user.positionId ?? "",
      areaId: user.areaId ?? "",
      extraInstitutionIds: user.extraInstitutionIds,
      password: "",
    },
  });

  const role = watch("role") ?? user.role;
  const extraInstitutionIds = watch("extraInstitutionIds") ?? [];
  const otherInstitutions = institutions.filter((i) => i.id !== user.institutionId);
  // Al pasar a un rol con acceso por /login sin contraseña previa, hay que definir una.
  const needsPassword = role !== Role.FUNCIONARIO && !user.hasPassword;
  const roleLocked = !canAssignAdminRoles || isSelf;

  function toggleExtra(id: string) {
    setValue(
      "extraInstitutionIds",
      extraInstitutionIds.includes(id)
        ? extraInstitutionIds.filter((value) => value !== id)
        : [...extraInstitutionIds, id],
    );
  }

  function onSubmit(values: UpdateUserInput) {
    if (needsPassword && !values.password) {
      toast.error("Define una contraseña para que pueda iniciar sesión con este rol.");
      return;
    }
    // Sin la opción visible (RRHH) no se tocan los colegios adicionales.
    const payload = canAssignAdminRoles ? values : { ...values, extraInstitutionIds: undefined };
    startTransition(async () => {
      const result = await updateUserAction(payload);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message ?? "Usuario actualizado.");
      router.push("/admin/funcionarios");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos personales</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="rut" label="RUT" error={errors.rut?.message} {...register("rut")} />
          <Field id="name" label="Nombre completo" error={errors.name?.message} {...register("name")} />
          <Field id="email" label="Correo" type="email" error={errors.email?.message} {...register("email")} />
          <Field
            id="corporateEmail"
            label="Correo institucional"
            type="email"
            hint="Opcional"
            error={errors.corporateEmail?.message}
            {...register("corporateEmail")}
          />
          <Field
            id="phone"
            label="Teléfono"
            hint="Opcional"
            error={errors.phone?.message}
            {...register("phone")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acceso y rol</CardTitle>
          <CardDescription>
            Los funcionarios ingresan con invitación y PIN; los demás roles, por /login con su correo o
            usuario y contraseña.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="role">Rol</Label>
            <Select
              value={role}
              onValueChange={(value) => setValue("role", value as Role)}
              disabled={roleLocked}
            >
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(Role).map((option) => (
                  <SelectItem key={option} value={option}>
                    {ROLE_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {roleLocked && (
              <p className="text-xs text-muted-foreground">
                {isSelf
                  ? "No puedes cambiar tu propio rol."
                  : "Sólo un Super Administrador puede cambiar el rol."}
              </p>
            )}
          </div>

          <Field
            id="username"
            label="Usuario"
            hint="Opcional: también puede entrar con su correo"
            placeholder="c.soto"
            error={errors.username?.message}
            {...register("username")}
          />

          <Field
            id="password"
            label={needsPassword ? "Contraseña (obligatoria)" : "Nueva contraseña"}
            type="password"
            autoComplete="new-password"
            hint={
              needsPassword
                ? "Mínimo 8 caracteres, con letras y números"
                : user.hasPassword
                  ? "Déjala vacía para mantener la actual"
                  : "Opcional para funcionarios"
            }
            error={errors.password?.message}
            {...register("password")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Colegio y clasificación</CardTitle>
          <CardDescription>Colegio principal: {user.institutionName}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <CatalogSelect
              id="positionId"
              label="Cargo"
              value={watch("positionId") || NONE}
              options={positions}
              onChange={(value) => setValue("positionId", value === NONE ? "" : value)}
            />
            <CatalogSelect
              id="areaId"
              label="Área"
              value={watch("areaId") || NONE}
              options={areas}
              onChange={(value) => setValue("areaId", value === NONE ? "" : value)}
            />
          </div>

          {canAssignAdminRoles && otherInstitutions.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label>Colegios adicionales</Label>
                <p className="text-xs text-muted-foreground">
                  Podrá alternar entre ellos con el selector superior (útil para auditores y
                  administradores de ambos colegios).
                </p>
                <div className="flex flex-wrap gap-2">
                  {otherInstitutions.map((institution) => {
                    const active = extraInstitutionIds.includes(institution.id);
                    return (
                      <button
                        key={institution.id}
                        type="button"
                        onClick={() => toggleExtra(institution.id)}
                        aria-pressed={active}
                        className={cn(
                          "rounded-full border px-3 py-1 text-sm transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "hover:bg-accent",
                        )}
                      >
                        {institution.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex justify-end gap-2 pt-6">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isPending}>
            Guardar cambios
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
