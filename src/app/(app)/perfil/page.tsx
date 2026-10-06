import type { Metadata } from "next";
import { requireSession, getCurrentUser } from "@/lib/auth/session";
import { ROLE_LABELS, SIN_ASIGNAR } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import { formatRut } from "@/lib/rut";
import { PageHeader } from "@/components/shared/page-header";
import { isAdminRole } from "@/lib/auth/rbac";
import { ChangePasswordForm } from "./change-password-form";
import { ProfileForm } from "./profile-form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = { title: "Mi cuenta" };

export default async function ProfilePage() {
  const session = await requireSession();
  const user = await getCurrentUser();

  return (
    <>
      <PageHeader title="Mi cuenta" description="Tus datos en la plataforma." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos personales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Nombre" value={session.name} />
            <Separator />
            <Row label="RUT" value={user ? formatRut(user.rut) : "—"} />
            <Separator />
            <Row label="Correo" value={user ? user.corporateEmail || user.email : session.email} />
            <Separator />
            <Row label="Rol" value={ROLE_LABELS[session.role]} />
            <Separator />
            <Row
              label="Cargo"
              value={session.positionName ?? SIN_ASIGNAR}
            />
            <Separator />
            <Row label="Colegio" value={user?.institution.name ?? "—"} />
            <Separator />
            <Row
              label="Último ingreso"
              value={formatDateTime(user?.lastLoginAt)}
            />
          </CardContent>
        </Card>

        {user && (
          <ProfileForm
            rut={user.rut}
            email={user.email}
            corporateEmail={user.corporateEmail}
            institutionDomain={user.institution.domain}
            canEditRut={isAdminRole(session.role)}
          />
        )}

        {user?.passwordHash ? (
          <ChangePasswordForm />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Acceso</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Tu cuenta ingresa mediante invitación con PIN temporal, por lo que
              no tiene contraseña asociada.
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
