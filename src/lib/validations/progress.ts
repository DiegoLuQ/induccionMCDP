import { z } from "zod";
import { cuidSchema } from "./common";

/** Heartbeat del reproductor: guarda avance de visualización. */
export const trackProgressSchema = z.object({
  lessonId: cuidSchema,
  watchedSeconds: z.coerce.number().int().min(0).max(60 * 60 * 6),
  /** El cliente propone "visto"; el servidor lo re-valida contra la duración real. */
  reachedEnd: z.boolean().default(false),
});

export const startCourseSchema = z.object({
  courseId: cuidSchema,
});

export type TrackProgressInput = z.infer<typeof trackProgressSchema>;
