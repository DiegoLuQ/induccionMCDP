import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { STAFF_ROLES } from "@/lib/auth/rbac";

/** Cargos del colegio. `activeOnly` para los selectores de formularios. */
export const getPositions = cache(
  async (institutionId: string, activeOnly = false) =>
    prisma.position.findMany({
      where: { institutionId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: [{ orderIndex: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { users: true, targetedBy: true } },
        users: {
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            rut: true,
            email: true,
            area: { select: { name: true } },
          },
        },
      },
    }),
);

/** Tipos de curso del colegio. */
export const getCourseTypes = cache(
  async (institutionId: string, activeOnly = false) =>
    prisma.courseType.findMany({
      where: { institutionId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: [{ orderIndex: "asc" }, { name: "asc" }],
      include: { _count: { select: { courses: true } } },
    }),
);

/** Áreas o departamentos del colegio. */
export const getAreas = cache(
  async (institutionId: string, activeOnly = false) =>
    prisma.area.findMany({
      where: { institutionId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: [{ orderIndex: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { users: true } },
        users: {
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            rut: true,
            email: true,
            positionId: true,
            position: { select: { id: true, name: true } },
          },
        },
      },
    }),
);

/** Funcionarios activos que no tienen jefatura asignada (área sin jefe o sin área). */
export const getStaffWithoutJefatura = cache(
  async (institutionId: string) =>
    prisma.user.findMany({
      where: {
        institutionId,
        isActive: true,
        role: { in: STAFF_ROLES },
        OR: [
          { areaId: null },
          { area: { OR: [{ jefeNombre: null }, { jefeNombre: "" }] } },
        ],
      },
      select: {
        id: true,
        name: true,
        rut: true,
        email: true,
        position: { select: { name: true } },
        area: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    }),
);

export type PositionRow = Awaited<ReturnType<typeof getPositions>>[number];
export type CourseTypeRow = Awaited<ReturnType<typeof getCourseTypes>>[number];
export type StaffWithoutJefaturaItem = Awaited<ReturnType<typeof getStaffWithoutJefatura>>[number];
