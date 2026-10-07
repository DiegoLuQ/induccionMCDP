import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { getAccessibleInstitutions } from "@/server/queries/institutions";
import { getActiveCourse } from "@/lib/active-course";
import { DesktopSidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { FirstAccessModal } from "@/components/auth/first-access-modal";

/**
 * Layout de todas las vistas autenticadas.
 * La protección es de doble capa: middleware (edge) + esta verificación de
 * sesión en el servidor antes de renderizar cualquier dato.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession();
  const institutions = await getAccessibleInstitutions(session.institutionIds);

  // El colegio activo dejó de estar disponible (desactivado o revocado).
  if (!institutions.some((i) => i.id === session.institutionId)) {
    if (institutions.length === 0) redirect("/denegado");
  }

  const activeInstitutionId =
    institutions.find((i) => i.id === session.institutionId)?.id ??
    institutions[0]!.id;

  // Verificar si el usuario funcionario ingresa por primera vez sin clave configurada
  const userRecord = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      name: true,
      rut: true,
      email: true,
      corporateEmail: true,
      passwordHash: true,
      institution: { select: { name: true, domain: true } },
    },
  });

  const needsFirstAccessSetup = Boolean(userRecord && !userRecord.passwordHash);

  // Selector global de "Inducción activa" (no aplica a funcionarios).
  const activeCourse =
    session.role === Role.FUNCIONARIO ? null : await getActiveCourse(activeInstitutionId);

  return (
    <div className="flex min-h-screen">
      <DesktopSidebar
        role={session.role}
        positionSlug={session.positionSlug}
        institutions={institutions}
        activeInstitutionId={activeInstitutionId}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          name={session.name}
          email={session.email}
          role={session.role}
          positionSlug={session.positionSlug}
          positionName={session.positionName}
          institutions={institutions}
          activeInstitutionId={activeInstitutionId}
          courses={activeCourse?.courses ?? []}
          activeCourseId={activeCourse?.activeCourseId ?? null}
        />
        <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>

      {needsFirstAccessSetup && userRecord && (
        <FirstAccessModal user={userRecord} />
      )}
    </div>
  );
}
