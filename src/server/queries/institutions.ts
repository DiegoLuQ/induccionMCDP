import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";

/** Colegios visibles en el selector global del layout. */
export const getAccessibleInstitutions = cache(
  async (institutionIds: string[]) => {
    if (institutionIds.length === 0) return [];
    return prisma.institution.findMany({
      where: { id: { in: institutionIds }, isActive: true },
      select: { id: true, name: true, slug: true, logoUrl: true, domain: true },
      orderBy: { name: "asc" },
    });
  },
);

export const getInstitution = cache(async (id: string) =>
  prisma.institution.findUnique({
    where: { id },
    include: { socialLinks: { orderBy: { orderIndex: "asc" } } },
  }),
);

export const listAllInstitutions = cache(async () =>
  prisma.institution.findMany({
    orderBy: { name: "asc" },
    include: {
      socialLinks: { orderBy: { orderIndex: "asc" } },
      _count: { select: { users: true, courses: true } },
    },
  }),
);
