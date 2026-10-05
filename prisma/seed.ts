/**
 * Semilla de desarrollo: 2 colegios, usuarios administrativos, una inducción
 * de video único y otra de micro-videos secuenciales con evaluaciones mixtas.
 *
 *   npm run db:push && npm run db:seed
 */
import { PrismaClient, QuestionType, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  DEFAULT_COURSE_TYPES,
  DEFAULT_POSITIONS,
} from "../src/lib/constants";

const prisma = new PrismaClient();

/** Siembra los catálogos administrables de un colegio. */
async function seedCatalogs(institutionId: string) {
  await prisma.position.createMany({
    data: DEFAULT_POSITIONS.map((position, index) => ({
      institutionId,
      name: position.name,
      slug: position.slug,
      orderIndex: index,
    })),
    skipDuplicates: true,
  });

  await prisma.courseType.createMany({
    data: DEFAULT_COURSE_TYPES.map((type, index) => ({
      institutionId,
      name: type.name,
      slug: type.slug,
      orderIndex: index,
    })),
    skipDuplicates: true,
  });

  const [positions, types] = await Promise.all([
    prisma.position.findMany({
      where: { institutionId },
      select: { id: true, slug: true },
    }),
    prisma.courseType.findMany({
      where: { institutionId },
      select: { id: true, slug: true },
    }),
  ]);

  return {
    position: new Map(positions.map((p) => [p.slug, p.id])),
    type: new Map(types.map((t) => [t.slug, t.id])),
  };
}

const DEMO_VIDEO =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

