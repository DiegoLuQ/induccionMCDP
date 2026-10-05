"use client";

import { forwardRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Role } from "@prisma/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Upload, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ROLE_LABELS } from "@/lib/constants";
import { cn, slugify } from "@/lib/utils";
import {
  BULK_USER_COLUMNS,
  createUserSchema,
  parseBulkUsers,
  type BulkUserRow,
  type CreateUserInput,
} from "@/lib/validations/user";
import {
  bulkCreateUsersAction,
  createUserAction,
} from "@/server/actions/user-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

export interface Choice {
  id: string;
  name: string;
}

interface UserFormProps {
  institutions: Choice[];
  activeInstitutionId: string;
  positions: Choice[];
  areas: Array<Choice & { slug: string }>;
  positionsWithSlug: Array<Choice & { slug: string }>;
  /** Sólo un SUPER_ADMIN puede crear roles administrativos. */
  canAssignAdminRoles: boolean;
}

const NONE = "__ninguno__";

export function UserForm({
  institutions,
  activeInstitutionId,
  positions,
  areas,
  positionsWithSlug,
  canAssignAdminRoles,
}: UserFormProps) {
  const [tab, setTab] = useState<"single" | "bulk">("single");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={tab === "single" ? "default" : "outline"}
          onClick={() => setTab("single")}
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          Uno por uno
        </Button>
        <Button
          type="button"
          variant={tab === "bulk" ? "default" : "outline"}
          onClick={() => setTab("bulk")}
        >
          <Upload className="h-4 w-4" aria-hidden />
          Carga masiva
        </Button>
      </div>

      {tab === "single" ? (
        <SingleUserForm
          institutions={institutions}
          activeInstitutionId={activeInstitutionId}
          positions={positions}
          areas={areas}
          canAssignAdminRoles={canAssignAdminRoles}
        />
      ) : (
        <BulkUserForm
          activeInstitutionId={activeInstitutionId}
          positions={positionsWithSlug}
          areas={areas}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UNO POR UNO
// ---------------------------------------------------------------------------

function SingleUserForm({
  institutions,
  activeInstitutionId,
  positions,
  areas,
  canAssignAdminRoles,
}: Omit<UserFormProps, "positionsWithSlug">) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      institutionId: activeInstitutionId,
      extraInstitutionIds: [],
      rut: "",
      name: "",
      email: "",
      corporateEmail: "",
      username: "",
      phone: "",
      password: "",
      role: Role.FUNCIONARIO,
      positionId: "",
      areaId: "",
    },
  });

  const role = watch("role");
  const institutionId = watch("institutionId");
  const extraInstitutionIds = watch("extraInstitutionIds");
  const needsPassword = role !== Role.FUNCIONARIO;

  const availableRoles = canAssignAdminRoles
    ? Object.values(Role)
    : [Role.FUNCIONARIO];

  function toggleExtra(id: string) {
    setValue(
      "extraInstitutionIds",
      extraInstitutionIds.includes(id)
        ? extraInstitutionIds.filter((value) => value !== id)
        : [...extraInstitutionIds, id],
    );
  }

  function onSubmit(values: CreateUserInput) {
    startTransition(async () => {
      const result = await createUserAction(values);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message ?? "Usuario creado.");
      router.push("/admin/funcionarios");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos personales</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            id="rut"
            label="RUT"
            placeholder="12345678-9"
            error={errors.rut?.message}
            {...register("rut")}
          />
          <Field
            id="name"
            label="Nombre completo"
            error={errors.name?.message}
            {...register("name")}
          />
          <Field
            id="email"
            label="Correo"
            type="email"
            error={errors.email?.message}
            {...register("email")}
          />
          <Field
            id="corporateEmail"
            label="Correo institucional"
            type="email"
            hint="Opcional"
            error={errors.corporateEmail?.message}
            {...register("corporateEmail")}
          />
          <Field
            id="phone"
            label="Teléfono"
            hint="Opcional"
            placeholder="+56 9 1234 5678"
            error={errors.phone?.message}
            {...register("phone")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acceso y rol</CardTitle>
          <CardDescription>
            Los funcionarios ingresan con invitación y PIN; los roles
            administrativos, con usuario y contraseña.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="role">Rol</Label>
            <Select
              value={role}
              onValueChange={(value) => setValue("role", value as Role)}
            >
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((option) => (
                  <SelectItem key={option} value={option}>
                    {ROLE_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Field
            id="username"
            label="Usuario"
            hint={needsPassword ? "Requerido para iniciar sesión" : "Opcional"}
            placeholder="c.soto"
            error={errors.username?.message}
            {...register("username")}
          />

          <Field
            id="password"
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            hint={
              needsPassword
                ? "Mínimo 8 caracteres, con letras y números"
                : "Opcional para funcionarios"
            }
            error={errors.password?.message}
            {...register("password")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Colegio y clasificación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="institutionId">Colegio principal</Label>
              <Select
                value={institutionId}
                onValueChange={(value) => setValue("institutionId", value)}
                disabled={institutions.length === 1}
              >
                <SelectTrigger id="institutionId">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((institution) => (
                    <SelectItem key={institution.id} value={institution.id}>
                      {institution.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <CatalogSelect
              id="positionId"
              label="Cargo"
              value={watch("positionId") || NONE}
              options={positions}
              onChange={(value) =>
                setValue("positionId", value === NONE ? "" : value)
              }
            />

            <CatalogSelect
              id="areaId"
              label="Área"
              value={watch("areaId") || NONE}
              options={areas}
              onChange={(value) =>
                setValue("areaId", value === NONE ? "" : value)
              }
            />
          </div>

          {institutions.length > 1 && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label>Colegios adicionales</Label>
                <p className="text-xs text-muted-foreground">
                  El usuario podrá alternar entre ellos con el selector global.
                </p>
                <div className="flex flex-wrap gap-2">
                  {institutions
                    .filter((institution) => institution.id !== institutionId)
                    .map((institution) => {
                      const active = extraInstitutionIds.includes(institution.id);
                      return (
                        <button
                          key={institution.id}
                          type="button"
                          onClick={() => toggleExtra(institution.id)}
                          aria-pressed={active}
                          className={cn(
                            "rounded-full border px-3 py-1 text-sm transition-colors",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "hover:bg-accent",
                          )}
                        >
                          {institution.name}
                        </button>
                      );
                    })}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex justify-end pt-6">
          <Button type="submit" isLoading={isPending}>
            Crear usuario
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}

// ---------------------------------------------------------------------------
// CARGA MASIVA
// ---------------------------------------------------------------------------

function BulkUserForm({
  activeInstitutionId,
  positions,
  areas,
}: {
  activeInstitutionId: string;
  positions: Array<Choice & { slug: string }>;
  areas: Array<Choice & { slug: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<BulkUserRow[]>([]);

  const valid = rows.filter((row) => row.data);
  const invalid = rows.filter((row) => row.error);

  function preview() {
    const catalogs = {
      positions: new Map(
        positions.flatMap((p) => [
          [p.slug, p.id],
          [slugify(p.name), p.id],
        ]),
      ),
      areas: new Map(
        areas.flatMap((a) => [
          [a.slug, a.id],
          [slugify(a.name), a.id],
        ]),
      ),
    };
    const parsed = parseBulkUsers(raw, catalogs);
    setRows(parsed);
    if (parsed.length === 0) toast.error("No se encontraron líneas.");
  }

  function submit() {
    if (valid.length === 0) return;
    startTransition(async () => {
      const result = await bulkCreateUsersAction({
        institutionId: activeInstitutionId,
        users: valid.map((row) => row.data!),
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message ?? "Usuarios creados.");
      result.data?.errors.forEach((error) =>
        toast.error(`${error.email}: ${error.reason}`),
      );
      setRaw("");
      setRows([]);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Carga masiva</CardTitle>
        <CardDescription>
          Una línea por usuario, separando con punto y coma o tabulación. Puedes
          pegar directamente desde Excel.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/40 p-3">
          <p className="text-xs font-medium">Orden de columnas</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {BULK_USER_COLUMNS.join(" ; ")}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            El cargo y el área se escriben por nombre (ej. «Docente»). Los
            usuarios creados así no llevan contraseña: acceden por invitación.
          </p>
        </div>

        <Textarea
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          rows={8}
          className="font-mono text-xs"
          placeholder={`12345678-9;Ana Pérez;ana@gmail.com;ana.perez@colegio.cl;a.perez;+56912345678;Funcionario;Docente;UTP`}
        />

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={preview} disabled={!raw.trim()}>
            Previsualizar
          </Button>
          <Button
            type="button"
            onClick={submit}
            isLoading={isPending}
            disabled={valid.length === 0}
          >
            Crear {valid.length} usuario(s)
          </Button>
        </div>

        {rows.length > 0 && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Badge variant="success">{valid.length} válidas</Badge>
              {invalid.length > 0 && (
                <Badge variant="destructive">{invalid.length} con error</Badge>
              )}
            </div>

            <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2 text-xs scrollbar-thin">
              {rows.map((row, index) => (
                <li
                  key={index}
                  className={cn(
                    "rounded px-2 py-1 font-mono",
                    row.error ? "bg-destructive/10" : "bg-success/10",
                  )}
                >
                  {row.error ? (
                    <>
                      <span className="font-semibold">Error:</span> {row.error}
                      <span className="block text-muted-foreground">
                        {row.rawLine}
                      </span>
                    </>
                  ) : (
                    <>
                      {row.data!.name} · {row.data!.email} ·{" "}
                      {ROLE_LABELS[row.data!.role]}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function CatalogSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Choice[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Sin asignar" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Sin asignar</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** forwardRef obligatorio: react-hook-form inyecta la ref en el input. */
const Field = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    id: string;
    label: string;
    hint?: string;
    error?: string;
  }
>(({ id, label, hint, error, ...props }, ref) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} ref={ref} {...props} />
    {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
    {error && <p className="text-xs text-destructive">{error}</p>}
  </div>
));
Field.displayName = "Field";
