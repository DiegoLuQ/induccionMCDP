import type { Metadata } from "next";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { listUploadedVideos } from "@/server/queries/videos";
import { PageHeader } from "@/components/shared/page-header";
import { VideoLibrary } from "@/components/admin/video-library";

export const metadata: Metadata = { title: "Videos subidos" };
export const dynamic = "force-dynamic";

/**
 * Vista exclusiva de SUPER_ADMIN: la carpeta de videos es compartida por todos
 * los colegios, así que un video "sin uso" se evalúa contra todas las lecciones.
 */
export default async function VideosPage() {
  await requireRole(Role.SUPER_ADMIN);
  const videos = await listUploadedVideos();

  return (
    <>
      <PageHeader
        title="Videos subidos"
        description="Videos guardados en el servidor. Los que no usa ninguna lección se pueden eliminar para liberar espacio."
      />
      <VideoLibrary videos={videos} />
    </>
  );
}
