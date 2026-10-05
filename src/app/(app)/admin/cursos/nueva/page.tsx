import type { Metadata } from "next";
import Link from "next/link";
import { Role } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getAccessibleInstitutions } from "@/server/queries/institutions";
import { getCategories, getTags } from "@/server/queries/courses";
import { getCourseTypes, getPositions } from "@/server/queries/catalog";
import { PageHeader } from "@/components/shared/page-header";
import { CourseForm } from "@/components/admin/course-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Nueva inducción" };

export default async function NewCoursePage() {
  const session = await requireRole(Role.SUPER_ADMIN, Role.ADMIN_RRHH);

  const [institutions, categories, tags, courseTypes, positions] =
    await Promise.all([
      getAccessibleInstitutions(session.institutionIds),
      getCategories(session.institutionId),
      getTags(session.institutionId),
      getCourseTypes(session.institutionId, true),
      getPositions(session.institutionId, true),
    ]);

  return (
    <>
      <PageHeader
        title="Nueva inducción o capacitación"
        description="Define el contenido, su clasificación y a qué colegio pertenece."
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/cursos">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Volver
            </Link>
          </Button>
        }
      />

      <div className="max-w-4xl">
        <CourseForm
          institutions={institutions.map((i) => ({ id: i.id, name: i.name }))}
          activeInstitutionId={session.institutionId}
          categories={categories}
          existingTags={tags}
          courseTypes={courseTypes.map((t) => ({
            id: t.id,
            name: t.name,
            color: t.color,
          }))}
          positions={positions.map((p) => ({ id: p.id, name: p.name }))}
        />
      </div>
    </>
  );
}
