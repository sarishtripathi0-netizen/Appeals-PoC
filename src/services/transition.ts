// Shared helper: check a state machine; log refusals; throw a DomainError the UI can show.

import { decide, type Machine, type Role } from "@/domain/state-machines";
import { audit, type Actor } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { DomainError } from "./errors";

export async function check<S extends string, E extends string, C>(
  machine: Machine<S, E, C>,
  entity: { id: string; status: string; caseRef?: string | null },
  event: E,
  actor: Actor,
  ctx: C,
  today: string,
): Promise<S> {
  const d = decide(machine, entity.status as S, event, actor.role as Role, ctx);
  if (d.ok) return d.to;
  // Refusals are logged outside any transaction so they survive the rollback.
  await audit(prisma, today, {
    actor,
    action: `${machine.name}.${event}`,
    entityType: machine.name,
    entityId: entity.id,
    caseRef: entity.caseRef,
    before: entity.status,
    after: entity.status,
    outcome: "REFUSED",
    details: { reason: d.reason, refusalCode: d.refusalCode },
  });
  throw new DomainError(d.reason, d.refusalCode);
}
