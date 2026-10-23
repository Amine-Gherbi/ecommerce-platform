import { Prisma } from "@prisma/client";

/**
 * True for a Postgres unique-constraint violation.
 *
 * Both the idempotency index on `(userId, idempotencyKey)` and the
 * `WebhookEvent.stripeEventId` primary key rely on this being caught rather
 * than pre-checked: the database is the arbiter, not a read-then-write.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2002";
  }
  // `instanceof` fails if a test loaded a second copy of the client; the code
  // field survives either way.
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
