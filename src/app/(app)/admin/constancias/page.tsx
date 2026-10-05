import type { Metadata } from "next";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
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
      select: { id: true, title: true },
    }),
    prisma.user.findMany({
      where: { institutionId, role: Role.FUNCIONARIO },
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
        uploadedBy: { select: { name: true } },
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Constancias firmadas"
        description="Busca al funcionario y sube su constancia firmada (PDF o JPG). El archivo se optimiza para ocupar menos espacio."
      />
      <SignedCertificatesManager
        key={institutionId}
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
        }))}
      />
    </>
  );
}
