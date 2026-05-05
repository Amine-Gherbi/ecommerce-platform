import type { NextAuthConfig } from "next-auth";

// Edge-safe half of the Auth.js configuration.
//
// This file must never import Prisma or `@node-rs/argon2`: middleware and any
// future Edge code may load it. The Node-only half (adapter, credentials
// provider, sign-in side effects) lives in `src/auth.ts`.
//
// Sessions are stateless JWTs. Credentials sign-in cannot use database
// sessions, and a JWT means middleware does not need a database round-trip.

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

export const authConfig = {
  // Local development, preview hosts and proxies all serve the app on a host
  // Auth.js cannot infer from AUTH_URL. Trusting Host is the documented setting
  // for self-hosted deployments.
  trustHost: true,
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  session: {
    strategy: "jwt",
    maxAge: THIRTY_DAYS_SECONDS,
  },
  // Filled in by `src/auth.ts`; kept here so the shape is shared.
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user !== undefined) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.id === "string") {
        session.user.id = token.id;
      }
      if (token.role !== undefined) {
        session.user.role = token.role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
