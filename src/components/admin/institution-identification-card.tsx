"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2,
  ExternalLink,
  Globe,
  ImageIcon,
  Loader2,
  MapPin,
  Pencil,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import { SIN_ASIGNAR, SOCIAL_PLATFORM_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import { formatRut } from "@/lib/rut";
import {
  updateInstitutionSchema,
  type UpdateInstitutionInput,
} from "@/lib/validations/institution";
import { updateInstitutionAction } from "@/server/actions/institution-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export interface InstitutionIdentificationData {
  id: string;
  name: string;
  slug: string;
  domain: string;
  logoUrl: string | null;
  rbd: string | null;
  rut: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  socialLinks?: Array<{
    id: string;
    platform: string;
    label: string | null;
    url: string;
    orderIndex: number;
  }>;
}

interface InstitutionIdentificationCardProps {
  institution: InstitutionIdentificationData;
}

export function InstitutionIdentificationCard({
  institution,
}: InstitutionIdentificationCardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const socialLinks = institution.socialLinks ?? [];

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<UpdateInstitutionInput>({
    resolver: zodResolver(updateInstitutionSchema),
    defaultValues: {
      id: institution.id,
      name: institution.name,
      slug: institution.slug,
      domain: institution.domain,
      logoUrl: institution.logoUrl ?? "",
      rbd: institution.rbd ?? "",
      rut: institution.rut ?? "",
      phone: institution.phone ?? "",
      address: institution.address ?? "",
      isActive: institution.isActive,
      socialLinks: socialLinks.map((link) => ({
        id: link.id,
        platform: link.platform,
        label: link.label ?? "",
        url: link.url,
      })),
    },
  });

  const watchLogoUrl = watch("logoUrl");
  const watchRut = watch("rut");

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      reset({
        id: institution.id,
        name: institution.name,
        slug: institution.slug,
        domain: institution.domain,
        logoUrl: institution.logoUrl ?? "",
        rbd: institution.rbd ?? "",
        rut: institution.rut ?? "",
        phone: institution.phone ?? "",
        address: institution.address ?? "",
        isActive: institution.isActive,
        socialLinks: socialLinks.map((link) => ({
          id: link.id,
          platform: link.platform,
          label: link.label ?? "",
          url: link.url,
        })),
      });
    }
    setOpen(nextOpen);
  }

  function onSubmit(values: UpdateInstitutionInput) {
    startTransition(async () => {
      const result = await updateInstitutionAction(values);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message ?? "Datos del colegio actualizados exitosamente.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" aria-hidden />
            Identificación
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            className="h-8 gap-1.5 text-xs font-medium"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Editar datos
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Nombre" value={institution.name} />
          <Separator />
          <Row label="RBD" value={institution.rbd || SIN_ASIGNAR} />
          <Separator />
          <Row
            label="RUT"
            value={institution.rut ? formatRut(institution.rut) : SIN_ASIGNAR}
          />
          <Separator />
          <Row
            label="Dominio permitido"
            value={`@${institution.domain}`}
            icon={<Globe className="h-3.5 w-3.5" aria-hidden />}
          />
          <Separator />
          <Row
            label="Teléfono"
            value={institution.phone || SIN_ASIGNAR}
            icon={<Phone className="h-3.5 w-3.5" aria-hidden />}
          />
          <Separator />
          <Row
            label="Dirección"
            value={institution.address || SIN_ASIGNAR}
            icon={<MapPin className="h-3.5 w-3.5" aria-hidden />}
          />
          <Separator />
          <div className="flex items-center justify-between gap-4 py-0.5">
            <span className="text-muted-foreground">imgurl</span>
            {institution.logoUrl ? (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={institution.logoUrl}
                  alt="Logo institucional"
                  className="h-7 max-w-[80px] rounded border bg-background object-contain p-0.5 shadow-sm"
                />
                <a
                  href={institution.logoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex max-w-[160px] items-center gap-1 truncate text-xs text-primary hover:underline sm:max-w-[220px]"
                  title={institution.logoUrl}
                >
                  <span className="truncate">{institution.logoUrl}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                </a>
              </div>
            ) : (
              <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                {SIN_ASIGNAR}
              </span>
            )}
          </div>
          <Separator />
          <Row label="Creado" value={formatDateTime(institution.createdAt)} />

          {socialLinks.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <span className="text-muted-foreground">Redes sociales</span>
                <div className="flex flex-wrap gap-2">
                  {socialLinks.map((link) => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border px-2.5 py-1 text-xs hover:bg-accent"
                    >
                      {link.label ||
                        SOCIAL_PLATFORM_LABELS[link.platform] ||
                        link.platform}
                    </a>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal de edición */}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Editar datos del colegio
            </DialogTitle>
            <DialogDescription>
              Actualiza la información institucional, contacto y la URL de imagen o logo (imgurl).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <input type="hidden" {...register("id")} />
            <input type="hidden" {...register("isActive")} />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="inst-name" className="text-xs font-semibold">
                  Nombre <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="inst-name"
                  placeholder="Ej. Colegio Diego Portales"
                  {...register("name")}
                />
                {errors.name && (
                  <p className="text-xs text-destructive">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inst-rbd" className="text-xs font-semibold">
                  RBD
                </Label>
                <Input
                  id="inst-rbd"
                  placeholder="Ej. 12345-6"
                  {...register("rbd")}
                />
                {errors.rbd && (
                  <p className="text-xs text-destructive">{errors.rbd.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inst-rut" className="text-xs font-semibold">
                  RUT del establecimiento
                </Label>
                <Input
                  id="inst-rut"
                  placeholder="Ej. 76123456-7"
                  {...register("rut")}
                />
                <p className="text-[11px] text-muted-foreground">
                  {watchRut ? formatRut(watchRut) : "Sin formato"}
                </p>
                {errors.rut && (
                  <p className="text-xs text-destructive">{errors.rut.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inst-domain" className="text-xs font-semibold">
                  Dominio permitido <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="inst-domain"
                  placeholder="colegiodiegoportales.cl"
                  {...register("domain")}
                />
                {errors.domain && (
                  <p className="text-xs text-destructive">{errors.domain.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inst-slug" className="text-xs font-semibold">
                  Slug (URL) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="inst-slug"
                  placeholder="colegio-diego-portales"
                  {...register("slug")}
                />
                {errors.slug && (
                  <p className="text-xs text-destructive">{errors.slug.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inst-phone" className="text-xs font-semibold">
                  Teléfono
                </Label>
                <Input
                  id="inst-phone"
                  placeholder="+56 9 1234 5678"
                  {...register("phone")}
                />
                {errors.phone && (
                  <p className="text-xs text-destructive">{errors.phone.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inst-address" className="text-xs font-semibold">
                  Dirección
                </Label>
                <Input
                  id="inst-address"
                  placeholder="Av. Principal 123"
                  {...register("address")}
                />
                {errors.address && (
                  <p className="text-xs text-destructive">{errors.address.message}</p>
                )}
              </div>

              {/* Campo imgurl */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="inst-logoUrl" className="text-xs font-semibold">
                  imgurl (URL de imagen o logo)
                </Label>
                <Input
                  id="inst-logoUrl"
                  placeholder="https://ejemplo.com/logo.png o /logos/colegio.png"
                  {...register("logoUrl")}
                />
                {errors.logoUrl && (
                  <p className="text-xs text-destructive">{errors.logoUrl.message}</p>
                )}

                {watchLogoUrl && (
                  <div className="mt-2 flex items-center gap-3 rounded-lg border bg-muted/30 p-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={watchLogoUrl}
                      alt="Vista previa imgurl"
                      className="h-12 w-auto max-w-[120px] rounded border bg-background object-contain p-1 shadow-sm"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="font-medium text-foreground">Vista previa</p>
                      <p className="truncate text-muted-foreground">{watchLogoUrl}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending} className="gap-1.5">
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Guardar cambios
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 font-medium">
        {icon}
        {value}
      </span>
    </div>
  );
}
