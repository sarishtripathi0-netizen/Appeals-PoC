// Scheduler rules for breach and first appeals (AMS-14, 19, 23, 34, 41).
// Rules that send reminders fire on exactly one working day, so re-running a day never repeats them.

import { isWorkingDay, workingDaysBetween } from "@/domain/calendar";
import { formatDate } from "@/domain/dates";
import type { RuleContext } from "@/lib/context";
import { prisma } from "@/lib/db";
import { notifyMany } from "@/lib/notify";
import { breachApplication, FILED_LIVE, lapseDraft } from "@/services/appeals";
import { AWAITING_DECISION, escalateAppeal, remandMissed } from "@/services/escalation";

/** The time limit has passed while the timer is running: hold the application and draft a first appeal. */
export async function breachRule({ today, settings, cal }: RuleContext): Promise<number> {
  const due = await prisma.application.findMany({ where: { status: "IN_PROGRESS", dueOn: { lt: today }, heldOn: null }, include: { service: true } });
  let n = 0;
  for (const app of due) if (await breachApplication(app, today, settings, cal)) n++;
  return n;
}

export async function draftLapseRule({ today, settings }: RuleContext): Promise<number> {
  const expired = await prisma.appeal.findMany({ where: { status: "DRAFT", linkExpiresOn: { lt: today } }, select: { id: true } });
  let n = 0;
  for (const a of expired) if (await lapseDraft(a.id, today, settings)) n++;
  return n;
}

/** On the first working day after a reply was due, tell the DPS and the authority. */
export async function replyOverdueRule({ today, cal }: RuleContext): Promise<number> {
  if (!isWorkingDay(today, cal)) return 0;
  const replies = await prisma.respondentReply.findMany({
    where: { submittedOn: null, dueOn: { lt: today }, appeal: { status: { in: FILED_LIVE } } },
    include: { appeal: true },
  });
  let n = 0;
  for (const r of replies) {
    if (workingDaysBetween(r.dueOn, today, cal) !== 1) continue;
    await notifyMany(prisma, today, [r.dpsId, r.appeal.authorityId],
      `The DPS reply in appeal ${r.appeal.appealNo} was due on ${formatDate(r.dueOn)} and has not been given. The authority may decide on the record.`,
      { channels: ["DASHBOARD", "EMAIL"], entityType: "appeal", entityId: r.appealId, caseRef: r.appeal.appealNo });
    n++;
  }
  return n;
}

/** Reminders to the deciding authority at set shares of the time used, and a few working days before the deadline. */
export async function deadlineReminderRule({ today, settings, cal }: RuleContext): Promise<number> {
  if (!isWorkingDay(today, cal)) return 0;
  const appeals = await prisma.appeal.findMany({
    where: { level: { in: ["FAA", "SAA"] }, status: { in: ["FILED_LATE", "UNDER_REVIEW", "HEARING_SCHEDULED", "ORDER_DRAFTED"] }, filedOn: { not: null }, deadlineOn: { not: null } },
  });
  let n = 0;
  for (const a of appeals) {
    const deadline = a.extendedDeadlineOn ?? a.deadlineOn!;
    if (deadline < today) continue;
    const total = workingDaysBetween(a.filedOn!, deadline, cal);
    const used = workingDaysBetween(a.filedOn!, today, cal);
    const left = workingDaysBetween(today, deadline, cal);
    const hit = settings.reminderFractions.find((f) => used === Math.ceil(f * total));
    const text =
      left === settings.reminderDaysBefore ? `Final reminder: appeal ${a.appealNo} must be decided by ${formatDate(deadline)} (${left} working days left). If it is not, it moves to the next level.` :
      hit !== undefined ? `Reminder: ${Math.round(hit * 100)}% of the time to decide appeal ${a.appealNo} has passed. Decide by ${formatDate(deadline)} (${left} working days left).` :
      null;
    if (!text) continue;
    await notifyMany(prisma, today, [a.authorityId], text, { channels: ["DASHBOARD", "EMAIL"], entityType: "appeal", entityId: a.id, caseRef: a.appealNo });
    n++;
  }
  return n;
}

/** AMS-69: an FAA or SAA appeal past its deadline moves up; a remanded one goes back to the Commission. */
export async function escalationRule({ today, settings, cal }: RuleContext): Promise<number> {
  const waiting = await prisma.appeal.findMany({ where: { level: { in: ["FAA", "SAA"] }, status: { in: AWAITING_DECISION }, deadlineOn: { not: null } } });
  let n = 0;
  for (const a of waiting) {
    const deadline = a.extendedDeadlineOn ?? a.deadlineOn!;
    if (deadline >= today) continue;
    const moved = a.remandCycle > 0 && a.remandDueOn === deadline ? await remandMissed(a.id, today) : await escalateAppeal(a.id, today, settings, cal);
    if (moved) n++;
  }
  return n;
}
