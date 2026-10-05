import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RowDataPacket } from "mysql2/promise";
import { getExternalDbPool } from "@/lib/external-db";
import { slugify } from "@/lib/utils";

interface ExternalFuncionarioRow {
  id: number;
  id_colegio: number;
  nombre: string;
  rut: string;
  id_area: number | null;
  id_cargo: number | null;
  activo_portal: number;
  jefe_directo: string | null;
  jefe_directo_nombre: string | null;
  area_nombre?: string | null;
  cargo_nombre?: string | null;
  colegio_nombre?: string | null;
  colegio_codigo?: string | null;
}

export interface SyncInstitutionResult {
  institutionId: string;
  institutionName: string;
  totalExternal: number;
  created: number;
  updated: number;
  deactivated: number;
  unchanged: number;
  errors: Array<{ rut: string; name: string; error: string }>;
}

export interface SyncSummary {
  success: boolean;
  timestamp: string;
  results: SyncInstitutionResult[];
  totalCreated: number;
  totalUpdated: number;
  totalDeactivated: number;
  totalErrors: number;
}

/** Mapeo de IDs de la DB externa (db_central) a slugs de instituciones locales */
const EXTERNAL_TO_LOCAL_SLUG: Record<number, string> = {
  1: "colegio-diego-portales", // FUNDACIONPTONUEV (Colegio Diego Portales)
  2: "colegio-macaya",        // FUNDACIONMACAYA (Colegio Macaya)
};

