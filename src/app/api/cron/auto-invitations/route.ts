import { NextRequest, NextResponse } from "next/server";
import {
  runAllDueAutoInvitations,
  executeAutoInvitations,
} from "@/server/services/auto-invitation-service";

export const dynamic = "force-dynamic";

/**
 * Endpoint para disparar las invitaciones automáticas.
 * Protegido con Bearer Token o secret query param.
 *
 * GET /api/cron/auto-invitations
 * Headers: Authorization: Bearer <CRON_SECRET>
 * Query opcional: ?institutionId=<id>&secret=<CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7)
    : null;

  const urlSecret = req.nextUrl.searchParams.get("secret");
  const providedSecret = bearerToken || urlSecret;
  const configuredSecret = process.env.CRON_SECRET || "mcdp-cron-secret-key";

  if (providedSecret !== configuredSecret) {
    return NextResponse.json(
      { error: "No autorizado. Token de cron inválido." },
      { status: 401 },
    );
  }

  const institutionId = req.nextUrl.searchParams.get("institutionId");

  try {
    if (institutionId) {
      // Ejecución directa para una institución específica
      const res = await executeAutoInvitations(institutionId);
      return NextResponse.json({
        ok: true,
        type: "single",
        institutionId,
        ...res,
      });
    }

    // Ejecución masiva de todas las debidas según hora local
    const res = await runAllDueAutoInvitations();
    return NextResponse.json({
      ok: true,
      type: "all_due",
      ...res,
    });
  } catch (error) {
    console.error("[cron/auto-invitations] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error interno",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
