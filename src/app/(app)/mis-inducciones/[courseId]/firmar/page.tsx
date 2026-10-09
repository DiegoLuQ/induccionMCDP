import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileSignature, FileText } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatRut } from "@/lib/rut";
import { PageHeader } from "@/components/shared/page-header";
import { SignCertificateForm } from "@/components/player/sign-certificate-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Firmar constancia" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ courseId: string }>;
}

function formatCl(date: Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(date);
}

/**
 * Firma en línea de la constancia. Siempre muestra y firma la del usuario de
 * la sesión: si otra persona abre el enlace, ve (y firma) sólo la suya.
 */
export default async function SignCertificatePage({ params }: PageProps) {
  const { courseId } = await params;
  const session = await requireSession();

  const [course, user, progress, signed] = await Promise.all([
    prisma.course.findFirst({
      where: { id: courseId, institutionId: session.institutionId },
      select: { id: true, title: true, institution: { select: { name: true } } },
    }),
    prisma.user.findUnique({
      where: { id: session.sub },
      select: { name: true, rut: true, email: true },
    }),
    prisma.courseProgress.findUnique({
      where: { userId_courseId: { userId: session.sub, courseId } },
      select: { confirmedAt: true },
    }),
    prisma.signedCertificate.findUnique({
      where: {
        userId_courseId_archivedPeriod: { userId: session.sub, courseId, archivedPeriod: 0 },
      },
      select: { id: true, signedOnlineAt: true, createdAt: true },
    }),
  ]);

  if (!course || !user) notFound();

  const previewUrl = `/api/constancia/descargar?userId=${session.sub}&courseId=${course.id}`;

  return (
    <>
      <PageHeader
        title="Firmar Constancia de Participación"
        description={course.title}
        actions={
          <Button asChild variant="outline">
            <Link href={`/mis-inducciones/${course.id}`}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Volver
            </Link>
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-xl space-y-4">
        {signed ? (
          <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                  Tu constancia ya está firmada y registrada
                </p>
                <p className="text-sm text-muted-foreground">
                  {signed.signedOnlineAt
                    ? `Firmada en línea el ${formatCl(signed.signedOnlineAt)}.`
                    : `Recursos Humanos registró tu constancia firmada en papel el ${formatCl(signed.createdAt)}.`}
                </p>
              </div>
            </div>
            <Button asChild className="w-full gap-2 sm:w-auto">
              <a href={`/api/constancias-firmadas/${signed.id}`} target="_blank" rel="noopener">
                <FileText className="h-4 w-4" aria-hidden />
                Ver mi constancia firmada
              </a>
            </Button>
          </div>
        ) : !progress?.confirmedAt ? (
          <div className="space-y-3 rounded-xl border bg-muted/30 p-5">
            <p className="font-semibold">Aún no puedes firmar</p>
            <p className="text-sm text-muted-foreground">
              Primero termina la inducción y presiona &quot;Confirmar término&quot;. Después podrás firmar
              tu constancia aquí.
            </p>
            <Button asChild variant="outline">
              <Link href={`/mis-inducciones/${course.id}`}>Ir a la inducción</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4 rounded-xl border p-5">
            <div className="flex items-start gap-3">
              <FileSignature className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="space-y-1 text-sm">
                <p>
                  Yo, <strong>{user.name.toUpperCase()}</strong>, RUT{" "}
                  <strong>{formatRut(user.rut)}</strong>, declaro haber participado en la{" "}
                  <strong>{course.title}</strong> del <strong>{course.institution.name}</strong>, y
                  asumo el compromiso de conocer, cumplir y respetar las normas, procedimientos y
                  políticas institucionales informadas.
                </p>
              </div>
            </div>

            <Button asChild variant="outline" size="sm" className="gap-2">
              <a href={previewUrl} target="_blank" rel="noopener">
                <FileText className="h-4 w-4" aria-hidden />
                Revisar la constancia completa (PDF)
              </a>
            </Button>

            <SignCertificateForm courseId={course.id} courseTitle={course.title} email={user.email} />
          </div>
        )}
      </div>
    </>
  );
}
