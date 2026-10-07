"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { saveActiveCourse } from "@/lib/active-course";
import { failure, success, type ActionResult } from "@/lib/validations/common";

/** Cambia la "Inducción activa" del colegio activo (selector de la barra superior). */
export async function setActiveCourseAction(courseId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role === Role.FUNCIONARIO) return failure("Sin permisos.");

  const course = await prisma.course.findFirst({
    where: { id: courseId, institutionId: session.institutionId, isPublished: true },
    select: { id: true },
  });
  if (!course) return failure("Inducción no encontrada.");

  await saveActiveCourse(session.institutionId, course.id);
  revalidatePath("/", "layout");
  return success(undefined);
}
