import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

// The JWT callback copies these onto the token; the session callback copies
// them back onto `session.user`. Declaring them here keeps every `session.user`
// access typed without casts.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
  }
}

// Auth.js v5's `next-auth/jwt` is a re-export, so the interface that actually
// merges is the one in `@auth/core/jwt`.
declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
  }
}
