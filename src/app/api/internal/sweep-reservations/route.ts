import { sweepExpiredReservations } from "@/lib/reservations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Callable sweeper: `curl -X POST localhost:3000/api/internal/sweep-reservations`.
// An external scheduler can run this every minute. When SWEEPER_SECRET is set
// the caller must present it; production refuses to run unconfigured.
export async function POST(request: Request): Promise<Response> {
  const configured = process.env.SWEEPER_SECRET;
  if (configured !== undefined && configured.length > 0) {
    const provided = request.headers.get("x-sweeper-secret");
    if (provided !== configured) {
      return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return Response.json(
      { error: "SWEEPER_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const result = await sweepExpiredReservations();
  return Response.json(result, { status: 200 });
}
