import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Role } from "@prisma/client";
import { Plus } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getStaffDirectoryWithCourses } from "@/server/queries/funcionarios";
import { getPublishedCourseOptions } from "@/server/queries/courses";
import { getActiveCourse } from "@/lib/active-course";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { SyncFuncionariosButton } from "@/components/admin/sync-funcionarios-button";
import { StaffTable } from "@/components/admin/staff-table";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Funcionarios" };

export default async function StaffPage() {
  const session = await requireRole(Role.SUPER_ADMIN, Role.ADMIN_RRHH);
  const [users, availableCourses, institution] = await Promise.all([
    getStaffDirectoryWithCourses(session.institutionId),
    getPublishedCourseOptions(session.institutionId),
    prisma.institution.findUnique({
      where: { id: session.institutionId },
      select: { name: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Directorio de Funcionarios"
        description={`Gestión de personal, asignación de inducciones y seguimiento de evaluaciones en ${institution?.name ?? "el colegio activo"}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SyncFuncionariosButton
              institutionId={session.institutionId}
              institutionName={institution?.name}
            />
            <Button asChild className="gap-1.5">
              <Link href="/admin/funcionarios/nuevo">
                <Plus className="h-4 w-4" aria-hidden />
                Nuevo funcionario
              </Link>
            </Button>
          </div>
        }
      />

      <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Cargando funcionarios...</div>}>
        <StaffTable
          users={users}
          availableCourses={availableCourses}
          currentUserId={session.sub}
          activeCourseId={(await getActiveCourse(session.institutionId)).activeCourseId}
        />
      </Suspense>
    </>
  );
}

