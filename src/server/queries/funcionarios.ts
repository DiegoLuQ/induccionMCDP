import "server-only";

import { cache } from "react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface SearchFuncionarioItem {
  id: string;
  rut: string;
  name: string;
  email: string;
  corporateEmail: string | null;
  phone: string | null;
  positionId: string | null;
  positionName: string | null;
  areaId: string | null;
  areaName: string | null;
  jefeNombre: string | null;
  jefeRut: string | null;
  jefeEmail: string | null;
  asistenteEmail: string | null;
  isActive: boolean;
  coursesCount: number;
}

/**
 * Consulta de funcionarios activos de una institución con su cargo y área (y jefatura)
 */
export const getActiveFuncionariosForInstitution = cache(
  async (institutionId: string): Promise<SearchFuncionarioItem[]> => {
    const users = await prisma.user.findMany({
      where: { institutionId, isActive: true },
      select: {
        id: true,
        rut: true,
        name: true,
        email: true,
        corporateEmail: true,
        phone: true,
        positionId: true,
        position: { select: { name: true } },
        areaId: true,
        area: {
          select: {
            name: true,
            jefeNombre: true,
            jefeRut: true,
            jefeEmail: true,
            asistenteEmail: true,
          },
        },
        isActive: true,
        _count: {
          select: {
            courseProgress: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return users.map((u) => ({
      id: u.id,
      rut: u.rut,
      name: u.name,
      email: u.email,
      corporateEmail: u.corporateEmail,
      phone: u.phone,
      positionId: u.positionId,
      positionName: u.position?.name ?? null,
      areaId: u.areaId,
      areaName: u.area?.name ?? null,
      jefeNombre: u.area?.jefeNombre ?? null,
      jefeRut: u.area?.jefeRut ?? null,
      jefeEmail: u.area?.jefeEmail ?? null,
      asistenteEmail: u.area?.asistenteEmail ?? null,
      isActive: u.isActive,
      coursesCount: u._count.courseProgress,
    }));
  },
);

export interface UserCourseItem {
  courseId: string;
  courseTitle: string;
  courseTypeName: string | null;
  courseTypeColor: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  finalScore: number | null;
  completedAt: Date | null;
  totalLessons: number;
  watchedLessons: number;
  progressPercent: number;
  invitationToken?: string | null;
  invitationExpiresAt?: Date | null;
}

export interface StaffDirectoryItem {
  id: string;
  rut: string;
  name: string;
  email: string;
  corporateEmail: string | null;
  username: string | null;
  phone: string | null;
  role: Role;
  isActive: boolean;
  lastLoginAt: Date | null;
  positionName: string | null;
  areaName: string | null;
  courses: UserCourseItem[];
  _count: {
    invitations: number;
    courseProgress: number;
  };
}

/**
 * Consulta de funcionarios activos y no activos de una institución con su lista
 * detallada de cursos asignados, avance de lecciones y notas de evaluaciones.
 */
export const getStaffDirectoryWithCourses = cache(
  async (institutionId: string): Promise<StaffDirectoryItem[]> => {
    const users = await prisma.user.findMany({
      where: { institutionId },
      orderBy: { name: "asc" },
      include: {
        position: { select: { name: true } },
        area: { select: { name: true } },
        courseProgress: {
          include: {
            course: {
              include: {
                type: { select: { name: true, color: true } },
                _count: { select: { lessons: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        lessonProgress: {
          select: {
            lessonId: true,
            isWatched: true,
            lesson: { select: { courseId: true } },
          },
        },
        invitations: {
          where: { isUsed: false, expiresAt: { gt: new Date() } },
          select: { courseId: true, tokenHash: true, expiresAt: true },
        },
        _count: {
          select: {
            invitations: true,
            courseProgress: true,
          },
        },
      },
    });

    // Obtener lecciones activas directamente para calcular total y avance correctamente
    const activeLessonIds = new Set<string>();
    const activeLessonCountByCourse = new Map<string, number>();

    try {
      const rawActiveLessons = await prisma.$queryRawUnsafe<
        Array<{ id: string; courseId: string; isActive: number | boolean }>
      >(
        "SELECT id, courseId, isActive FROM `lessons` WHERE isActive = 1 OR isActive IS NULL",
      );
      for (const l of rawActiveLessons) {
        activeLessonIds.add(l.id);
        activeLessonCountByCourse.set(
          l.courseId,
          (activeLessonCountByCourse.get(l.courseId) ?? 0) + 1,
        );
      }
    } catch (_e) {
      // Fallback en caso de error
    }

    return users.map((u) => {
      // Mapear lecciones activas vistas por curso
      const watchedByCourse = new Map<string, number>();
      for (const lp of u.lessonProgress) {
        if (
          lp.isWatched &&
          lp.lesson.courseId &&
          (activeLessonIds.size === 0 || activeLessonIds.has(lp.lessonId))
        ) {
          watchedByCourse.set(
            lp.lesson.courseId,
            (watchedByCourse.get(lp.lesson.courseId) ?? 0) + 1,
          );
        }
      }

      // Mapear invitaciones vigentes por curso
      const activeInvByCourse = new Map<string, { expiresAt: Date }>();
      for (const inv of u.invitations) {
        activeInvByCourse.set(inv.courseId, { expiresAt: inv.expiresAt });
      }

      const courses: UserCourseItem[] = u.courseProgress.map((cp) => {
        const totalLessons =
          activeLessonCountByCourse.get(cp.courseId) ??
          cp.course._count.lessons;
        const watched = watchedByCourse.get(cp.courseId) ?? 0;
        const progressPercent =
          cp.status === "COMPLETED"
            ? 100
            : totalLessons > 0
              ? Math.min(100, Math.round((watched / totalLessons) * 100))
              : 0;

        return {
          courseId: cp.course.id,
          courseTitle: cp.course.title,
          courseTypeName: cp.course.type?.name ?? null,
          courseTypeColor: cp.course.type?.color ?? null,
          status: cp.status,
          finalScore: cp.finalScore,
          completedAt: cp.completedAt,
          totalLessons,
          watchedLessons: watched,
          progressPercent,
          invitationExpiresAt: activeInvByCourse.get(cp.courseId)?.expiresAt ?? null,
        };
      });

      return {
        id: u.id,
        rut: u.rut,
        name: u.name,
        email: u.email,
        corporateEmail: u.corporateEmail,
        username: u.username,
        phone: u.phone,
        role: u.role,
        isActive: u.isActive,
        lastLoginAt: u.lastLoginAt,
        positionName: u.position?.name ?? null,
        areaName: u.area?.name ?? null,
        courses,
        _count: u._count,
      };
    });
  },
);
