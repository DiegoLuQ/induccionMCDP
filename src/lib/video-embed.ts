/** Igual que en `@/lib/uploads` (no se importa: ese módulo usa `path` y es sólo del servidor). */
const VIDEO_PUBLIC_PREFIX = "/uploads/videos/";

/**
 * Cómo mostrar un enlace de video:
 *   - "iframe": plataformas con reproductor incrustable (YouTube, Vimeo, Drive, Loom).
 *   - "video":  archivo directo (MP4/WebM) o video subido al servidor.
 *   - "link":   cualquier otro enlace; sólo se ofrece abrirlo en otra pestaña.
 */
export type VideoEmbed =
  | { kind: "iframe"; src: string; thumbnail?: string }
  | { kind: "video"; src: string }
  | { kind: "link"; src: string };

const DIRECT_VIDEO = /\.(mp4|m4v|webm|ogg|ogv|mov)(\?|#|$)/i;

export function isAllowedVideoUrl(url: string): boolean {
  if (url.startsWith(VIDEO_PUBLIC_PREFIX)) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
  if (url.pathname === "/watch") return url.searchParams.get("v");
  const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/);
  return match?.[1] ?? null;
}

export function getVideoEmbed(rawUrl: string): VideoEmbed {
  const url = rawUrl.trim();
  if (url.startsWith(VIDEO_PUBLIC_PREFIX) || DIRECT_VIDEO.test(url)) return { kind: "video", src: url };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "link", src: url };
  }
  const host = parsed.hostname.replace(/^www\./, "");

  const yt = youtubeId(parsed);
  if (yt && /^[\w-]{6,20}$/.test(yt)) {
    return {
      kind: "iframe",
      src: `https://www.youtube-nocookie.com/embed/${yt}?rel=0`,
      thumbnail: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
    };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = parsed.pathname.match(/(\d{5,})/)?.[1];
    if (id) return { kind: "iframe", src: `https://player.vimeo.com/video/${id}` };
  }

  if (host === "drive.google.com") {
    const id = parsed.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ?? parsed.searchParams.get("id");
    if (id) return { kind: "iframe", src: `https://drive.google.com/file/d/${id}/preview` };
  }

  if (host === "loom.com") {
    const id = parsed.pathname.match(/\/(?:share|embed)\/([\w-]+)/)?.[1];
    if (id) return { kind: "iframe", src: `https://www.loom.com/embed/${id}` };
  }

  return { kind: "link", src: url };
}
