import "server-only";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * "Inducción activa": curso elegido globalmente (como el colegio) que usan el
 * Inicio, el Reporte, Invitaciones y Funcionarios para mostrar quién lo hizo y
 * quién no. Se recuerda por colegio en una cookie.
 */

export const ACTIVE_COURSE_COOKIE = "ic_active_course";

export interface ActiveCourseOption {
  id: string;
  title: string;
  isMandatory: boolean;
  period: number;
}

function readCookieMap(raw: string | undefined): Record<string, string> {
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Cursos publicados del colegio y el activo (cookie → primer obligatorio → primero). */
export async function getActiveCourse(institutionId: string): Promise<{
  courses: ActiveCourseOption[];
  activeCourseId: string | null;
}> {
  const rows = await prisma.course.findMany({
    where: { institutionId, isPublished: true },
    orderBy: [{ isMandatory: "desc" }, { title: "asc" }],
    select: { id: true, title: true, isMandatory: true, currentPeriod: true, createdAt: true },
  });
  const courses = rows.map((c) => ({
    id: c.id,
    title: c.title,
    isMandatory: c.isMandatory,
    period: c.currentPeriod ?? c.createdAt.getFullYear(),
  }));

  const chosen = readCookieMap((await cookies()).get(ACTIVE_COURSE_COOKIE)?.value)[institutionId];
  const activeCourseId = courses.find((c) => c.id === chosen)?.id ?? courses[0]?.id ?? null;
  return { courses, activeCourseId };
}

/** Guarda el curso activo de un colegio, conservando el de los otros colegios. */
export async function saveActiveCourse(institutionId: string, courseId: string): Promise<void> {
  const store = await cookies();
  const map = readCookieMap(store.get(ACTIVE_COURSE_COOKIE)?.value);
  map[institutionId] = courseId;
  store.set(ACTIVE_COURSE_COOKIE, JSON.stringify(map), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
