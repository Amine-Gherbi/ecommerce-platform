import { PrismaAdapter } from "@auth/prisma-adapter";
import { verify } from "@node-rs/argon2";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";

import { authConfig } from "@/auth.config";
import { mergeCartOnSignIn } from "@/lib/cart";
import { db } from "@/lib/db";
import {
  clientIp,
  consumeRateLimit,
  loginRateLimitKeys,
} from "@/lib/rate-limit";

// Node-only half of Auth.js: Prisma adapter, argon2 password verification and
// the sign-in side effect that merges an anonymous cart.
//
// GitHub is enabled only when both AUTH_GITHUB_ID and AUTH_GITHUB_SECRET are
// set. Without a registered GitHub app the provider is absent rather than
// present-but-broken; the login page says so instead of faking the button.
const githubConfigured =
  typeof process.env.AUTH_GITHUB_ID === "string" &&
  process.env.AUTH_GITHUB_ID.length > 0 &&
  typeof process.env.AUTH_GITHUB_SECRET === "string" &&
  process.env.AUTH_GITHUB_SECRET.length > 0;

// A valid argon2id hash of a throwaway string. Verifying against it when the
// email is unknown keeps the response time in the same ballpark as a real
// account, so the login route does not become an account oracle.
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$udbUoBaIn4lHtU8Mn/0icA$csiTQp9CrJep6R2bxNBOKCQCfQOJB1nfpcSVOaCG18Y";

/**
 * Thrown when either the IP or the account window is exhausted. Auth.js turns
 * any `CredentialsSignin` into `?error=CredentialsSignin`; the login route
 * inspects the limiter itself to decide between 401 and 429, so nothing here
 * needs to leak through the URL.
 */
export class RateLimitedSignin extends CredentialsSignin {
  constructor() {
    super("Too many sign-in attempts");
  }
}

const secret =
  process.env.AUTH_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  // Development-only fallback so `npm run dev` works before the operator
  // creates a secret. Production without AUTH_SECRET fails closed in Auth.js.
  (process.env.NODE_ENV === "production"
    ? undefined
    : "p2-local-development-secret-not-for-production");

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret,
  adapter: PrismaAdapter(db),
  providers: [
    ...(githubConfigured ? [GitHub] : []),
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const emailValue = credentials?.email;
        const passwordValue = credentials?.password;
        if (
          typeof emailValue !== "string" ||
          typeof passwordValue !== "string"
        ) {
          return null;
        }

        const email = emailValue.trim().toLowerCase();
        if (email.length === 0 || passwordValue.length === 0) {
          return null;
        }

        // Consume before touching the database: a blocked attempt costs one
        // map lookup, not an argon2 verification.
        const limit = consumeRateLimit(
          loginRateLimitKeys(clientIp(request.headers), email),
        );
        if (!limit.allowed) {
          throw new RateLimitedSignin();
        }

        const user = await db.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            role: true,
            passwordHash: true,
          },
        });

        if (user?.passwordHash == null) {
          await verify(DUMMY_PASSWORD_HASH, passwordValue).catch(() => false);
          return null;
        }

        const valid = await verify(user.passwordHash, passwordValue).catch(
          () => false,
        );
        if (!valid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],
  events: {
    async signIn({ user }) {
      if (user.id === undefined) {
        return;
      }
      try {
        const result = await mergeCartOnSignIn(user.id);
        if (result?.merged === true) {
          console.info(
            `[cart] merged ${result.itemsMerged} line(s) into cart ${result.targetCartId}`,
          );
        }
      } catch (error: unknown) {
        // Sign-in itself succeeded. Keep the cookie so the next attempt can
        // retry the merge rather than silently dropping the cart.
        console.error("[cart] sign-in merge failed; cookie kept for retry", error);
      }
    },
  },
});
