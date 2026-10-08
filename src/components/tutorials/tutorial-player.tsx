import { ExternalLink } from "lucide-react";
import { getVideoEmbed } from "@/lib/video-embed";

/** Reproduce un tutorial según el tipo de enlace (YouTube, Vimeo, Drive, MP4, …). */
export function TutorialPlayer({ url, title }: { url: string; title: string }) {
  const embed = getVideoEmbed(url);

  return (
    <div className="space-y-2">
      {embed.kind === "iframe" && (
        <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
          <iframe
            src={embed.src}
            title={title}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}
      {embed.kind === "video" && (
        <video src={embed.src} controls preload="metadata" className="aspect-video w-full rounded-md bg-black" />
      )}
      {embed.kind === "link" ? (
        <a
          href={embed.src}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-md border border-dashed p-8 text-sm font-medium text-primary hover:bg-muted/40"
        >
          <ExternalLink className="h-4 w-4" />
          Abrir el video en otra pestaña
        </a>
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Abrir en otra pestaña
        </a>
      )}
    </div>
  );
}
