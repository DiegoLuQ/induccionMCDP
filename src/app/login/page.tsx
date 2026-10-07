import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { LoginForm } from "./login-form";
import { LoginHelpButton } from "@/components/auth/login-help-button";

export const metadata: Metadata = { title: "Ingresar" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <GraduationCap className="h-9 w-9 text-primary" aria-hidden />
          <h1 className="mt-3 text-xl font-semibold">Inducción y Capacitación</h1>
          <p className="text-sm text-muted-foreground">
            Ingresa con tu RUT y la clave que creaste
          </p>
          <div className="mt-1">
            <LoginHelpButton />
          </div>
        </div>

        {/* useSearchParams exige un límite de Suspense. */}
        <Suspense
          fallback={<div className="h-64 rounded-lg border bg-card" />}
        >
          <LoginForm />
        </Suspense>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          ¿Recibiste una invitación por correo?{" "}
          <Link href="/auth/invitation" className="font-medium underline">
            Ingresa con tu PIN
          </Link>
        </p>
      </div>
    </main>
  );
}
