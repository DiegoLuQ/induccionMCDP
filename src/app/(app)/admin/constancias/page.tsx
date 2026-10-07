import type { Metadata } from "next";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { STAFF_ROLES } from "@/lib/auth/rbac";
import { listOrphanSignedFiles } from "@/server/services/signed-certificate-files";
import { PageHeader } from "@/components/shared/page-header";
import { SignedCertificatesManager } from "@/components/admin/signed-certificates-manager";

export const metadata: Metadata = { title: "Constancias firmadas" };
export const dynamic = "force-dynamic";

export default async function SignedCertificatesPage() {
  const session = await requireRole(Role.SUPER_ADMIN, Role.ADMIN_RRHH);
  const institutionId = session.institutionId;

  const [courses, users, certificates] = await Promise.all([
    prisma.course.findMany({
      where: { institutionId },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, isPublished: true },
    }),
    prisma.user.findMany({
      where: { institutionId, role: { in: STAFF_ROLES } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        rut: true,
        isActive: true,
        area: { select: { name: true } },
        courseProgress: { select: { courseId: true, status: true } },
      },
    }),
    prisma.signedCertificate.findMany({
      where: { institutionId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        userId: true,
        courseId: true,
        originalName: true,
        mimeType: true,
        size: true,
        originalSize: true,
        updatedAt: true,
        archivedPeriod: true,
        uploadedBy: { select: { name: true } },
      },
    }),
  ]);

  // Archivos sin registro (p. ej. de un curso o funcionario eliminado): sólo
  // SUPER_ADMIN, porque la carpeta es compartida por todos los colegios.
  const isSuperAdmin = session.role === Role.SUPER_ADMIN;
  const orphans = isSuperAdmin
    ? await listOrphanSignedFiles(
        new Set((await prisma.signedCertificate.findMany({ select: { fileName: true } })).map((r) => r.fileName)),
      )
    : [];

  return (
    <>
      <PageHeader
        title="Constancias firmadas"
        description="Busca al funcionario y sube su constancia firmada (PDF o JPG). El archivo se optimiza para ocupar menos espacio."
      />
      <SignedCertificatesManager
        key={institutionId}
        canManageOrphans={isSuperAdmin}
        orphans={orphans}
        courses={courses}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          rut: u.rut,
          isActive: u.isActive,
          areaName: u.area?.name ?? null,
          progress: Object.fromEntries(u.courseProgress.map((p) => [p.courseId, p.status])),
        }))}
        certificates={certificates.map((c) => ({
          id: c.id,
          userId: c.userId,
          courseId: c.courseId,
          originalName: c.originalName,
          isPdf: c.mimeType === "application/pdf",
          size: c.size,
          originalSize: c.originalSize,
          updatedAt: c.updatedAt,
          uploadedByName: c.uploadedBy?.name ?? null,
          archivedPeriod: c.archivedPeriod,
        }))}
      />
    </>
  );
}
