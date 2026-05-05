import { redirect } from "next/navigation";

import { auth } from "@/auth";

// Protected routes call this at the top of the page. Reading the session in
// the page (not the layout) keeps the rest of the tree out of the auth path.
// `nextPath` is always an internal pathname, so slashes stay readable in the
// URL the supervisor can assert on (`/signin?next=/account`).
export function encodeNextPath(path: string): string {
  return encodeURIComponent(path).replace(/%2F/gi, "/");
}

export function safeNextPath(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === undefined) {
    return "/account";
  }
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\")
  ) {
    return "/account";
  }
  return candidate;
}

export async function requireUserId(nextPath: string): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;

  if (typeof userId !== "string" || userId.length === 0) {
    redirect(`/signin?next=${encodeNextPath(nextPath)}`);
  }

  return userId;
}
