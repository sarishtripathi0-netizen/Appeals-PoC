// Persists the responsibility ledger (AMS-13, AMS-38) and records Link Officer handovers.

import { buildLedger } from "@/domain/ledger";
import { audit, type Actor } from "@/lib/audit";
import { getRuleContext } from "@/lib/context";
import { type Db, prisma } from "@/lib/db";
import { notifyMany } from "@/lib/notify";
import { DomainError } from "./errors";

export function applicationEndOn(a: { deliveredOn: string | null; rejectedOn: string | null; closedOn: string | null }): string | null {
  return a.deliveredOn ?? a.rejectedOn ?? a.closedOn ?? null;
}

/** Recomputes the ledger of one application from its DPS and the recorded handovers. */
export async function rebuildLedger(db: Db, applicationId: string) {
  const app = await db.application.findUniqueOrThrow({ where: { id: applicationId } });
  if (!app.submittedOn) return;
  const handovers = await db.handover.findMany({ where: { fromDpsId: app.dpsId } });
  const spans = buildLedger(app.dpsId, app.submittedOn, applicationEndOn(app), handovers);
  await db.ledgerEntry.deleteMany({ where: { applicationId } });
  await db.ledgerEntry.createMany({ data: spans.map((s) => ({ ...s, applicationId })) });
}

/** The officer holding the application on a given day. */
export async function currentHolderId(db: Db, applicationId: string, day: string): Promise<string | null> {
  const e = await db.ledgerEntry.findFirst({
    where: { applicationId, fromOn: { lte: day }, OR: [{ toOn: null }, { toOn: { gte: day } }] },
  });
  return e?.officerId ?? null;
}

export async function recordHandover(
  actor: Actor,
  input: { fromDpsId: string; toLinkOfficerId: string; startOn: string; endOn: string; reason: string },
) {
  const { today } = await getRuleContext();
  if (!input.startOn || !input.endOn || input.endOn < input.startOn) throw new DomainError("Please choose a valid date range.");
  if (!input.reason || input.reason.trim().length < 5) throw new DomainError("Please record the reason for the handover (for example, leave or training).");
  const dps = await prisma.user.findUniqueOrThrow({ where: { id: input.fromDpsId } });
  if (!dps.officeId) throw new DomainError("This officer has no office.");

  return prisma.$transaction(async (tx) => {
    const h = await tx.handover.create({
      data: { ...input, officeId: dps.officeId!, recordedOn: today, recordedById: actor.id },
    });
    const apps = await tx.application.findMany({ where: { dpsId: input.fromDpsId, submittedOn: { not: null } } });
    const affected = apps.filter((a) => {
      const end = applicationEndOn(a);
      return a.submittedOn! <= input.endOn && (end === null || end >= input.startOn);
    });
    for (const a of affected) await rebuildLedger(tx, a.id);
    await audit(tx, today, {
      actor,
      action: "handover.record",
      entityType: "handover",
      entityId: h.id,
      details: { ...input, recordedAfterTheFact: input.startOn < today, applicationsAffected: affected.length },
    });
    const link = await tx.user.findUniqueOrThrow({ where: { id: input.toLinkOfficerId } });
    await notifyMany(tx, today, [input.fromDpsId, input.toLinkOfficerId],
      `Handover recorded: ${link.name} will hold the worklist of ${dps.name} from ${input.startOn} to ${input.endOn} (${affected.length} applications).`,
      { channels: ["DASHBOARD", "EMAIL"], entityType: "handover", entityId: h.id });
    return h;
  });
}
