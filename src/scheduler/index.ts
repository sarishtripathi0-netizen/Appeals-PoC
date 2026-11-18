// Simulated clock and scheduler (AMS-129). Moving the clock runs every rule once per day, in order,
// so a 30-day jump fires each event on its proper date.

import { addDays, isValidISODate } from "@/domain/dates";
import { audit, type Actor, SYSTEM_ACTOR } from "@/lib/audit";
import { getCalendar, getSettings, getToday, type RuleContext } from "@/lib/context";
import { prisma } from "@/lib/db";
import { DomainError } from "@/services/errors";
import { RULES } from "./rules";

export type RunSummary = Record<string, number>;

export async function runSchedulerForDay(today: string): Promise<RunSummary> {
  const settings = await getSettings();
  const cal = await getCalendar(prisma, settings);
  const ctx: RuleContext = { today, settings, cal };
  const summary: RunSummary = {};
  for (const rule of RULES) {
    const n = await rule.run(ctx);
    if (n) summary[rule.name] = n;
  }
  await prisma.schedulerRun.create({ data: { simDate: today, summary: JSON.stringify(summary) } });
  return summary;
}

const MAX_JUMP_DAYS = 800;

export async function advanceClockTo(actor: Actor, target: string): Promise<{ from: string; to: string; events: RunSummary }> {
  if (!isValidISODate(target)) throw new DomainError("Please choose a valid date.");
  const from = await getToday();
  if (target <= from) throw new DomainError("The demo clock only moves forward. Use “Reset demo data” to go back.");
  let steps = 0;
  const total: RunSummary = {};
  for (let d = addDays(from, 1); d <= target; d = addDays(d, 1)) {
    if (++steps > MAX_JUMP_DAYS) throw new DomainError("That is too far ahead for one jump.");
    await prisma.clockState.update({ where: { id: 1 }, data: { today: d } });
    const s = await runSchedulerForDay(d);
    for (const [k, v] of Object.entries(s)) total[k] = (total[k] ?? 0) + v;
  }
  await audit(prisma, target, { actor, action: "clock.advance", entityType: "clock", entityId: "1", before: from, after: target, details: total });
  return { from, to: target, events: total };
}

export async function advanceClockBy(actor: Actor, days: number) {
  return advanceClockTo(actor, addDays(await getToday(), days));
}

export { SYSTEM_ACTOR };
