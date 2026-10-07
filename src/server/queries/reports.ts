import "server-only";

import { prisma } from "@/lib/prisma";
import { STAFF_ROLES } from "@/lib/auth/rbac";

export type ComplianceStatus = "COMPLETED" | "IN_PROGRESS" | "PENDING" | "FAILED" | "NOT_ASSIGNED";

export interface ComplianceCourse {
  id: string;
  title: string;
  typeName: string | null;
  isMandatory: boolean;
  /** Período vigente del curso. */
  period: number;
  /** Períodos cerrados con historial disponible (más reciente primero). */
  pastPeriods: number[];
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
  /** Constancia firmada subida por curso (courseId -> datos). */
  signed: Record<string, { id: string; isPdf: boolean }>;
  /** Historial de períodos cerrados: "courseId:período" -> resultado. */
  history: Record<
    string,
    { status: Exclude<ComplianceStatus, "NOT_ASSIGNED">; completedAt: Date | null; finalScore: number | null }
  >;
  /** Constancias firmadas archivadas: "courseId:período" -> datos. */
  signedHistory: Record<string, { id: string; isPdf: boolean }>;
}

/** Minúsculas, sin tildes y con espacios simples, para comparar nombres y correos. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function splitList(value: string | null): string[] {
  return (value ?? "")
    .split(/[,;\n]+/)
    .map(normalize)
    .filter(Boolean);
}

/**
 * Áreas del colegio donde el usuario figura como jefatura. La jefatura se
 * registra como texto (nombre/correo), así que se compara por cualquiera de
 * sus correos o por su nombre completo.
 */
export async function getManagedAreas(
  institutionId: string,
  userId: string,
): Promise<Array<{ id: string; name: string }>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, corporateEmail: true },
  });
  if (!user) return [];
  const emails = [user.email, user.corporateEmail].filter((e): e is string => Boolean(e)).map(normalize);
  const name = normalize(user.name);

  const areas = await prisma.area.findMany({
    where: { institutionId },
    select: { id: true, name: true, jefeEmail: true, jefeNombre: true },
    orderBy: { name: "asc" },
  });
  return areas
    .filter(
      (a) =>
        splitList(a.jefeEmail).some((e) => emails.includes(e)) ||
        splitList(a.jefeNombre).includes(name),
    )
    .map((a) => ({ id: a.id, name: a.name }));
}

/**
 * Datos de sólo lectura para el reporte de cumplimiento: cursos publicados y
 * funcionarios activos del colegio con su estado en cada curso. No expone
 * tokens, correos ni datos de contacto. Con `areaIds` se limita a esas áreas.
 */
export async function getComplianceReport(
  institutionId: string,
  options: { areaIds?: string[] } = {},
): Promise<{
  courses: ComplianceCourse[];
  rows: ComplianceRow[];
}> {
  const [courses, users] = await Promise.all([
    prisma.course.findMany({
      where: { institutionId, isPublished: true },
      // Obligatorios primero.
      orderBy: [{ isMandatory: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        isMandatory: true,
        currentPeriod: true,
        createdAt: true,
        type: { select: { name: true } },
        progressHistory: { distinct: ["period"], select: { period: true }, orderBy: { period: "desc" } },
      },
    }),
    prisma.user.findMany({
      where: {
        institutionId,
        isActive: true,
        role: { in: STAFF_ROLES },
        ...(options.areaIds ? { areaId: { in: options.areaIds } } : {}),
      },
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
        signedCertificates: {
          select: { id: true, courseId: true, mimeType: true, archivedPeriod: true },
        },
        progressHistory: {
          select: { courseId: true, period: true, status: true, completedAt: true, finalScore: true },
        },
      },
    }),
  ]);

  return {
    courses: courses.map((c) => ({
      id: c.id,
      title: c.title,
      typeName: c.type?.name ?? null,
      isMandatory: c.isMandatory,
      period: c.currentPeriod ?? c.createdAt.getFullYear(),
      pastPeriods: c.progressHistory.map((h) => h.period),
    })),
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
      signed: Object.fromEntries(
        u.signedCertificates
          .filter((s) => s.archivedPeriod === 0)
          .map((s) => [s.courseId, { id: s.id, isPdf: s.mimeType === "application/pdf" }]),
      ),
      history: Object.fromEntries(
        u.progressHistory.map((h) => [
          `${h.courseId}:${h.period}`,
          { status: h.status, completedAt: h.completedAt, finalScore: h.finalScore },
        ]),
      ),
      signedHistory: Object.fromEntries(
        u.signedCertificates
          .filter((s) => s.archivedPeriod > 0)
          .map((s) => [`${s.courseId}:${s.archivedPeriod}`, { id: s.id, isPdf: s.mimeType === "application/pdf" }]),
      ),
    })),
  };
}
