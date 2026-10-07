"use client";

import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Botón "¿Cómo ingreso?" de la pantalla de login. */
export function LoginHelpButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground">
          <Info className="h-4 w-4" />
          ¿Cómo ingreso?
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Info className="h-5 w-5 text-primary" />
            ¿Cómo ingreso a la plataforma?
          </DialogTitle>
          <DialogDescription>Funcionarios</DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            <strong>Primer ingreso:</strong> abre el enlace de invitación que te llegó (o te entregó tu
            jefatura) e ingresa el <strong>PIN</strong>. Ahí crearás tu <strong>clave de 6 dígitos</strong>.
          </li>
          <li>
            <strong>Siguientes ingresos:</strong> en esta pantalla escribe tu <strong>RUT</strong> (ej.
            12345678-9) y la <strong>clave que creaste</strong>.
          </li>
          <li>
            Registra tu <strong>correo institucional real</strong> (ej. nombre.apellido@colegio.cl). Si
            aparece uno con números, como 12612299@colegio.cl, es provisorio: cámbialo en &quot;Mi
            cuenta&quot;.
          </li>
        </ol>
        <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
          ¿Olvidaste tu clave o no tienes invitación? Solicítala a Recursos Humanos de tu colegio.
        </p>
      </DialogContent>
    </Dialog>
  );
}
