"use client";

import React, { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { UploadCloud, Link as LinkIcon, Film, CheckCircle2, Loader2, X, Eye, Server } from "lucide-react";
import { ServerVideoPicker } from "@/components/admin/server-video-picker";

interface VideoUploaderFieldProps {
  id?: string;
  value?: string;
  onChange: (url: string) => void;
  onDurationDetected?: (durationSeconds: number) => void;
  error?: string;
}

export function VideoUploaderField({
  id = "video-field",
  value = "",
  onChange,
  onDurationDetected,
  error,
}: VideoUploaderFieldProps) {
  // Determinar modo inicial basado en el valor actual
  const [tab, setTab] = useState<"url" | "upload" | "library">("upload");

  const [previewUrl, setPreviewUrl] = useState<string>(value || "");
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setPreviewUrl(value || "");
  }, [value]);

  // Manejar detección automática de duración cuando el video carga metadatos
  const handleLoadedMetadata = () => {
    if (videoPreviewRef.current) {
      const duration = Math.round(videoPreviewRef.current.duration);
      if (!isNaN(duration) && duration > 0 && onDurationDetected) {
        onDurationDetected(duration);
      }
    }
  };

  // Manejador de selección de archivo local
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      setUploadError("Por favor selecciona un archivo de video válido (.mp4, .webm, etc.).");
      return;
    }

    setSelectedFileName(file.name);
    setUploadError(null);

    // 1. Crear Blob local para previsualización inmediata
    const localBlobUrl = URL.createObjectURL(file);
    setPreviewUrl(localBlobUrl);

    // 2. Subir archivo al backend
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload/video", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al subir el video.");
      }

      // 3. Asignar la URL final del servidor
      onChange(data.url);
    } catch (err: unknown) {
      setUploadError((err instanceof Error && err.message) || "Error al subir archivo");
    } finally {
      setIsUploading(false);
    }
  };

  const handleClear = () => {
    setPreviewUrl("");
    setSelectedFileName("");
    onChange("");
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3 shadow-sm">
      {/* Selector de pestañas: Subir archivo o Pegar URL */}
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex flex-wrap items-center gap-1 bg-muted p-0.5 rounded-md text-xs">
          <button
            type="button"
            onClick={() => setTab("upload")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded transition-colors ${
              tab === "upload"
                ? "bg-background text-foreground font-medium shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <UploadCloud className="h-3.5 w-3.5" />
            Subir desde PC
          </button>
          <button
            type="button"
            onClick={() => setTab("url")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded transition-colors ${
              tab === "url"
                ? "bg-background text-foreground font-medium shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LinkIcon className="h-3.5 w-3.5" />
            Enlace / URL
          </button>
          <button
            type="button"
            onClick={() => setTab("library")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded transition-colors ${
              tab === "library"
                ? "bg-background text-foreground font-medium shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Reutilizar un video que ya está en el servidor, sin volver a subirlo"
          >
            <Server className="h-3.5 w-3.5" />
            Del servidor
          </button>
        </div>

        {previewUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-7 text-xs text-muted-foreground hover:text-destructive"
          >
            <X className="h-3 w-3 mr-1" />
            Quitar video
          </Button>
        )}
      </div>

      {/* Contenido según la pestaña activa */}
      {tab === "library" ? (
        <ServerVideoPicker
          value={value}
          onSelect={(url) => {
            setSelectedFileName("");
            setUploadError(null);
            onChange(url);
            setPreviewUrl(url);
          }}
        />
      ) : tab === "upload" ? (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFileSelect}
            id={`${id}-file`}
          />

          {!previewUrl ? (
            <label
              htmlFor={`${id}-file`}
              className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 bg-muted/20 hover:bg-muted/40 rounded-lg p-6 cursor-pointer transition-all text-center"
            >
              <Film className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Haz clic para seleccionar un video de tu equipo</p>
              <p className="text-xs text-muted-foreground mt-1">MP4, WebM o MOV (máx. recomendado 500MB)</p>
            </label>
          ) : (
            <div className="flex items-center justify-between gap-2 p-2 bg-muted/50 rounded border text-xs">
              <div className="flex items-center gap-2 truncate">
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                )}
                <span className="truncate font-medium">
                  {selectedFileName || value || "Video seleccionado"}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                Cambiar archivo
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          <Label htmlFor={`${id}-url`} className="text-xs">
            URL directa del video (MP4 / WebM / CDN)
          </Label>
          <Input
            id={`${id}-url`}
            placeholder="https://servidor.com/mi-video.mp4"
            value={value}
            onChange={(e) => {
              const url = e.target.value;
              onChange(url);
              setPreviewUrl(url);
            }}
          />
        </div>
      )}

      {/* Previsualizador de Video si existe URL */}
      {previewUrl && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Eye className="h-3.5 w-3.5" />
            <span>Previsualización del video:</span>
          </div>
          <div className="relative rounded-md overflow-hidden bg-black/90 aspect-video flex items-center justify-center max-h-[260px] border shadow-inner">
            <video
              ref={videoPreviewRef}
              src={previewUrl}
              controls
              onLoadedMetadata={handleLoadedMetadata}
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      )}

      {/* Mensajes de error */}
      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
