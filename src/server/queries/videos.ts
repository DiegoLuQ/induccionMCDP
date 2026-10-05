import "server-only";

import { readdir, stat } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import {
  ORPHAN_VIDEO_MIN_AGE_MS,
  VIDEO_PUBLIC_PREFIX,
  VIDEO_UPLOAD_DIR,
  videoFilenameFromUrl,
} from "@/lib/uploads";

export interface VideoUsage {
  lessonTitle: string;
  courseId: string;
  courseTitle: string;
  institutionName: string;
}

export interface UploadedVideoItem {
  filename: string;
  url: string;
  size: number;
  uploadedAt: Date;
  usages: VideoUsage[];
  /** Sin uso, pero subido hace menos de 24 h (puede ser un curso en edición). */
  isRecent: boolean;
}

/** Mapa nombre de archivo -> lecciones (de cualquier colegio) que lo usan. */
export async function getVideoUsageMap(): Promise<Map<string, VideoUsage[]>> {
  const lessons = await prisma.lesson.findMany({
    where: { videoUrl: { contains: VIDEO_PUBLIC_PREFIX } },
    select: {
      title: true,
      videoUrl: true,
      course: {
        select: { id: true, title: true, institution: { select: { name: true } } },
      },
    },
  });

  const map = new Map<string, VideoUsage[]>();
  for (const lesson of lessons) {
    const filename = videoFilenameFromUrl(lesson.videoUrl);
    if (!filename) continue;
    const list = map.get(filename) ?? [];
    list.push({
      lessonTitle: lesson.title,
      courseId: lesson.course.id,
      courseTitle: lesson.course.title,
      institutionName: lesson.course.institution.name,
    });
    map.set(filename, list);
  }
  return map;
}

/** Lista todos los videos de la carpeta de subidas con su uso en lecciones. */
export async function listUploadedVideos(): Promise<UploadedVideoItem[]> {
  let names: string[] = [];
  try {
    names = await readdir(VIDEO_UPLOAD_DIR);
  } catch {
    return [];
  }

  const usageMap = await getVideoUsageMap();
  const now = Date.now();
  const items: UploadedVideoItem[] = [];

  for (const filename of names) {
    if (filename.startsWith(".")) continue;
    try {
      const info = await stat(path.join(VIDEO_UPLOAD_DIR, filename));
      if (!info.isFile()) continue;
      const usages = usageMap.get(filename) ?? [];
      items.push({
        filename,
        url: `${VIDEO_PUBLIC_PREFIX}${encodeURIComponent(filename)}`,
        size: info.size,
        uploadedAt: info.mtime,
        usages,
        isRecent: usages.length === 0 && now - info.mtimeMs < ORPHAN_VIDEO_MIN_AGE_MS,
      });
    } catch {
      // Archivo eliminado entre readdir y stat: se omite.
    }
  }

  return items.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
}
