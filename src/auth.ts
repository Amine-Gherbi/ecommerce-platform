import { verify } from "@node-rs/argon2";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
import { db } from "@/lib/db";

// Node-only half of Auth.js. Sessions are JWTs, so there is no adapter table;
// credentials are verified against the Argon2id hash stored on User.

// A valid Argon2id hash of a throwaway string. Verifying against it when the
// email is unknown keeps response times similar to a real account.
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$udbUoBaIn4lHtU8Mn/0icA$csiTQp9CrJep6R2bxNBOKCQCfQOJB1nfpcSVOaCG18Y";

const secret =
  process.env.AUTH_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  (process.env.NODE_ENV === "production"
    ? undefined
    : "p2-local-development-secret-not-for-production");

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret,
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const emailValue = credentials?.email;
        const passwordValue = credentials?.password;
        if (typeof emailValue !== "string" || typeof passwordValue !== "string") {
          return null;
        }

        const email = emailValue.trim().toLowerCase();
        if (email.length === 0 || passwordValue.length === 0) {
          return null;
        }

        const user = await db.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            passwordHash: true,
          },
        });

        if (user === null) {
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
          role: user.role,
        };
      },
    }),
  ],
});
