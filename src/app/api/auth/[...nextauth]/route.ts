import { handlers } from "@/auth";

// Prisma and argon2 require the Node.js runtime; Auth.js defaults to it, but
// stating it prevents an accidental Edge move from breaking credentials.
export const runtime = "nodejs";

export const { GET, POST } = handlers;
