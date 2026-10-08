import type { Metadata } from "next";
import { Role } from "@prisma/client";
import { requireSession } from "@/lib/auth/session";
import { getTutorialPositionOptions, getTutorialsForSession } from "@/server/queries/tutorials";
import { PageHeader } from "@/components/shared/page-header";
import { TutorialsView } from "@/components/tutorials/tutorials-view";

export const metadata: Metadata = { title: "Tutoriales" };
export const dynamic = "force-dynamic";

/**
 * Tutoriales de uso de la plataforma. Todos los roles entran; cada uno ve sólo
 * los que aplican a su rol y cargo. El SUPER_ADMIN los administra aquí mismo.
 */
export default async function TutorialsPage() {
  const session = await requireSession();
  const canManage = session.role === Role.SUPER_ADMIN;
  const [tutorials, positions] = await Promise.all([
    getTutorialsForSession(session),
    canManage ? getTutorialPositionOptions() : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Tutoriales"
        description={
          canManage
            ? "Videos para aprender a usar la plataforma. Tú ves todos; cada usuario ve sólo los de su rol y cargo."
            : "Videos para aprender a usar la plataforma."
        }
      />
      <TutorialsView tutorials={tutorials} canManage={canManage} positions={positions} />
    </>
  );
}
