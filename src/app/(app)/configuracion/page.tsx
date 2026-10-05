import type { Metadata } from "next";
import { Role } from "@prisma/client";
import { Mail } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import {
  MAX_INVITATION_TTL_HOURS,
  MIN_INVITATION_TTL_HOURS,
} from "@/lib/constants";
import { getInstitution } from "@/server/queries/institutions";
import { getPublishedCourseOptions } from "@/server/queries/courses";
import { getAutoInvitationConfig } from "@/server/services/auto-invitation-service";
import { PageHeader } from "@/components/shared/page-header";
import { InstitutionIdentificationCard } from "@/components/admin/institution-identification-card";
import { AutoInvitationSettings } from "@/components/admin/auto-invitation-settings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = { title: "Mi colegio" };

export default async function InstitutionSettingsPage() {
  const session = await requireRole(Role.SUPER_ADMIN, Role.ADMIN_RRHH);
  const [institution, courses, autoConfig] = await Promise.all([
    getInstitution(session.institutionId),
    getPublishedCourseOptions(session.institutionId),
    getAutoInvitationConfig(session.institutionId),
  ]);

  if (!institution) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          No se encontró el colegio activo.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="Mi colegio"
        description="Configuración del tenant activo y automatizaciones."
      />

      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <InstitutionIdentificationCard institution={institution} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4" aria-hidden />
              Reglas de invitación
            </CardTitle>
            <CardDescription>
              Parámetros de seguridad aplicados a los accesos temporales.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row
              label="Vigencia del PIN"
              value={`${MIN_INVITATION_TTL_HOURS} a ${MAX_INVITATION_TTL_HOURS} horas`}
            />
            <Separator />
            <Row label="Uso del enlace" value="Único (se invalida al canjearse)" />
            <Separator />
            <Row label="Intentos de PIN" value="5 antes de bloquear" />
            <Separator />
            <Row
              label="Correos aceptados"
              value="Cualquier dominio"
            />
          </CardContent>
        </Card>
        </div>

        <AutoInvitationSettings
          initialConfig={autoConfig}
          courses={courses}
        />
      </div>
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
