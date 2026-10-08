"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Film, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";
import { listReusableVideosAction, type ReusableVideo } from "@/server/actions/video-actions";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

/**
 * Lista los videos ya subidos al servidor para reutilizarlos sin volver a
 * subirlos. Se carga al montarse (sólo cuando se abre la pestaña).
 */
export function ServerVideoPicker({
  value,
  onSelect,
}: {
  value?: string;
  onSelect: (url: string) => void;
}) {
  const [videos, setVideos] = useState<ReusableVideo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    listReusableVideosAction()
      .then((result) => {
        if (cancelled) return;
        if (result.success) setVideos(result.data ?? []);
        else setError(result.message);
      })
      .catch(() => !cancelled && setError("No se pudo cargar la lista de videos."));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!videos || !q) return videos ?? [];
    return videos.filter(
      (v) => v.name.toLowerCase().includes(q) || v.usedIn.some((u) => u.toLowerCase().includes(q)),
    );
  }, [videos, query]);

  if (error) return <p className="text-xs text-destructive">{error}</p>;
  if (!videos) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando videos del servidor...
      </p>
    );
  }
  if (videos.length === 0) {
    return <p className="text-xs text-muted-foreground">Aún no hay videos subidos que puedas reutilizar.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre de archivo, curso o lección"
          className="h-9 pl-8 text-xs"
        />
      </div>
      <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-1">
        {filtered.length === 0 && (
          <li className="p-3 text-center text-xs text-muted-foreground">Sin resultados.</li>
        )}
        {filtered.map((video) => {
          const selected = value === video.url;
          return (
            <li
              key={video.url}
              className={`flex items-center gap-2 rounded p-2 text-xs ${selected ? "bg-primary/10" : "hover:bg-muted/60"}`}
            >
              <Film className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{video.name}</p>
                <p className="truncate text-[11px] text-muted-foreground" suppressHydrationWarning>
                  {formatBytes(video.size)} · {formatDateTime(video.uploadedAt)}
                  {video.usedIn.length > 0 ? ` · usado en: ${video.usedIn.join(", ")}` : " · sin uso"}
                </p>
              </div>
              {selected ? (
                <span className="flex shrink-0 items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Elegido
                </span>
              ) : (
                <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => onSelect(video.url)}>
                  Usar
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
