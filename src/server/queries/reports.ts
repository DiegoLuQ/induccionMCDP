import "server-only";

import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ComplianceStatus = "COMPLETED" | "IN_PROGRESS" | "PENDING" | "FAILED" | "NOT_ASSIGNED";

export interface ComplianceCourse {
  id: string;
  title: string;
  typeName: string | null;
}

export interface ComplianceRow {
  id: string;
  name: string;
  rut: string;
  hireDate: Date | null;
  positionName: string | null;
  areaName: string | null;
  /** Estado por curso (courseId -> estado). Ausente = no asignado. */
  progress: Record<
    string,
    { status: Exclude<ComplianceStatus, "NOT_ASSIGNED">; completedAt: Date | null; finalScore: number | null }
  >;
}

/**
 * Datos de sólo lectura para el reporte de cumplimiento: cursos publicados y
 * funcionarios activos del colegio con su estado en cada curso. No expone
 * tokens, correos ni datos de contacto.
 */
export async function getComplianceReport(institutionId: string): Promise<{
  courses: ComplianceCourse[];
  rows: ComplianceRow[];
}> {
  const [courses, users] = await Promise.all([
    prisma.course.findMany({
      where: { institutionId, isPublished: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, type: { select: { name: true } } },
    }),
    prisma.user.findMany({
      where: { institutionId, isActive: true, role: Role.FUNCIONARIO },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        rut: true,
        hireDate: true,
        position: { select: { name: true } },
        area: { select: { name: true } },
        courseProgress: {
          where: { course: { institutionId, isPublished: true } },
          select: { courseId: true, status: true, completedAt: true, finalScore: true },
        },
      },
    }),
  ]);

  return {
    courses: courses.map((c) => ({ id: c.id, title: c.title, typeName: c.type?.name ?? null })),
    rows: users.map((u) => ({
      id: u.id,
      name: u.name,
      rut: u.rut,
      hireDate: u.hireDate,
      positionName: u.position?.name ?? null,
      areaName: u.area?.name ?? null,
      progress: Object.fromEntries(
        u.courseProgress.map((p) => [
          p.courseId,
          { status: p.status, completedAt: p.completedAt, finalScore: p.finalScore },
        ]),
      ),
    })),
  };
}