/** Formatea texto en Title Case respetando conectores comunes en español */
function toTitleCase(str: string): string {
  if (!str) return "";
  const lowers = ["de", "del", "la", "las", "el", "los", "y", "en", "da", "do"];
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => {
      if (index > 0 && lowers.includes(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/** Normaliza el RUT chileno eliminando ceros a la izquierda y dejando formato 12345678-9 */
function normalizeRutExt(rut: string): { normalized: string; rawBody: string; dv: string } | null {
  const clean = rut.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length < 2) return null;
  const rawBody = clean.slice(0, -1).replace(/^0+/, "");
  const dv = clean.slice(-1);
  return {
    normalized: `${rawBody}-${dv}`,
    rawBody,
    dv,
  };
}

export async function syncFuncionariosFromExternalDb(
  targetInstitutionId?: string,
): Promise<SyncSummary> {
  const pool = getExternalDbPool();

  // 1. Obtener instituciones locales
  const localInstitutions = await prisma.institution.findMany({
    where: targetInstitutionId ? { id: targetInstitutionId } : {},
    select: { id: true, name: true, slug: true, domain: true },
  });

  if (localInstitutions.length === 0) {
    throw new Error("No se encontraron colegios configurados para sincronizar.");
  }

  // 2. Consultar funcionarios completos con JOIN de áreas, cargos y colegios desde db_central
  const query = `
    SELECT 
      f.id,
      f.id_colegio,
      f.nombre,
      f.rut,
      f.id_area,
      f.id_cargo,
      f.activo_portal,
      f.jefe_directo,
      f.jefe_directo_nombre,
      a.nombre AS area_nombre,
      cg.nombre AS cargo_nombre,
      c.nombre AS colegio_nombre,
      c.codigo AS colegio_codigo
    FROM fun_funcionarios f
    JOIN core_colegios c ON f.id_colegio = c.id
    LEFT JOIN fun_areas a ON f.id_area = a.id
    LEFT JOIN fun_cargos cg ON f.id_cargo = cg.id
    ORDER BY f.id_colegio, f.nombre
  `;

  const [rows] = await pool.query<RowDataPacket[]>(query);
  const externalFuncionarios = rows as ExternalFuncionarioRow[];

  const summaryResults: SyncInstitutionResult[] = [];
  let totalCreatedOverall = 0;
  let totalUpdatedOverall = 0;
  let totalDeactivatedOverall = 0;
  let totalErrorsOverall = 0;

  for (const inst of localInstitutions) {
    // Determinar qué IDs de colegio externos le corresponden a esta institución local
    const targetExtIds = Object.entries(EXTERNAL_TO_LOCAL_SLUG)
      .filter(([_, slug]) => slug === inst.slug)
      .map(([id]) => Number(id));

    const instResult: SyncInstitutionResult = {
      institutionId: inst.id,
      institutionName: inst.name,
      totalExternal: 0,
      created: 0,
      updated: 0,
      deactivated: 0,
      unchanged: 0,
      errors: [],
    };

    if (targetExtIds.length === 0) {
      summaryResults.push(instResult);
      continue;
    }

    // Filtrar funcionarios de los IDs correspondientes y ordenar para que las filas con cargo prevalezcan
    const funcionariosColegio = externalFuncionarios
      .filter((f) => targetExtIds.includes(f.id_colegio))
      .sort((a, b) => {
        const aHasCargo = a.id_cargo ? 1 : 0;
        const bHasCargo = b.id_cargo ? 1 : 0;
        return aHasCargo - bHasCargo; // Procesar los que tienen cargo al final para que sobrescriban
      });
    instResult.totalExternal = funcionariosColegio.length;

    // Cache de áreas y cargos existentes en la institución local
    const [existingAreas, existingPositions] = await Promise.all([
      prisma.area.findMany({
        where: { institutionId: inst.id },
        select: { id: true, name: true, slug: true },
      }),
      prisma.position.findMany({
        where: { institutionId: inst.id },
        select: { id: true, name: true, slug: true },
      }),
    ]);

    const areaMap = new Map<string, string>(); // slug -> id
    existingAreas.forEach((a) => areaMap.set(a.slug, a.id));

    const positionMap = new Map<string, string>(); // slug -> id
    existingPositions.forEach((p) => positionMap.set(p.slug, p.id));

    // Conjunto para registrar todos los RUTs válidos que vienen en la base de datos externa
    const validExternalRuts = new Set<string>();

    // Procesar cada funcionario
    for (const f of funcionariosColegio) {
      try {
        const rutData = normalizeRutExt(f.rut);
        if (!rutData) {
          instResult.errors.push({
            rut: f.rut,
            name: f.nombre,
            error: "Formato de RUT inválido",
          });
          continue;
        }

        validExternalRuts.add(rutData.normalized);

        const formattedName = toTitleCase(f.nombre);
        const isActive = f.activo_portal === 1;

        // Resolver o crear Área si viene informada
        let resolvedAreaId: string | null = null;
        if (f.area_nombre && f.area_nombre.trim()) {
          const areaNameClean = toTitleCase(f.area_nombre.trim());
          const areaSlug = slugify(areaNameClean);
          if (areaSlug) {
            let areaId = areaMap.get(areaSlug);
            if (!areaId) {
              const newArea = await prisma.area.upsert({
                where: {
                  institutionId_slug: {
                    institutionId: inst.id,
                    slug: areaSlug,
                  },
                },
                update: { name: areaNameClean },
                create: {
                  institutionId: inst.id,
                  name: areaNameClean,
                  slug: areaSlug,
                },
                select: { id: true },
              });
              areaId = newArea.id;
              areaMap.set(areaSlug, areaId);
            }
            resolvedAreaId = areaId;
          }
        }

        // Resolver o crear Cargo (Position) si viene informado
        let resolvedPositionId: string | null = null;
        if (f.cargo_nombre && f.cargo_nombre.trim()) {
          const cargoNameClean = toTitleCase(f.cargo_nombre.trim());
          const cargoSlug = slugify(cargoNameClean);
          if (cargoSlug) {
            let posId = positionMap.get(cargoSlug);
            if (!posId) {
              const newPos = await prisma.position.upsert({
                where: {
                  institutionId_slug: {
                    institutionId: inst.id,
                    slug: cargoSlug,
                  },
                },
                update: { name: cargoNameClean },
                create: {
                  institutionId: inst.id,
                  name: cargoNameClean,
                  slug: cargoSlug,
                },
                select: { id: true },
              });
              posId = newPos.id;
              positionMap.set(cargoSlug, posId);
            }
            resolvedPositionId = posId;
          }
        }

        // Buscar si ya existe el funcionario localmente por RUT
        const existingUser = await prisma.user.findFirst({
          where: {
            institutionId: inst.id,
            rut: rutData.normalized,
          },
          select: {
            id: true,
            name: true,
            email: true,
            corporateEmail: true,
            positionId: true,
            areaId: true,
            isActive: true,
            role: true,
          },
        });

        if (existingUser) {
          // Actualizar datos conservando personalizaciones si las hubiera
          await prisma.user.update({
            where: { id: existingUser.id },
            data: {
              name: formattedName,
              positionId: resolvedPositionId ?? existingUser.positionId,
              areaId: resolvedAreaId ?? existingUser.areaId,
              isActive: isActive,
            },
          });
          instResult.updated += 1;
        } else {
          // Generar email institucional único por RUT si no existe
          const generatedEmail = `${rutData.rawBody}@${inst.domain}`.toLowerCase();

          // Asegurar que el email generado no colisione con otro usuario existente
          const emailExists = await prisma.user.findFirst({
            where: {
              institutionId: inst.id,
              OR: [{ email: generatedEmail }, { corporateEmail: generatedEmail }],
            },
            select: { id: true },
          });

          const finalEmail = emailExists
            ? `${rutData.rawBody}.${rutData.dv}@${inst.domain}`.toLowerCase()
            : generatedEmail;

          await prisma.user.create({
            data: {
              rut: rutData.normalized,
              name: formattedName,
              email: finalEmail,
              corporateEmail: finalEmail,
              role: Role.FUNCIONARIO,
              institutionId: inst.id,
              positionId: resolvedPositionId,
              areaId: resolvedAreaId,
              isActive: isActive,
            },
          });
          instResult.created += 1;
        }
      } catch (err: unknown) {
        console.error(`[syncFuncionarios] Error procesando RUT ${f.rut}:`, err);
        instResult.errors.push({
          rut: f.rut,
          name: f.nombre,
          error: (err instanceof Error && err.message) || "Error al sincronizar funcionario",
        });
      }
    }

    // Conciliación de bajas: Desactivar funcionarios locales que NO vienen en db_central
    // (Sólo aplica a usuarios con rol FUNCIONARIO, para no afectar cuentas de administradores)
    if (validExternalRuts.size > 0) {
      const deactivationResult = await prisma.user.updateMany({
        where: {
          institutionId: inst.id,
          role: Role.FUNCIONARIO,
          rut: {
            notIn: Array.from(validExternalRuts),
          },
          isActive: true, // Sólo los que actualmente estaban activos
        },
        data: {
          isActive: false,
        },
      });

      instResult.deactivated = deactivationResult.count;
    }

    totalCreatedOverall += instResult.created;
    totalUpdatedOverall += instResult.updated;
    totalDeactivatedOverall += instResult.deactivated;
    totalErrorsOverall += instResult.errors.length;
    summaryResults.push(instResult);
  }

  return {
    success: totalErrorsOverall === 0,
    timestamp: new Date().toISOString(),
    results: summaryResults,
    totalCreated: totalCreatedOverall,
    totalUpdated: totalUpdatedOverall,
    totalDeactivated: totalDeactivatedOverall,
    totalErrors: totalErrorsOverall,
  };
}
