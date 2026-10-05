"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Lock } from "lucide-react";
import { toast } from "sonner";
import { cn, formatDuration } from "@/lib/utils";
import { LESSON_COMPLETION_THRESHOLD } from "@/lib/constants";
import { Progress } from "@/components/ui/progress";
import { trackLessonProgressAction } from "@/server/actions/progress-actions";

interface VideoPlayerProps {
  lessonId: string;
  videoUrl: string;
  durationSeconds: number;
  initialWatchedSeconds: number;
  isWatched: boolean;
  isLocked: boolean;
  /** Impide adelantar más allá del punto máximo visto (cursos secuenciales). */
  preventSkipping: boolean;
  onWatched?: () => void;
}

const HEARTBEAT_MS = 15_000;

/**
 * Reproductor con seguimiento de avance:
 *  - Persiste el avance cada 15 s y al pausar/salir.
 *  - Impide adelantar el video en cursos secuenciales.
 *  - Marca la lección como vista al superar el umbral de visualización.
 */
export function VideoPlayer({
  lessonId,
  videoUrl,
  durationSeconds,
  initialWatchedSeconds,
  isWatched,
  isLocked,
  preventSkipping,
  onWatched,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const maxWatchedRef = useRef(initialWatchedSeconds);
  const lastSavedRef = useRef(initialWatchedSeconds);
  const completedRef = useRef(isWatched);

  const [currentTime, setCurrentTime] = useState(initialWatchedSeconds);
  const [watched, setWatched] = useState(isWatched);

  const save = useCallback(
    async (reachedEnd: boolean) => {
      const seconds = Math.floor(maxWatchedRef.current);
      if (!reachedEnd && seconds - lastSavedRef.current < 5) return;
      lastSavedRef.current = seconds;

      const result = await trackLessonProgressAction({
        lessonId,
        watchedSeconds: seconds,
        reachedEnd,
      });

      if (result.success && result.data?.isWatched && !completedRef.current) {
        completedRef.current = true;
        setWatched(true);
        toast.success("Video completado");
        onWatched?.();
      }
    },
    [lessonId, onWatched],
  );

  // Retoma donde quedó.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || initialWatchedSeconds <= 0) return;
    const onLoaded = () => {
      if (initialWatchedSeconds < video.duration - 1) {
        video.currentTime = initialWatchedSeconds;
      }
    };
    video.addEventListener("loadedmetadata", onLoaded);
    return () => video.removeEventListener("loadedmetadata", onLoaded);
  }, [initialWatchedSeconds]);

  // Heartbeat + guardado al desmontar.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!videoRef.current?.paused) void save(false);
    }, HEARTBEAT_MS);

    const onUnload = () => void save(false);
    window.addEventListener("pagehide", onUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener("pagehide", onUnload);
      void save(false);
    };
  }, [save]);

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;

    // Bloqueo de adelanto: si saltó más de 2 s por delante del máximo visto,
    // lo devolvemos. Sólo aplica mientras la lección no esté completada.
    if (preventSkipping && !completedRef.current) {
      if (video.currentTime > maxWatchedRef.current + 2) {
        video.currentTime = maxWatchedRef.current;
        toast.info("No puedes adelantar el video en esta inducción.");
        return;
      }
    }

    maxWatchedRef.current = Math.max(maxWatchedRef.current, video.currentTime);
    setCurrentTime(video.currentTime);
  }

  function handleEnded() {
    maxWatchedRef.current = Math.max(
      maxWatchedRef.current,
      videoRef.current?.duration ?? durationSeconds,
    );
    void save(true);
  }

  const total = durationSeconds || videoRef.current?.duration || 0;
  const percent = total > 0 ? Math.min(100, (currentTime / total) * 100) : 0;
  const thresholdPercent = LESSON_COMPLETION_THRESHOLD * 100;

  if (isLocked) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border bg-muted/50 text-center">
        <Lock className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">Contenido bloqueado</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Completa el video anterior y sus preguntas de repaso para desbloquear esta
          cápsula.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border bg-black">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          controlsList={preventSkipping ? "nodownload noplaybackrate" : "nodownload"}
          onContextMenu={(event) => event.preventDefault()}
          onTimeUpdate={handleTimeUpdate}
          onPause={() => void save(false)}
          onEnded={handleEnded}
          className="aspect-video w-full"
          playsInline
        >
          Tu navegador no soporta la reproducción de video.
        </video>
      </div>

      <div className="space-y-1.5">
        <Progress value={percent} />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="tabular-nums">
            {formatDuration(currentTime)} / {formatDuration(total)}
          </span>
          <span
            className={cn(
              "flex items-center gap-1",
              watched && "font-medium text-success",
            )}
          >
            {watched ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Video completado
              </>
            ) : (
              `Debes ver al menos el ${thresholdPercent}%`
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
