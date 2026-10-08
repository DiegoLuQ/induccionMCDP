"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Role } from "@prisma/client";
import { Link as LinkIcon, Pencil, PlayCircle, Plus, Search, Server, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ROLE_LABELS } from "@/lib/constants";
import { getVideoEmbed } from "@/lib/video-embed";
import type { PositionOption, TutorialItem } from "@/server/queries/tutorials";
import { deleteTutorialAction, saveTutorialAction } from "@/server/actions/tutorial-actions";
import { ServerVideoPicker } from "@/components/admin/server-video-picker";
import { TutorialPlayer } from "@/components/tutorials/tutorial-player";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";

const ALL_ROLES = Object.values(Role);

interface FormState {
  id?: string;
  title: string;
  description: string;
  videoUrl: string;
  roles: Role[];
  positionSlugs: string[];
  orderIndex: string;
  isPublished: boolean;
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  videoUrl: "",
  roles: [],
  positionSlugs: [],
  orderIndex: "0",
  isPublished: true,
};

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function TutorialsView({
  tutorials,
  canManage,
  positions,
}: {
  tutorials: TutorialItem[];
  canManage: boolean;
  positions: PositionOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [watching, setWatching] = useState<TutorialItem | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [videoSource, setVideoSource] = useState<"url" | "server">("url");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [deleting, setDeleting] = useState<TutorialItem | null>(null);

  const positionName = useMemo(() => new Map(positions.map((p) => [p.slug, p.name])), [positions]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tutorials;
    return tutorials.filter(
      (t) => t.title.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q),
    );
  }, [tutorials, query]);

  function openForm(tutorial?: TutorialItem) {
    setErrors({});
    setVideoSource(tutorial?.videoUrl.startsWith("/uploads/videos/") ? "server" : "url");
    setForm(
      tutorial
        ? {
            id: tutorial.id,
            title: tutorial.title,
            description: tutorial.description ?? "",
            videoUrl: tutorial.videoUrl,
            roles: tutorial.roles,
            positionSlugs: tutorial.positionSlugs,
            orderIndex: String(tutorial.orderIndex),
            isPublished: tutorial.isPublished,
          }
        : EMPTY_FORM,
    );
  }

  function save() {
    if (!form) return;
    startTransition(async () => {
      const result = await saveTutorialAction({ ...form, orderIndex: Number(form.orderIndex) || 0 });
      if (result.success) {
        toast.success(result.message ?? "Tutorial guardado.");
        setForm(null);
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.message);
      }
    });
  }

  function remove() {
    if (!deleting) return;
    startTransition(async () => {
      const result = await deleteTutorialAction(deleting.id);
      if (result.success) {
        toast.success(result.message ?? "Tutorial eliminado.");
        setDeleting(null);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function audienceLabel(t: TutorialItem): string {
    const roles = t.roles.length === 0 ? "Todos los roles" : t.roles.map((r) => ROLE_LABELS[r]).join(", ");
    const cargos =
      t.positionSlugs.length === 0
        ? "todos los cargos"
        : t.positionSlugs.map((s) => positionName.get(s) ?? s).join(", ");
    return `${roles} · ${cargos}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar tutorial"
            className="pl-8"
          />
        </div>
        {canManage && (
          <Button onClick={() => openForm()} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Nuevo tutorial
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <PlayCircle className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-medium">
              {tutorials.length === 0 ? "Aún no hay tutoriales disponibles" : "Sin resultados"}
            </p>
            {canManage && tutorials.length === 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                Agrega el primero con &quot;Nuevo tutorial&quot;.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((tutorial) => {
            const embed = getVideoEmbed(tutorial.videoUrl);
            return (
              <Card key={tutorial.id} className="flex flex-col overflow-hidden">
                <button
                  type="button"
                  onClick={() => setWatching(tutorial)}
                  className="group relative flex aspect-video items-center justify-center bg-muted"
                  aria-label={`Ver ${tutorial.title}`}
                >
                  {embed.kind === "iframe" && embed.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={embed.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  )}
                  <PlayCircle className="relative h-12 w-12 text-primary drop-shadow transition-transform group-hover:scale-110" />
                </button>
                <CardContent className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setWatching(tutorial)}
                      className="text-left font-semibold leading-snug hover:underline"
                    >
                      {tutorial.title}
                    </button>
                    {canManage && !tutorial.isPublished && <Badge variant="secondary">Borrador</Badge>}
                  </div>
                  {tutorial.description && (
                    <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
                      {tutorial.description}
                    </p>
                  )}
                  {canManage && (
                    <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                      <p className="text-[11px] text-muted-foreground">Visible para: {audienceLabel(tutorial)}</p>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          title="Editar"
                          onClick={() => openForm(tutorial)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          title="Eliminar"
                          onClick={() => setDeleting(tutorial)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Reproductor */}
      <Dialog open={watching !== null} onOpenChange={(open) => !open && setWatching(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="pr-6">{watching?.title}</DialogTitle>
            {watching?.description && (
              <DialogDescription className="whitespace-pre-line">{watching.description}</DialogDescription>
            )}
          </DialogHeader>
          {watching && <TutorialPlayer key={watching.id} url={watching.videoUrl} title={watching.title} />}
        </DialogContent>
      </Dialog>

      {/* Crear / editar */}
      {canManage && (
        <Dialog open={form !== null} onOpenChange={(open) => !open && !isPending && setForm(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{form?.id ? "Editar tutorial" : "Nuevo tutorial"}</DialogTitle>
              <DialogDescription>
                Si no marcas roles ni cargos, el tutorial lo ven todos. Si marcas ambos, debe cumplir los dos.
              </DialogDescription>
            </DialogHeader>
            {form && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="tutorial-title">Título</Label>
                  <Input
                    id="tutorial-title"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                  {errors.title && <p className="text-xs text-destructive">{errors.title[0]}</p>}
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label htmlFor="tutorial-url">Video</Label>
                    <div className="flex items-center gap-1 rounded-md bg-muted p-0.5 text-xs">
                      {(
                        [
                          ["url", "Enlace", LinkIcon],
                          ["server", "Del servidor", Server],
                        ] as const
                      ).map(([value, label, Icon]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setVideoSource(value)}
                          className={`flex items-center gap-1.5 rounded px-3 py-1 ${
                            videoSource === value
                              ? "bg-background font-medium text-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {videoSource === "url" ? (
                    <>
                      <Input
                        id="tutorial-url"
                        value={form.videoUrl}
                        onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
                        placeholder="https://www.youtube.com/watch?v=..."
                      />
                      <p className="text-[11px] text-muted-foreground">
                        YouTube, Vimeo, Google Drive (compartido con &quot;cualquier persona con el enlace&quot;), Loom o
                        un archivo MP4. Otros enlaces se abren en una pestaña nueva.
                      </p>
                    </>
                  ) : (
                    <ServerVideoPicker
                      value={form.videoUrl}
                      onSelect={(url) => setForm({ ...form, videoUrl: url })}
                    />
                  )}
                  {errors.videoUrl && <p className="text-xs text-destructive">{errors.videoUrl[0]}</p>}
                  {form.videoUrl && <TutorialPlayer url={form.videoUrl} title="Vista previa" />}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="tutorial-description">Descripción</Label>
                  <Textarea
                    id="tutorial-description"
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                  {errors.description && <p className="text-xs text-destructive">{errors.description[0]}</p>}
                </div>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Roles que lo ven</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {ALL_ROLES.map((role) => (
                      <label key={role} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={form.roles.includes(role)}
                          onChange={() => setForm({ ...form, roles: toggleIn(form.roles, role) })}
                        />
                        {ROLE_LABELS[role]}
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {form.roles.length === 0 ? "Ninguno marcado: todos los roles." : `${form.roles.length} rol(es).`}
                  </p>
                </fieldset>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Cargos que lo ven</legend>
                  {positions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No hay cargos creados en los colegios.</p>
                  ) : (
                    <div className="grid max-h-48 gap-2 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
                      {positions.map((p) => (
                        <label key={p.slug} className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={form.positionSlugs.includes(p.slug)}
                            onChange={() =>
                              setForm({ ...form, positionSlugs: toggleIn(form.positionSlugs, p.slug) })
                            }
                          />
                          <span className="truncate">{p.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {form.positionSlugs.length === 0
                      ? "Ninguno marcado: todos los cargos (y usuarios sin cargo)."
                      : `${form.positionSlugs.length} cargo(s). Los usuarios sin cargo no lo verán.`}
                  </p>
                </fieldset>

                <div className="flex flex-wrap items-end gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="tutorial-order">Orden</Label>
                    <Input
                      id="tutorial-order"
                      type="number"
                      min={0}
                      value={form.orderIndex}
                      onChange={(e) => setForm({ ...form, orderIndex: e.target.value })}
                      className="w-24"
                    />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={form.isPublished}
                      onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
                    />
                    Publicado (si no, sólo lo ves tú)
                  </label>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setForm(null)} disabled={isPending}>
                Cancelar
              </Button>
              <Button onClick={save} isLoading={isPending}>
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirmar eliminación */}
      <Dialog open={deleting !== null} onOpenChange={(open) => !open && !isPending && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar tutorial</DialogTitle>
            <DialogDescription>
              Se eliminará &quot;{deleting?.title}&quot;. El video (si está en el servidor) no se borra.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={remove} isLoading={isPending}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
