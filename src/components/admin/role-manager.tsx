"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Role } from "@prisma/client";
import { KeyRound, Search, ShieldCheck, UserCog } from "lucide-react";
import { toast } from "sonner";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import { formatRut } from "@/lib/rut";
import { setUserPasswordAction, setUserRoleAction } from "@/server/actions/role-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface RoleManagerUser {
  id: string;
  name: string;
  rut: string;
  email: string;
  username: string | null;
  role: Role;
  isActive: boolean;
  lastLoginAt: Date | null;
  hasPassword: boolean;
  positionName: string | null;
  institutionName: string;
}

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  SUPER_ADMIN: "Acceso total: colegios, videos, usuarios y roles.",
  ADMIN_RRHH: "Panel, inducciones, invitaciones, funcionarios y catálogos.",
  FUNCIONARIO: "Sólo realiza sus inducciones (entra con invitación y PIN).",
  AUDITOR: "Sólo lectura: ve quién completó cada inducción en los colegios asignados.",
};

/** Roles que entran por /login con contraseña (todos menos FUNCIONARIO). */
const ADMIN_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN_RRHH, Role.AUDITOR];

/** Cambio de rol pendiente de confirmar (y, si hace falta, con contraseña). */
interface PendingChange {
  user: RoleManagerUser;
  role: Role;
}

