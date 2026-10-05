import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth/tokens";
import { buildInstitutionIds, createSession } from "@/lib/auth/session";
import { redeemInvitation } from "@/server/services/invitation-service";
import { InvitationForm } from "./invitation-form";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Validar invitación" };

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function InvitationPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  let requiresPin = true;
  let userName: string | null = null;
  let courseTitle: string | null = null;
  let isExpiredOrInvalid = false;

  if (token) {
    const invitation = await prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        requiresPin: true,
        isUsed: true,
        expiresAt: true,
        user: { select: { name: true } },
        course: { select: { title: true } },
      },
    });

    if (!invitation || invitation.isUsed || invitation.expiresAt.getTime() <= Date.now()) {
      isExpiredOrInvalid = true;
    } else {
      requiresPin = invitation.requiresPin;
      userName = invitation.user.name;
      courseTitle = invitation.course.title;
    }
  }

  if (isExpiredOrInvalid) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
        <div className="w-full max-w-md">
          <div className="rounded-xl border bg-card p-6 shadow-sm text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
              <ShieldCheck className="h-6 w-6" aria-hidden />
            </div>
            
            <div className="space-y-1.5">
              <h1 className="text-lg font-semibold text-foreground">
                Enlace no disponible o expirado
              </h1>
              <p className="text-sm text-muted-foreground">
                Este enlace de inducción ya cumplió su tiempo límite de vigencia o ya fue completado.
              </p>
            </div>

            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground text-left space-y-1">
              <p className="font-medium text-foreground">¿Qué debes hacer?</p>
              <p>
                Comunícate con el equipo de <strong>Recursos Humanos</strong> o la <strong>Administración de tu colegio</strong> para que te generen un nuevo acceso.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <ShieldCheck className="h-9 w-9 text-primary" aria-hidden />
          <h1 className="mt-3 text-xl font-semibold">
            {requiresPin ? "Valida tu acceso" : "Bienvenido a tu Inducción"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {userName && <span className="block font-medium text-foreground">{userName}</span>}
            {courseTitle && <span className="block text-xs text-primary mb-1">{courseTitle}</span>}
            {requiresPin
              ? "Ingresa el PIN de 6 dígitos que recibiste para comenzar."
              : "Iniciando tu sesión de inducción de manera segura..."}
          </p>
        </div>

        <InvitationForm
          token={token ?? ""}
          autoSubmit={!requiresPin && !isExpiredOrInvalid}
          isInvalid={isExpiredOrInvalid}
        />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          El enlace es personal e intransferible, con vigencia limitada.
        </p>
      </div>
    </main>
  );
}
