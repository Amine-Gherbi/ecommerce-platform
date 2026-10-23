import type { Prisma } from "@prisma/client";

// Audit rows are written by the same transaction that performs the mutation.
// A caller that cannot pass a transaction client has no business mutating
// admin data.
export interface AuditInput {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  detail: Prisma.InputJsonValue;
}

export async function recordAudit(
  tx: Prisma.TransactionClient,
  input: AuditInput,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      detail: input.detail,
    },
  });
}
