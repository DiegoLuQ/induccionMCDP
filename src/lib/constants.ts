import type { Role } from "@prisma/client";

export const SESSION_COOKIE = "ic_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 horas

/** Intentos de PIN permitidos antes de bloquear la invitación. */
export const MAX_PIN_ATTEMPTS = 5;

/** Rango permitido de vigencia de invitaciones (regla de negocio: 24 a 48 h). */
export const MIN_INVITATION_TTL_HOURS = 24;
export const MAX_INVITATION_TTL_HOURS = 48;

/** Porcentaje de video visto para considerar la lección completada. */
export const LESSON_COMPLETION_THRESHOLD = 0.95;

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Administrador",
  ADMIN_RRHH: "Administrador RRHH",
  FUNCIONARIO: "Funcionario",
};

/**
 * Cargos y tipos de curso ahora son catálogos por colegio (tablas `positions`
 * y `course_types`), administrables desde /configuracion/catalogos. Estas
 * listas solo se usan para sembrar un colegio nuevo.
 */
export const DEFAULT_POSITIONS = [
  { slug: "docente", name: "Docente" },
  { slug: "asistente-educacion", name: "Asistente de la Educación" },
  { slug: "administrativo", name: "Administrativo" },
  { slug: "directivo", name: "Directivo" },
  { slug: "otro", name: "Otro" },
] as const;

export const DEFAULT_COURSE_TYPES = [
  { slug: "induccion", name: "Inducción" },
  { slug: "capacitacion", name: "Capacitación" },
] as const;

/** Texto a mostrar cuando un usuario o curso no tiene catálogo asignado. */
export const SIN_ASIGNAR = "Sin asignar";

/** Plataformas admitidas en las redes sociales del establecimiento. */
export const SOCIAL_PLATFORMS = [
  { value: "web", label: "Sitio web" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X (Twitter)" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "otro", label: "Otro" },
] as const;

export const SOCIAL_PLATFORM_LABELS: Record<string, string> =
  Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.value, p.label]));

/**
 * Escala de opinión de 5 puntos para las preguntas LIKERT.
 * No tiene respuesta correcta: mide percepción, no comprensión.
 */
export const LIKERT_SCALE = [
  { value: "1", label: "Muy en desacuerdo", short: "Muy en desac." },
  { value: "2", label: "En desacuerdo", short: "En desac." },
  { value: "3", label: "Ni de acuerdo ni en desacuerdo", short: "Neutral" },
  { value: "4", label: "De acuerdo", short: "De acuerdo" },
  { value: "5", label: "Muy de acuerdo", short: "Muy de acuerdo" },
] as const;

export const LIKERT_LABELS: Record<string, string> = Object.fromEntries(
  LIKERT_SCALE.map((level) => [level.value, level.label]),
);

export const PROGRESS_LABELS = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En progreso",
  COMPLETED: "Completado",
} as const;

export const SUBMISSION_LABELS = {
  PASSED: "Aprobado",
  FAILED: "Reprobado",
  PENDING_REVIEW: "En revisión",
} as const;
