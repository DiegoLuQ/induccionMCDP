import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { getCoursePlayerData } from "@/server/queries/courses";
import { PageHeader } from "@/components/shared/page-header";
import { CoursePlayer } from "@/components/player/course-player";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ courseId: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { courseId } = await params;
  const session = await requireSession();
  const course = await getCoursePlayerData(
    courseId,
    session.sub,
    session.institutionId,
  );
  return { title: course?.title ?? "Inducción" };
}

export default async function CoursePlayerPage({ params }: PageProps) {
  const { courseId } = await params;
  const session = await requireSession();

  const course = await getCoursePlayerData(
    courseId,
    session.sub,
    session.institutionId,
  );

  // 404 también cuando el curso pertenece a otro colegio: no filtramos su
  // existencia entre tenants.
  if (!course) notFound();

  // El paso a IN_PROGRESS lo dispara el reproductor (no se muta en el render).

  return (
    <>
      <PageHeader
        title={course.title}
        actions={
          <Button asChild variant="outline">
            <Link href="/mis-inducciones">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Volver
            </Link>
          </Button>
        }
      />

      <CoursePlayer course={course} />
    </>
  );
}
