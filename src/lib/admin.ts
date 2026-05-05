import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { encodeNextPath } from "@/lib/session";

// The only way into the admin console. Every admin page calls this before it
// reads data, and every admin server action calls it before it writes. A hidden
// link is presentation; this function is the guard.
//
// The role lives in the signed JWT session, which is set at sign-in. A customer
// cannot edit it without the signing secret.
export async function requireAdmin(nextPath: string = "/admin"): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;

  if (typeof userId !== "string" || userId.length === 0) {
    redirect(`/signin?next=${encodeNextPath(nextPath)}`);
  }

  if (session?.user?.role !== "ADMIN") {
    // A signed-in customer gets the account page, never a 200 admin page.
    redirect("/account");
  }

  return userId;
}

export function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export const LOW_STOCK_THRESHOLD = 5;

// Compact, operational age for the order table. UTC keeps it stable between
// the server render and any log line that quotes it.
export function formatOrderAge(createdAt: Date, now: Date = new Date()): string {
  const minutes = Math.max(
    0,
    Math.floor((now.getTime() - createdAt.getTime()) / 60_000),
  );

  if (minutes < 1) {
    return "<1m";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ${minutes % 60}m`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
