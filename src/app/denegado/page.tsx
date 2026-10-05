import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Acceso denegado" };

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <ShieldAlert className="h-10 w-10 text-destructive" aria-hidden />
      <h1 className="text-2xl font-semibold">No tienes acceso a esta sección</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Tu rol o cargo no permite ver este contenido. Si crees que se trata de un
        error, comunícate con el equipo de RRHH de tu colegio.
      </p>
      <Button asChild>
        <Link href="/dashboard">Volver al inicio</Link>
      </Button>
    </main>
  );
}
