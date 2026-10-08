import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isProvisionalEmail } from "@/lib/provisional-email";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { getAccessibleInstitutions } from "@/server/queries/institutions";
import { getActiveCourse } from "@/lib/active-course";
import { DesktopSidebar } from "@/components/layout/sidebar";
import { SidebarProvider } from "@/components/layout/sidebar-state";
import { SIDEBAR_COLLAPSED_COOKIE } from "@/lib/sidebar";
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

  const sidebarCollapsed = (await cookies()).get(SIDEBAR_COLLAPSED_COOKIE)?.value === "1";

  return (
    <SidebarProvider initialCollapsed={sidebarCollapsed}>
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
          {userRecord && isProvisionalEmail(userRecord.corporateEmail || userRecord.email) && (
            <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 lg:px-8">
              Tu correo institucional <strong>{userRecord.corporateEmail || userRecord.email}</strong> es
              provisorio (generado con tu RUT). Por favor cámbialo por tu correo institucional real en{" "}
              <Link href="/perfil" className="font-semibold underline">
                Mi cuenta
              </Link>
              .
            </div>
          )}
          <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
        </div>

        {needsFirstAccessSetup && userRecord && (
          <FirstAccessModal user={userRecord} />
        )}
      </div>
    </SidebarProvider>
  );
}
