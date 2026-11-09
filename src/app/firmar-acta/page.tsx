import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, FileSignature, FileText, ShieldAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatRut } from "@/lib/rut";
import { verifySignatureToken } from "@/lib/auth/signature-token";
import { buildCertificateLink } from "@/lib/auth/certificate-token";
import { Button } from "@/components/ui/button";
import { SignByLinkForm } from "./sign-by-link-form";

export const metadata: Metadata = { title: "Firmar acta de constancia", robots: { index: false } };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ t?: string }>;
}

function formatCl(date: Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(date);
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-xl space-y-4 rounded-xl border bg-card p-5 shadow-sm sm:p-6">{children}</div>
    </main>
  );
}

function Notice({ title, message, tone }: { title: string; message: string; tone: "warn" | "ok" }) {
  const Icon = tone === "ok" ? CheckCircle2 : ShieldAlert;
  return (
    <Shell>
      <div className="space-y-4 text-center">
        <div
          className={
            tone === "ok"
              ? "mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600"
              : "mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600"
          }
        >
          <Icon className="h-6 w-6" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">Ir a la plataforma</Link>
        </Button>
      </div>
    </Shell>
  );
}

/**
 * Página pública que abre el enlace enviado al correo personal del funcionario
 * (vigente 24 h). No requiere iniciar sesión: el token identifica al firmante.
 * La firma ocurre sólo al presionar el botón (los escáneres de correo que abren
 * enlaces no firman por accidente).
 */
export default async function SignByLinkPage({ searchParams }: PageProps) {
  const { t } = await searchParams;
  const verified = await verifySignatureToken(t);

  if (!verified.ok) {
    return verified.reason === "expired" ? (
      <Notice
        tone="warn"
        title="El enlace venció"
        message="El enlace para firmar el acta dura 24 horas. Ingresa a la plataforma y, en Mis inducciones, presiona «Firmar acta» para recibir uno nuevo en tu correo personal."
      />
    ) : (
      <Notice tone="warn" title="Enlace no válido" message="El enlace para firmar el acta no es válido." />
    );
  }

  const [user, course, progress, signed] = await Promise.all([
    prisma.user.findUnique({
      where: { id: verified.userId },
      select: { name: true, rut: true, email: true, institutionId: true },
    }),
    prisma.course.findUnique({
      where: { id: verified.courseId },
      select: { id: true, title: true, institutionId: true, institution: { select: { name: true } } },
    }),
    prisma.courseProgress.findUnique({
      where: { userId_courseId: { userId: verified.userId, courseId: verified.courseId } },
      select: { confirmedAt: true },
    }),
    prisma.signedCertificate.findUnique({
      where: {
        userId_courseId_archivedPeriod: {
          userId: verified.userId,
          courseId: verified.courseId,
          archivedPeriod: 0,
        },
      },
      select: { signedOnlineAt: true, createdAt: true },
    }),
  ]);

  if (!user || !course || user.institutionId !== course.institutionId || !progress?.confirmedAt) {
    return <Notice tone="warn" title="Acta no disponible" message="La inducción o el funcionario ya no existen." />;
  }

  if (signed) {
    return (
      <Notice
        tone="ok"
        title="Tu acta ya está firmada"
        message={`Quedó registrada el ${formatCl(signed.signedOnlineAt ?? signed.createdAt)}. Puedes verla en la plataforma, en Mis inducciones.`}
      />
    );
  }

  if (user.email.toLowerCase() !== verified.email.toLowerCase()) {
    return (
      <Notice
        tone="warn"
        title="Enlace no válido"
        message="Este enlace se envió a un correo que ya no es tu correo personal. Solicita uno nuevo desde la plataforma."
      />
    );
  }

  const previewUrl = await buildCertificateLink({ userId: verified.userId, courseId: verified.courseId });

  return (
    <Shell>
      <div className="flex items-start gap-3">
        <FileSignature className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-tight">Firmar acta de constancia</h1>
          <p className="text-sm text-muted-foreground">{course.institution.name}</p>
        </div>
      </div>

      <p className="text-sm">
        Yo, <strong>{user.name.toUpperCase()}</strong>, RUT <strong>{formatRut(user.rut)}</strong>, declaro haber
        participado en la <strong>{course.title}</strong> del <strong>{course.institution.name}</strong>, y asumo el
        compromiso de conocer, cumplir y respetar las normas, procedimientos y políticas institucionales informadas.
      </p>

      <Button asChild variant="outline" size="sm" className="gap-2">
        <a href={previewUrl} target="_blank" rel="noopener">
          <FileText className="h-4 w-4" aria-hidden />
          Revisar la constancia completa (PDF)
        </a>
      </Button>

      <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Enlace válido hasta el {formatCl(verified.expiresAt)}.
      </p>

      <SignByLinkForm token={t!} courseTitle={course.title} name={user.name} email={verified.email} />
    </Shell>
  );
}
