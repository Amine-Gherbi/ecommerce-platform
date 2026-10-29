import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Unauthenticated by design: container HEALTHCHECK and Render health checks
// cannot hold a session. The query proves the process can reach PostgreSQL,
// which is the failure mode a TCP-only check would miss.
export async function GET(): Promise<Response> {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    return Response.json(
      { status: "degraded", database: "unavailable" },
      { status: 503 },
    );
  }

  return Response.json({ status: "ok", database: "ok" }, { status: 200 });
}
