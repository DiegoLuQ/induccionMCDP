"use client";

import { forwardRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { Building2, Link2, Plus, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SOCIAL_PLATFORMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { formatRut } from "@/lib/rut";
import {
  updateInstitutionSchema,
  type UpdateInstitutionInput,
} from "@/lib/validations/institution";
import { updateInstitutionAction } from "@/server/actions/institution-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface InstitutionFormProps {
  initialValues: UpdateInstitutionInput;
  /** Sólo un SUPER_ADMIN puede desactivar un establecimiento. */
  canDeactivate: boolean;
}

export function InstitutionForm({
  initialValues,
  canDeactivate,
}: InstitutionFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UpdateInstitutionInput>({
    resolver: zodResolver(updateInstitutionSchema),
    defaultValues: initialValues,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "socialLinks",
  });

  const logoUrl = watch("logoUrl");
  const isActive = watch("isActive");
  const rut = watch("rut");

  function onSubmit(values: UpdateInstitutionInput) {
    startTransition(async () => {
      const result = await updateInstitutionAction(values);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message ?? "Colegio actualizado.");
      router.push("/configuracion/colegios");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {/* ----------------------- Identificación ----------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" aria-hidden />
            Identificación
          </CardTitle>
          <CardDescription>
            Datos oficiales del establecimiento.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            id="name"
            label="Nombre"
            error={errors.name?.message}
            className="sm:col-span-2"
            {...register("name")}
          />

          <Field
            id="rbd"
            label="RBD"
            hint="Rol Base de Datos del Mineduc"
            placeholder="12345-6"
            error={errors.rbd?.message}
            {...register("rbd")}
          />

          <Field
            id="rut"
            label="RUT del establecimiento"
            hint={rut ? formatRut(rut) : "Ej. 76.123.456-7"}
            placeholder="76123456-7"
            error={errors.rut?.message}
            {...register("rut")}
          />

          <Field
            id="slug"
            label="Slug"
            hint="Identificador en la URL"
            error={errors.slug?.message}
            {...register("slug")}
          />

          <Field
            id="domain"
            label="Dominio institucional"
            hint="Sólo se aceptan correos de este dominio"
            placeholder="colegiomacaya.cl"
            error={errors.domain?.message}
            {...register("domain")}
          />
        </CardContent>
      </Card>

      {/* ----------------------- Contacto ----------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contacto e imagen</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            id="phone"
            label="Teléfono"
            placeholder="+56 9 1234 5678"
            error={errors.phone?.message}
            {...register("phone")}
          />

          <Field
            id="address"
            label="Dirección"
            placeholder="Av. Siempre Viva 742, Santiago"
            error={errors.address?.message}
            {...register("address")}
          />

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="logoUrl">Imagen / logo (URL)</Label>
            <Input
              id="logoUrl"
              placeholder="https://…/logo.png"
              {...register("logoUrl")}
            />
            {errors.logoUrl && (
              <p className="text-xs text-destructive">
                {errors.logoUrl.message}
              </p>
            )}
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Vista previa del logo"
                className="mt-1 max-h-24 rounded-md border bg-muted/40 object-contain p-2"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* ----------------------- Redes sociales ----------------------- */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Share2 className="h-4 w-4" aria-hidden />
                Redes sociales y sitios
              </CardTitle>
              <CardDescription>
                Instagram, TikTok, sitio web u otros enlaces del colegio.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({ platform: "instagram", label: "", url: "" })
              }
            >
              <Plus className="h-4 w-4" aria-hidden />
              Agregar enlace
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {fields.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              Sin enlaces registrados.
            </p>
          ) : (
            fields.map((field, index) => {
              const platform = watch(`socialLinks.${index}.platform`);
              return (
                <div
                  key={field.id}
                  className="grid gap-3 rounded-md border p-3 sm:grid-cols-[170px_1fr_auto]"
                >
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Plataforma
                    </Label>
                    <Select
                      value={platform}
                      onValueChange={(value) =>
                        setValue(`socialLinks.${index}.platform`, value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SOCIAL_PLATFORMS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label
                      htmlFor={`social-url-${index}`}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    >
                      <Link2 className="h-3.5 w-3.5" aria-hidden />
                      URL
                    </Label>
                    <Input
                      id={`social-url-${index}`}
                      placeholder="https://instagram.com/tucolegio"
                      {...register(`socialLinks.${index}.url`)}
                    />
                    {errors.socialLinks?.[index]?.url && (
                      <p className="text-xs text-destructive">
                        {errors.socialLinks[index]?.url?.message}
                      </p>
                    )}

                    {platform === "otro" && (
                      <>
                        <Input
                          placeholder="Nombre de la red"
                          className="mt-2"
                          {...register(`socialLinks.${index}.label`)}
                        />
                        {errors.socialLinks?.[index]?.label && (
                          <p className="text-xs text-destructive">
                            {errors.socialLinks[index]?.label?.message}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                      aria-label={`Quitar enlace ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ----------------------- Estado ----------------------- */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          {canDeactivate ? (
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setValue("isActive", event.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span className="text-sm">
                <span className="block font-medium">Colegio activo</span>
                <span className="block text-muted-foreground">
                  Al desactivarlo, sus usuarios no podrán iniciar sesión.
                </span>
              </span>
            </label>
          ) : (
            <span className="text-sm text-muted-foreground">
              Sólo un Super Administrador puede desactivar un colegio.
            </span>
          )}

          <Button type="submit" isLoading={isPending} className="sm:w-auto">
            Guardar cambios
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}

/**
 * forwardRef es obligatorio: `register` inyecta una ref en el input y un
 * componente que no la propague dejaría el campo sin registrar.
 */
const Field = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    id: string;
    label: string;
    hint?: string;
    error?: string;
  }
>(({ id, label, hint, error, className, ...props }, ref) => (
  <div className={cn("space-y-2", className)}>
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} ref={ref} {...props} />
    {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
    {error && <p className="text-xs text-destructive">{error}</p>}
  </div>
));
Field.displayName = "Field";
