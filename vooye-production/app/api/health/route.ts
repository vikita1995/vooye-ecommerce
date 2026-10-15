import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // A successful response confirms the app can reach PostgreSQL.
    await db.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: "ok",
        service: "vooye",
        dependencies: { database: "ok" },
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // Never return database connection details to callers.
    console.error(
      "Health check database probe failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return NextResponse.json(
      {
        status: "degraded",
        service: "vooye",
        dependencies: { database: "unavailable" },
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
