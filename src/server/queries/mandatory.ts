import "server-only";

import { prisma } from "@/lib/prisma";
import { STAFF_ROLES } from "@/lib/auth/rbac";

export interface MandatoryAreaCompliance {
  areaName: string;
  total: number;
  completed: number;
}

export interface MandatoryCourseCompliance {
  id: string;
  title: string;
  typeName: string | null;
  period: number;
  dueDate: Date | null;
  total: number;
  completed: number;
  inProgress: number;
  percent: number;
  /** Áreas ordenadas de menor a mayor cumplimiento. */
  areas: MandatoryAreaCompliance[];
}

/**
 * Cumplimiento de los cursos obligatorios publicados del colegio en su período
 * vigente: aplica a todos los funcionarios activos y se desglosa por área.
 */
export async function getMandatoryCompliance(institutionId: string): Promise<MandatoryCourseCompliance[]> {
  const [courses, staff] = await Promise.all([
    prisma.course.findMany({
      where: { institutionId, isPublished: true, isMandatory: true },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        currentPeriod: true,
        createdAt: true,
        dueDate: true,
        type: { select: { name: true } },
        progress: { select: { userId: true, status: true } },
      },
    }),
    prisma.user.findMany({
      where: { institutionId, isActive: true, role: { in: STAFF_ROLES } },
      select: { id: true, area: { select: { name: true } } },
    }),
  ]);

  return courses.map((course) => {
    const statusByUser = new Map(course.progress.map((p) => [p.userId, p.status]));
    const areaMap = new Map<string, MandatoryAreaCompliance>();
    let completed = 0;
    let inProgress = 0;

    for (const user of staff) {
      const status = statusByUser.get(user.id);
      const areaName = user.area?.name ?? "Sin área";
      const area = areaMap.get(areaName) ?? { areaName, total: 0, completed: 0 };
      area.total += 1;
      if (status === "COMPLETED") {
        completed += 1;
        area.completed += 1;
      } else if (status === "IN_PROGRESS") {
        inProgress += 1;
      }
      areaMap.set(areaName, area);
    }

    const total = staff.length;
    return {
      id: course.id,
      title: course.title,
      typeName: course.type?.name ?? null,
      period: course.currentPeriod ?? course.createdAt.getFullYear(),
      dueDate: course.dueDate,
      total,
      completed,
      inProgress,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
      areas: [...areaMap.values()].sort(
        (a, b) => a.completed / a.total - b.completed / b.total || a.areaName.localeCompare(b.areaName),
      ),
    };
  });
}
