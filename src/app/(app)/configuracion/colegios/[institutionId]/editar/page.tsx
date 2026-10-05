import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import type { UpdateInstitutionInput } from "@/lib/validations/institution";
import { PageHeader } from "@/components/shared/page-header";
import { InstitutionForm } from "@/components/admin/institution-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Editar colegio" };

interface PageProps {
  params: Promise<{ institutionId: string }>;
}

export default async function EditInstitutionPage({ params }: PageProps) {
  const { institutionId } = await params;
  const session = await requireRole(Role.SUPER_ADMIN);

  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    include: { socialLinks: { orderBy: { orderIndex: "asc" } } },
  });

  if (!institution) notFound();

  const initialValues: UpdateInstitutionInput = {
    id: institution.id,
    name: institution.name,
    slug: institution.slug,
    domain: institution.domain,
    logoUrl: institution.logoUrl ?? "",
    rbd: institution.rbd ?? "",
    rut: institution.rut ?? "",
    phone: institution.phone ?? "",
    address: institution.address ?? "",
    isActive: institution.isActive,
    socialLinks: institution.socialLinks.map((link) => ({
      id: link.id,
      platform: link.platform,
      label: link.label ?? "",
      url: link.url,
    })),
  };

  return (
    <>
      <PageHeader
        title="Editar colegio"
        description={institution.name}
        actions={
          <Button asChild variant="outline">
            <Link href="/configuracion/colegios">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Volver
            </Link>
          </Button>
        }
      />

      <div className="max-w-4xl">
        <InstitutionForm
          initialValues={initialValues}
          canDeactivate={session.role === Role.SUPER_ADMIN}
        />
      </div>
    </>
  );
}
