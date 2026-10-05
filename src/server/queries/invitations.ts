import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";

export type InvitationState = "ACTIVE" | "USED" | "EXPIRED" | "BLOCKED";

export const getInvitations = cache(
  async (institutionId: string, courseId?: string) => {
    const rows = await prisma.invitation.findMany({
      where: { institutionId, ...(courseId ? { courseId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 300,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            rut: true,
            email: true,
            position: { select: { name: true } },
          },
        },
        course: { select: { id: true, title: true } },
        createdBy: { select: { name: true } },
      },
    });

    const now = Date.now();
    return rows.map((invitation) => {
      const state: InvitationState = invitation.isUsed
        ? "USED"
        : invitation.attempts >= 5
          ? "BLOCKED"
          : invitation.expiresAt.getTime() <= now
            ? "EXPIRED"
            : "ACTIVE";
      return { ...invitation, state };
    });
  },
);

export const getUsersByInstitution = cache(async (institutionId: string) =>
  prisma.user.findMany({
    where: { institutionId },
    orderBy: { name: "asc" },
    include: {
      position: { select: { name: true } },
      area: { select: { name: true } },
      _count: { select: { courseProgress: true, invitations: true } },
    },
  }),
);
