import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import type { CreateCourseInput } from "@/lib/validations/course";
import { getAccessibleInstitutions } from "@/server/queries/institutions";
import {
  getCategories,
  getCourseForAdmin,
  getTags,
} from "@/server/queries/courses";
import { getCourseTypes, getPositions } from "@/server/queries/catalog";
import { PageHeader } from "@/components/shared/page-header";
import { CourseForm } from "@/components/admin/course-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Editar curso" };

interface PageProps {
  params: Promise<{ courseId: string }>;
}

export default async function EditCoursePage({ params }: PageProps) {
  const { courseId } = await params;
  const session = await requireRole(Role.SUPER_ADMIN, Role.ADMIN_RRHH);

  const [course, institutions, categories, tags, courseTypes, positions] =
    await Promise.all([
      getCourseForAdmin(courseId, session.institutionId),
      getAccessibleInstitutions(session.institutionIds),
      getCategories(session.institutionId),
      getTags(session.institutionId),
      getCourseTypes(session.institutionId, true),
      getPositions(session.institutionId, true),
    ]);

  if (!course) notFound();

  const initialValues: CreateCourseInput = {
    institutionId: course.institutionId,
    title: course.title,
    description: course.description ?? "",
    typeId: course.typeId ?? "",
    videoFormat: course.videoFormat,
    categoryId: course.categoryId ?? "",
    tags: course.tags.map((tag) => tag.name),
    isSequential: course.isSequential,
    targetPositionIds: course.targetPositions.map((position) => position.id),
    isPublished: course.isPublished,
    modules: course.modules.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description ?? "",
      orderIndex: m.orderIndex,
      lessons: m.lessons.map((l) => ({
        id: l.id,
        moduleId: m.id,
        title: l.title,
        description: l.description ?? "",
        videoUrl: l.videoUrl,
        durationSeconds: l.durationSeconds,
        orderIndex: l.orderIndex,
        isActive: l.isActive,
      })),
    })),
    lessons: course.lessons.map((lesson) => ({
      id: lesson.id,
      moduleId: lesson.moduleId ?? "",
      moduleTitle: lesson.module?.title ?? "",
      title: lesson.title,
      description: lesson.description ?? "",
      videoUrl: lesson.videoUrl,
      durationSeconds: lesson.durationSeconds,
      orderIndex: lesson.orderIndex,
      isActive: lesson.isActive,
    })),
  };

  return (
    <>
      <PageHeader
        title="Editar curso"
        description={course.title}
        actions={
          <Button asChild variant="outline">
            <Link href={`/admin/cursos/${course.id}`}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Volver
            </Link>
          </Button>
        }
      />

      <div className="max-w-4xl">
        <CourseForm
          mode="edit"
          courseId={course.id}
          initialValues={initialValues}
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
