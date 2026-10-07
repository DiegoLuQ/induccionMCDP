import type { Role } from "@prisma/client";
import { MobileSidebar } from "./sidebar";
import { UserMenu } from "./user-menu";
import type { InstitutionOption } from "./institution-switcher";
import { CourseSwitcher, type CourseSwitcherOption } from "./course-switcher";

interface HeaderProps {
  name: string;
  email: string;
  role: Role;
  positionSlug: string | null;
  positionName: string | null;
  institutions: InstitutionOption[];
  activeInstitutionId: string;
  /** Cursos para el selector global de "Inducción activa" (vacío = no se muestra). */
  courses: CourseSwitcherOption[];
  activeCourseId: string | null;
}

export function Header({
  name,
  email,
  role,
  positionSlug,
  positionName,
  institutions,
  activeInstitutionId,
  courses,
  activeCourseId,
}: HeaderProps) {
  const active = institutions.find((i) => i.id === activeInstitutionId);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <MobileSidebar
          role={role}
          positionSlug={positionSlug}
          institutions={institutions}
          activeInstitutionId={activeInstitutionId}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {active?.name ?? "Colegio"}
          </p>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">
            Panel de inducción y capacitación
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {courses.length > 0 && <CourseSwitcher courses={courses} activeCourseId={activeCourseId} />}
        <UserMenu
          name={name}
          email={email}
          role={role}
          positionName={positionName}
        />
      </div>
    </header>
  );
}
