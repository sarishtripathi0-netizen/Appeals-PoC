// Repeated delay flag (AMS-118): a DPS with delays in 25% or more of cases over 6 months.

import { repeatedDelay } from "@/domain/rules";
import type { RuleContext } from "@/lib/context";
import { prisma } from "@/lib/db";

export async function refreshDelayFlags({ today, settings }: RuleContext): Promise<number> {
  const apps = await prisma.application.findMany({
    where: { dueOn: { not: null, lte: today }, submittedOn: { not: null } },
    select: { dpsId: true, dueOn: true, deliveredOn: true, rejectedOn: true, closedOn: true, heldOn: true },
  });
  const byDps = new Map<string, { dueOn: string; delayed: boolean }[]>();
  for (const a of apps) {
    const finishedOn = a.deliveredOn ?? a.rejectedOn ?? a.closedOn;
    const delayed = !!a.heldOn || (finishedOn ? finishedOn > a.dueOn! : today > a.dueOn!);
    const list = byDps.get(a.dpsId) ?? [];
    list.push({ dueOn: a.dueOn!, delayed });
    byDps.set(a.dpsId, list);
  }
  let newlyFlagged = 0;
  for (const [officerId, cases] of byDps) {
    const r = repeatedDelay(cases, today, settings);
    const prev = await prisma.delayFlag.findUnique({ where: { officerId } });
    if (r.isFlagged && !prev?.isFlagged) newlyFlagged++;
    await prisma.delayFlag.upsert({
      where: { officerId },
      create: { officerId, computedOn: today, ...r },
      update: { computedOn: today, ...r },
    });
  }
  return newlyFlagged;
}
