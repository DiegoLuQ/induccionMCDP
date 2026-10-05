import type { Metadata } from "next";
import Link from "next/link";
import { Role } from "@prisma/client";
import { MapPin, Pencil, Phone } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { SIN_ASIGNAR, SOCIAL_PLATFORM_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import { formatRut } from "@/lib/rut";
import { listAllInstitutions } from "@/server/queries/institutions";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Colegios" };

/** Vista exclusiva de SUPER_ADMIN: todos los tenants de la plataforma. */
export default async function InstitutionsPage() {
  await requireRole(Role.SUPER_ADMIN);
  const institutions = await listAllInstitutions();

  return (
    <>
      <PageHeader
        title="Colegios"
        description="Todos los establecimientos registrados en la plataforma."
      />

      <Card>
        <CardContent className="px-0 py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colegio</TableHead>
                <TableHead>Identificación</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Redes</TableHead>
                <TableHead>Usuarios</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {institutions.map((institution) => (
                <TableRow key={institution.id}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {institution.logoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={institution.logoUrl}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded border object-contain"
                        />
                      )}
                      <span className="min-w-0">
                        <span className="block font-medium">
                          {institution.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          @{institution.domain}
                        </span>
                      </span>
                    </span>
                  </TableCell>

                  <TableCell className="text-sm">
                    <span className="block">
                      RBD: {institution.rbd || SIN_ASIGNAR}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {institution.rut ? formatRut(institution.rut) : "Sin RUT"}
                    </span>
                  </TableCell>

                  <TableCell className="text-sm">
                    {institution.phone && (
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        {institution.phone}
                      </span>
                    )}
                    {institution.address && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {institution.address}
                      </span>
                    )}
                    {!institution.phone && !institution.address && (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    {institution.socialLinks.length === 0 ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {institution.socialLinks.map((link) => (
                          <a
                            key={link.id}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full border px-2 py-0.5 text-[10px] hover:bg-accent"
                          >
                            {link.label ||
                              SOCIAL_PLATFORM_LABELS[link.platform] ||
                              link.platform}
                          </a>
                        ))}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-sm">
                    <span className="block tabular-nums">
                      {institution._count.users} usuario(s)
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {institution._count.courses} curso(s) · creado{" "}
                      {formatDateTime(institution.createdAt)}
                    </span>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Badge
                        variant={institution.isActive ? "success" : "secondary"}
                      >
                        {institution.isActive ? "Activo" : "Inactivo"}
                      </Badge>
                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={`/configuracion/colegios/${institution.id}/editar`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                          Editar
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
