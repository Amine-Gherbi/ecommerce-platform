import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in with email and password or GitHub.",
};

// The form is a plain POST to `/login`; middleware rewrites POSTs to
// `/api/login`, which can return a real 429. No client component, so the page
// works without JavaScript.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const githubConfigured =
    typeof process.env.AUTH_GITHUB_ID === "string" &&
    process.env.AUTH_GITHUB_ID.length > 0 &&
    typeof process.env.AUTH_GITHUB_SECRET === "string" &&
    process.env.AUTH_GITHUB_SECRET.length > 0;

  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your anonymous cart is merged into your account once, during sign-in.
      </p>

      {error !== undefined && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
        >
          {error === "CredentialsSignin"
            ? "Invalid email or password. Try again."
            : "Sign-in failed. Try again."}
        </p>
      )}

      <form action="/login" method="post" className="mt-6 grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={1}
            maxLength={200}
          />
        </div>
        <Button type="submit">Sign in</Button>
      </form>

      <div className="mt-6 border-t pt-6">
        {githubConfigured ? (
          <a
            href="/api/auth/signin/github"
            className="inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent"
          >
            Continue with GitHub
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">
            GitHub OAuth is not configured in this environment
            (set <code>AUTH_GITHUB_ID</code> and <code>AUTH_GITHUB_SECRET</code>).
            The provider is implemented but unverified here.
          </p>
        )}
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        No account? Seeded local demo:{" "}
        <span className="font-medium text-foreground">demo@alder.test</span> /{" "}
        <span className="font-medium text-foreground">demo-password-123</span>
      </p>

      <p className="mt-4 text-sm">
        <Link href="/" className="underline underline-offset-4">
          Back to the catalog
        </Link>
      </p>
    </main>
  );
}
