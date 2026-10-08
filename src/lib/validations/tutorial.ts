import { Role } from "@prisma/client";
import { z } from "zod";
import { isAllowedVideoUrl } from "@/lib/video-embed";

export const tutorialSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().trim().min(3, "Mínimo 3 caracteres").max(200, "Máximo 200 caracteres"),
  description: z.string().trim().max(5000, "Máximo 5000 caracteres").optional().default(""),
  videoUrl: z
    .string()
    .trim()
    .min(1, "Ingresa el enlace del video")
    .max(1024, "Enlace demasiado largo")
    .refine(isAllowedVideoUrl, "Debe ser un enlace http(s) o un video del servidor"),
  /** Vacío = todos los roles. */
  roles: z.array(z.nativeEnum(Role)).default([]),
  /** Vacío = todos los cargos. */
  positionSlugs: z.array(z.string().trim().min(1).max(80)).max(200).default([]),
  orderIndex: z.coerce.number().int().min(0).max(9999).default(0),
  isPublished: z.boolean().default(true),
});

export type TutorialInput = z.input<typeof tutorialSchema>;
