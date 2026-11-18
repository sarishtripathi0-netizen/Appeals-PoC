// Append-only audit log (AMS-126). Only inserts; the database refuses updates and deletes.

import type { Db } from "./db";

export type Actor = { id: string; name: string; role: string };

export const SYSTEM_ACTOR: Actor = { id: "system", name: "Sewa Setu (automatic)", role: "SYSTEM" };

export type AuditInput = {
  actor: Actor;
  action: string;
  entityType: string;
  entityId: string;
  caseRef?: string | null;
  before?: string | null;
  after?: string | null;
  outcome?: "OK" | "REFUSED";
  details?: Record<string, unknown>;
};

export async function audit(db: Db, today: string, e: AuditInput) {
  await db.auditEvent.create({
    data: {
      simDate: today,
      realTs: new Date().toISOString(),
      actorId: e.actor.id,
      actorName: e.actor.name,
      actorRole: e.actor.role,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      caseRef: e.caseRef ?? null,
      beforeStatus: e.before ?? null,
      afterStatus: e.after ?? null,
      outcome: e.outcome ?? "OK",
      details: e.details ? JSON.stringify(e.details) : null,
    },
  });
}
