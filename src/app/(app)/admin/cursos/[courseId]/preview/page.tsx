import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { ArrowLeft, Eye } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getCoursePreviewData } from "@/server/queries/courses";
import { PageHeader } from "@/components/shared/page-header";
import { CoursePlayer } from "@/components/player/course-player";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ courseId: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { courseId } = await params;
  const session = await requireRole(Role.SUPER_ADMIN, Role.ADMIN_RRHH);
  const course = await getCoursePreviewData(
    courseId,
    session.sub,
    session.institutionId,
  );
  return { title: course ? `Vista previa: ${course.title}` : "Vista previa" };
}

export default async function CoursePreviewPage({ params }: PageProps) {
  const { courseId } = await params;
  const session = await requireRole(Role.SUPER_ADMIN, Role.ADMIN_RRHH);

  const course = await getCoursePreviewData(
    courseId,
    session.sub,
    session.institutionId,
  );

  if (!course) notFound();

  return (
    <>
      <PageHeader
        title={course.title}
        description={course.description ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <Eye className="h-3 w-3" aria-hidden />
              Vista previa
            </Badge>
            <Button asChild variant="outline">
              <Link href={`/admin/cursos/${courseId}`}>
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Volver al detalle
              </Link>
            </Button>
          </div>
        }
      />

      <CoursePlayer course={course} isPreview />
    </>
  );
}