async function main() {
  const passwordHash = await bcrypt.hash("Password123", 12);

  const macaya = await prisma.institution.upsert({
    where: { slug: "colegio-macaya" },
    update: {},
    create: {
      name: "Colegio Macaya",
      slug: "colegio-macaya",
      domain: "colegiomacaya.cl",
    },
  });

  const portales = await prisma.institution.upsert({
    where: { slug: "colegio-diego-portales" },
    update: {},
    create: {
      name: "Colegio Diego Portales",
      slug: "colegio-diego-portales",
      domain: "colegiodiegoportales.cl",
    },
  });

  const macayaCatalog = await seedCatalogs(macaya.id);
  await seedCatalogs(portales.id);

  // SUPER_ADMIN con acceso a ambos colegios (selector global).
  const superAdmin = await prisma.user.upsert({
    where: {
      institutionId_email: {
        institutionId: macaya.id,
        email: "informatica@colegiomacaya.cl",
      },
    },
    update: {},
    create: {
      rut: "11111111-1",
      name: "Administrador Plataforma",
      email: "informatica@colegiomacaya.cl",
      role: Role.SUPER_ADMIN,
      positionId: macayaCatalog.position.get("directivo"),
      institutionId: macaya.id,
      passwordHash,
    },
  });

  await prisma.institutionMembership.upsert({
    where: {
      userId_institutionId: {
        userId: superAdmin.id,
        institutionId: portales.id,
      },
    },
    update: {},
    create: {
      userId: superAdmin.id,
      institutionId: portales.id,
      role: Role.SUPER_ADMIN,
    },
  });

  await prisma.user.upsert({
    where: {
      institutionId_email: {
        institutionId: macaya.id,
        email: "rrhh@colegiomacaya.cl",
      },
    },
    update: {},
    create: {
      rut: "22222222-2",
      name: "Carla Soto",
      email: "rrhh@colegiomacaya.cl",
      role: Role.ADMIN_RRHH,
      positionId: macayaCatalog.position.get("administrativo"),
      institutionId: macaya.id,
      passwordHash,
    },
  });

  // --- Inducción de video único con evaluación final ---------------------
  const induccion = await prisma.course.create({
    data: {
      institutionId: macaya.id,
      title: "Inducción institucional 2026",
      description:
        "Protocolos, convivencia escolar y reglamento interno del establecimiento.",
      typeId: macayaCatalog.type.get("induccion"),
      isSequential: false,
      isPublished: true,
      targetPositions: {
        connect: ["docente", "asistente-educacion", "administrativo"]
          .map((slug) => macayaCatalog.position.get(slug))
          .filter((id): id is string => Boolean(id))
          .map((id) => ({ id })),
      },
      lessons: {
        create: [
          {
            title: "Bienvenida y protocolos institucionales",
            videoUrl: DEMO_VIDEO,
            durationSeconds: 900,
            orderIndex: 0,
          },
        ],
      },
    },
  });

  await prisma.evaluation.create({
    data: {
      courseId: induccion.id,
      title: "Evaluación final de inducción",
      passingScore: 80,
      maxAttempts: 3,
      questions: {
        create: [
          {
            type: QuestionType.MULTIPLE_CHOICE,
            prompt:
              "¿Cuál es el plazo para informar un accidente escolar según el protocolo?",
            options: ["Inmediatamente", "Dentro de 24 horas", "Dentro de una semana"],
            correctAnswer: "Inmediatamente",
            points: 2,
            orderIndex: 0,
          },
          {
            type: QuestionType.MULTIPLE_CHOICE,
            prompt: "¿Quién lidera el Comité de Convivencia Escolar?",
            options: [
              "El encargado de convivencia escolar",
              "El profesor jefe",
              "El sostenedor",
            ],
            correctAnswer: "El encargado de convivencia escolar",
            points: 1,
            orderIndex: 1,
          },
          {
            type: QuestionType.OPEN_TEXT,
            prompt:
              "Describe con tus palabras cómo aplicarías el protocolo de aula segura en tu cargo.",
            points: 2,
            orderIndex: 2,
          },
        ],
      },
    },
  });

  // --- Capacitación en micro-videos secuenciales -------------------------
  const capacitacion = await prisma.course.create({
    data: {
      institutionId: macaya.id,
      title: "Capacitación: uso de plataformas digitales",
      description: "Tres cápsulas de 5 minutos con evaluación por cápsula.",
      typeId: macayaCatalog.type.get("capacitacion"),
      isSequential: true,
      isPublished: true,
      lessons: {
        create: [
          {
            title: "Cápsula 1: acceso y seguridad de cuentas",
            videoUrl: DEMO_VIDEO,
            durationSeconds: 300,
            orderIndex: 0,
          },
          {
            title: "Cápsula 2: registro de asistencia",
            videoUrl: DEMO_VIDEO,
            durationSeconds: 300,
            orderIndex: 1,
          },
          {
            title: "Cápsula 3: comunicación con apoderados",
            videoUrl: DEMO_VIDEO,
            durationSeconds: 300,
            orderIndex: 2,
          },
        ],
      },
    },
    include: { lessons: { orderBy: { orderIndex: "asc" } } },
  });

  for (const [index, lesson] of capacitacion.lessons.entries()) {
    await prisma.evaluation.create({
      data: {
        lessonId: lesson.id,
        title: `Control cápsula ${index + 1}`,
        passingScore: 70,
        maxAttempts: 3,
        questions: {
          create: [
            {
              type: QuestionType.MULTIPLE_CHOICE,
              prompt: `¿Cuál es la idea principal de la cápsula ${index + 1}?`,
              options: [
                "Resguardar la información institucional",
                "Reducir el uso de la plataforma",
                "Delegar el registro a terceros",
              ],
              correctAnswer: "Resguardar la información institucional",
              points: 1,
              orderIndex: 0,
            },
          ],
        },
      },
    });
  }

  // Funcionario de ejemplo (ingresa por invitación + PIN).
  await prisma.user.upsert({
    where: {
      institutionId_email: {
        institutionId: macaya.id,
        email: "ana.perez@colegiomacaya.cl",
      },
    },
    update: {},
    create: {
      rut: "12345678-5",
      name: "Ana Pérez",
      email: "ana.perez@colegiomacaya.cl",
      role: Role.FUNCIONARIO,
      positionId: macayaCatalog.position.get("docente"),
      institutionId: macaya.id,
    },
  });

  console.info("Seed completado.");
  console.info("  SUPER_ADMIN: informatica@colegiomacaya.cl / Password123");
  console.info("  ADMIN_RRHH:  rrhh@colegiomacaya.cl / Password123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
