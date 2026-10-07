"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { enterAreaPortalAction } from "@/server/actions/area-portal-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PortalKeyForm({ code }: { code: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await enterAreaPortalAction(code, key);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-5 w-5 text-primary" />
          Ingresa la clave del área
        </CardTitle>
        <CardDescription>
          La clave llegó en el correo de invitaciones enviado a la jefatura y al asistente del área.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="key">Clave de acceso</Label>
            <Input
              id="key"
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              autoComplete="off"
              autoCapitalize="characters"
              className="font-mono text-lg tracking-widest"
              maxLength={12}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <Button type="submit" className="w-full" isLoading={isPending} disabled={!key.trim()}>
            Ver accesos
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
