import { NextResponse } from "next/server";

import { getCartCount } from "@/lib/cart";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const count = await getCartCount();

  return NextResponse.json(
    { count },
    { headers: { "Cache-Control": "no-store" } },
  );
}