export function RoleManager({
  users,
  currentUserId,
}: {
  users: RoleManagerUser[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<RoleManagerUser | null>(null);
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");
  const [grantRole, setGrantRole] = useState<Role>(Role.ADMIN_RRHH);

  const admins = useMemo(() => users.filter((u) => ADMIN_ROLES.includes(u.role)), [users]);

  const candidates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length < 2) return [];
    const digits = query.replace(/[^0-9k]/g, "");
    return users
      .filter((u) => u.role === Role.FUNCIONARIO)
      .filter(
        (u) =>
          u.name.toLowerCase().includes(query) ||
          u.email.toLowerCase().includes(query) ||
          (digits.length >= 3 && u.rut.toLowerCase().replace(/[^0-9k]/g, "").includes(digits)),
      )
      .slice(0, 8);
  }, [users, search]);

  // Al pasar a rol administrativo sin contraseña previa, hay que definir una.
  const needsPassword = pending
    ? pending.role !== Role.FUNCIONARIO && !pending.user.hasPassword
    : false;

  function openChange(user: RoleManagerUser, role: Role) {
    if (role === user.role) return;
    setPassword("");
    setPending({ user, role });
  }

  function confirmChange() {
    if (!pending) return;
    startTransition(async () => {
      const result = await setUserRoleAction({
        userId: pending.user.id,
        role: pending.role,
        password: password || undefined,
      });
      if (result.success) {
        toast.success(result.message ?? "Rol actualizado.");
        setPending(null);
        setPassword("");
        setSearch("");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function confirmPassword() {
    if (!passwordTarget) return;
    startTransition(async () => {
      const result = await setUserPasswordAction({ userId: passwordTarget.id, password });
      if (result.success) {
        toast.success(result.message ?? "Contraseña actualizada.");
        setPasswordTarget(null);
        setPassword("");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Roles disponibles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.values(Role).map((role) => (
          <Card key={role}>
            <CardContent className="p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-primary" />
                {ROLE_LABELS[role]}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Administradores actuales */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuarios con acceso ({admins.length})</CardTitle>
          <CardDescription>
            Cambia el rol desde la lista. Pasar a &quot;Funcionario&quot; le quita el acceso. Para que un
            auditor vea ambos colegios, créalo con &quot;Nuevo usuario&quot; marcando los colegios adicionales.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="min-w-[200px]">Usuario</TableHead>
                  <TableHead className="min-w-[160px]">Acceso</TableHead>
                  <TableHead className="w-52">Rol</TableHead>
                  <TableHead className="w-40">Último ingreso</TableHead>
                  <TableHead className="w-28 text-right pr-4">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((user) => {
                  const isSelf = user.id === currentUserId;
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <span className="block font-medium">
                          {user.name}
                          {isSelf && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              Tú
                            </Badge>
                          )}
                          {!user.isActive && (
                            <Badge variant="secondary" className="ml-2 text-[10px]">
                              Inactivo
                            </Badge>
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {formatRut(user.rut)} · {user.institutionName}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="block font-mono">{user.email}</span>
                        {user.username && (
                          <span className="block text-muted-foreground">Usuario: {user.username}</span>
                        )}
                        {!user.hasPassword && (
                          <span className="block text-amber-600">Sin contraseña</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={user.role}
                          onValueChange={(value) => openChange(user, value as Role)}
                          disabled={isSelf || isPending}
                        >
                          <SelectTrigger className="h-8 text-xs" title={isSelf ? "No puedes cambiar tu propio rol" : undefined}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(Role).map((role) => (
                              <SelectItem key={role} value={role} className="text-xs">
                                {ROLE_LABELS[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground" suppressHydrationWarning>
                        {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Nunca"}
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          onClick={() => {
                            setPassword("");
                            setPasswordTarget(user);
                          }}
                          disabled={isPending}
                          title="Definir una nueva contraseña"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Contraseña
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dar acceso a un funcionario existente */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog className="h-4 w-4 text-primary" />
            Dar acceso a un funcionario existente
          </CardTitle>
          <CardDescription>
            Busca por nombre, correo o RUT. Para alguien que no está en la plataforma usa &quot;Nuevo usuario&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ej: María, 12345678 o maria@colegio.cl"
                className="pl-8"
              />
            </div>
            <Select value={grantRole} onValueChange={(value) => setGrantRole(value as Role)}>
              <SelectTrigger className="sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADMIN_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {search.trim().length >= 2 && (
            <div className="divide-y rounded-md border">
              {candidates.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">
                  No hay funcionarios que coincidan.
                </p>
              ) : (
                candidates.map((user) => (
                  <div key={user.id} className="flex items-center justify-between gap-3 p-2.5">
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium">{user.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {formatRut(user.rut)} · {user.email}
                        {user.positionName ? ` · ${user.positionName}` : ""}
                      </span>
                    </div>
                    <Button size="sm" className="h-8 shrink-0 text-xs" onClick={() => openChange(user, grantRole)}>
                      Hacer {ROLE_LABELS[grantRole]}
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmar cambio de rol */}
      <Dialog open={pending !== null} onOpenChange={(open) => !open && !isPending && setPending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar rol</DialogTitle>
            <DialogDescription>
              {pending && (
                <>
                  <strong className="text-foreground">{pending.user.name}</strong> pasará de{" "}
                  {ROLE_LABELS[pending.user.role]} a{" "}
                  <strong className="text-foreground">{ROLE_LABELS[pending.role]}</strong>.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {pending && (
            <div className="space-y-3 text-sm">
              <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[pending.role]}</p>
              {pending.role !== Role.FUNCIONARIO && (
                <div className="space-y-1">
                  <Label htmlFor="role-password" className="text-xs">
                    Contraseña de acceso {needsPassword ? "(obligatoria)" : "(opcional, deja vacío para mantener la actual)"}
                  </Label>
                  <Input
                    id="role-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres, con letras y números"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Entrará por /login con su correo {pending.user.email}
                    {pending.user.username ? ` o el usuario ${pending.user.username}` : ""}.
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={confirmChange} disabled={isPending || (needsPassword && !password)}>
              {isPending ? "Guardando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cambiar contraseña */}
      <Dialog
        open={passwordTarget !== null}
        onOpenChange={(open) => !open && !isPending && setPasswordTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva contraseña</DialogTitle>
            <DialogDescription>
              Para <strong className="text-foreground">{passwordTarget?.name}</strong> ({passwordTarget?.email}).
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres, con letras y números"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordTarget(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={confirmPassword} disabled={isPending || !password}>
              {isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
