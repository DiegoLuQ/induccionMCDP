import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <FileQuestion className="h-10 w-10 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-semibold">Contenido no encontrado</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        La página o inducción que buscas no existe, fue eliminada o pertenece a
        otro colegio.
      </p>
      <Button asChild>
        <Link href="/dashboard">Volver al inicio</Link>
      </Button>
    </main>
  );
}
