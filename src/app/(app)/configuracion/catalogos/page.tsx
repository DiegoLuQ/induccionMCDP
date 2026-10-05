import type { Metadata } from "next";
import { Role } from "@prisma/client";
import { Briefcase, Building2, GraduationCap } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getAreas, getCourseTypes, getPositions, getStaffWithoutJefatura } from "@/server/queries/catalog";
import { getActiveFuncionariosForInstitution } from "@/server/queries/funcionarios";
import { getInstitution } from "@/server/queries/institutions";
import {
  createAreaAction,
  createCourseTypeAction,
  createPositionAction,
  deleteAreaAction,
  deleteCourseTypeAction,
  deletePositionAction,
  updateAreaAction,
  updateCourseTypeAction,
  updatePositionAction,
} from "@/server/actions/catalog-actions";
import { PageHeader } from "@/components/shared/page-header";
import { CatalogManager } from "@/components/admin/catalog-manager";
import { StaffWithoutJefaturaBanner } from "@/components/admin/staff-without-jefatura-banner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Cargos y tipos" };

export default async function CatalogsPage() {
  const session = await requireRole(Role.SUPER_ADMIN, Role.ADMIN_RRHH);

  const [institution, positions, courseTypes, areas, funcionarios, staffWithoutJefe] = await Promise.all([
    getInstitution(session.institutionId),
    getPositions(session.institutionId),
    getCourseTypes(session.institutionId),
    getAreas(session.institutionId),
    getActiveFuncionariosForInstitution(session.institutionId),
    getStaffWithoutJefatura(session.institutionId),
  ]);

  return (
    <>
      <PageHeader
        title={`Catálogos · ${institution?.name ?? "Colegio"}`}
        description="Cargos, áreas con sus jefaturas y tipos de curso del colegio activo. Para ver los de otro colegio, cámbialo en el selector superior."
      />

      <div className="max-w-4xl" key={`banner-${session.institutionId}`}>
        <StaffWithoutJefaturaBanner staff={staffWithoutJefe} />
      </div>

      {/* key: al cambiar de colegio se descartan ediciones/expansiones del colegio anterior */}
      <Tabs key={session.institutionId} defaultValue="cargos" className="space-y-6 max-w-4xl">
        <TabsList className="grid w-full grid-cols-3 h-12 p-1 bg-muted/60">
          <TabsTrigger value="cargos" className="gap-2 text-xs sm:text-sm font-medium py-2">
            <Briefcase className="h-4 w-4 text-primary shrink-0" />
            <span>Cargos</span>
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-5">
              {positions.length}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="areas" className="gap-2 text-xs sm:text-sm font-medium py-2">
            <Building2 className="h-4 w-4 text-primary shrink-0" />
            <span>Áreas y Jefaturas</span>
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-5">
              {areas.length}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="tipos" className="gap-2 text-xs sm:text-sm font-medium py-2">
            <GraduationCap className="h-4 w-4 text-primary shrink-0" />
            <span>Tipos de Curso</span>
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-5">
              {courseTypes.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cargos" className="focus-visible:outline-none">
          <CatalogManager
            title="Cargos Institucionales"
            description="Cargos a los que pertenece un funcionario y a los que se pueden dirigir los cursos."
            institutionId={session.institutionId}
            items={positions.map((position) => ({
              id: position.id,
              name: position.name,
              slug: position.slug,
              description: position.description,
              orderIndex: position.orderIndex,
              isActive: position.isActive,
              usage: position._count.users,
              usageLabel: "funcionario(s)",
              users: position.users.map((u) => ({
                id: u.id,
                name: u.name,
                rut: u.rut,
                email: u.email,
                positionName: position.name,
                areaName: u.area?.name ?? null,
              })),
            }))}
            onCreate={createPositionAction}
            onUpdate={updatePositionAction}
            onDelete={deletePositionAction}
          />
        </TabsContent>

        <TabsContent value="areas" className="focus-visible:outline-none">
          <CatalogManager
            title="Áreas y Departamentos"
            description="Estructura interna del colegio. Permite registrar las jefaturas y asistentes para la distribución automática de inducciones."
            institutionId={session.institutionId}
            isArea
            funcionarios={funcionarios}
            allPositions={positions.map((p) => ({ id: p.id, name: p.name }))}
            items={areas.map((area) => ({
              id: area.id,
              name: area.name,
              slug: area.slug,
              description: area.description,
              jefeNombre: area.jefeNombre,
              jefeRut: area.jefeRut,
              jefeEmail: area.jefeEmail,
              asistenteEmail: area.asistenteEmail,
              orderIndex: area.orderIndex,
              isActive: area.isActive,
              usage: area._count.users,
              usageLabel: "funcionario(s)",
              users: area.users.map((u) => ({
                id: u.id,
                name: u.name,
                rut: u.rut,
                email: u.email,
                positionId: u.positionId ?? null,
                positionName: u.position?.name ?? null,
              })),
            }))}
            onCreate={createAreaAction}
            onUpdate={updateAreaAction}
            onDelete={deleteAreaAction}
          />
        </TabsContent>

        <TabsContent value="tipos" className="focus-visible:outline-none">
          <CatalogManager
            title="Tipos de Contenido"
            description="Clasificación principal del contenido educativo: Inducción, Capacitación, u otras categorías que definas."
            institutionId={session.institutionId}
            withColor
            items={courseTypes.map((courseType) => ({
              id: courseType.id,
              name: courseType.name,
              slug: courseType.slug,
              description: courseType.description,
              color: courseType.color,
              orderIndex: courseType.orderIndex,
              isActive: courseType.isActive,
              usage: courseType._count.courses,
              usageLabel: "curso(s)",
            }))}
            onCreate={createCourseTypeAction}
            onUpdate={updateCourseTypeAction}
            onDelete={deleteCourseTypeAction}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
