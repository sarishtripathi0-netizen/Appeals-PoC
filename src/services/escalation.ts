// Missed deadlines (AMS-69–73, 76, 84): automatic escalation, the SAA's one-time extension, and a missed remand going back to the Commission.

import type { Calendar } from "@/domain/calendar";
import { formatDate } from "@/domain/dates";
import { appealNumber } from "@/domain/numbering";
import { appealDeadline, checkSaaExtension, escalationTarget, extendedSaaDeadline } from "@/domain/rules";
import type { Level, Settings } from "@/domain/settings";
import { appealMachine, decide, type AppealStatus } from "@/domain/state-machines";
import { audit, SYSTEM_ACTOR, type Actor } from "@/lib/audit";
import { getRuleContext } from "@/lib/context";
import { prisma } from "@/lib/db";
import { notifyMany } from "@/lib/notify";
import { AUTHORITY_NAME, authorityFor, LEVEL_SHORT, notifiedDays, notifyDecider, registrarIds, startReview } from "./appeals";
import { DomainError } from "./errors";
import { check } from "./transition";

/** Statuses in which an FAA or SAA appeal is still waiting for its decision. */
export const AWAITING_DECISION: AppealStatus[] = ["FILED_LATE", "UNDER_REVIEW", "HEARING_SCHEDULED", "ORDER_DRAFTED"];

/** The authority missed its deadline: record it, and move the appeal up as the switch says. Run by the scheduler. */
export async function escalateAppeal(appealId: string, today: string, s: Settings, cal: Calendar): Promise<boolean> {
  const appeal = await prisma.appeal.findUniqueOrThrow({ where: { id: appealId }, include: { application: { include: { service: true } }, hearings: true } });
  const level = appeal.level as Level;
  const target = escalationTarget(level, s.escalationMode);
  const d = decide(appealMachine, appeal.status as AppealStatus, "escalate", "SYSTEM", { level });
  if (!target || !d.ok) return false;
  const app = appeal.application;
  const deadline = appeal.extendedDeadlineOn ?? appeal.deadlineOn!;
  const childNo = appealNumber(app.uin!, target);

  await prisma.$transaction(async (tx) => {
    await tx.appeal.update({ where: { id: appealId }, data: { status: d.to } });
    for (const h of appeal.hearings.filter((x) => x.status === "SCHEDULED"))
      await tx.hearing.update({ where: { id: h.id }, data: { status: "CANCELLED", notes: "Cancelled: the appeal moved to the next level." } });
    const existing = await tx.appeal.findUnique({ where: { appealNo: childNo } });
    const child = existing ?? await tx.appeal.create({
      data: {
        appealNo: childNo, applicationId: app.id, level: target, ground: appeal.ground, origin: "AUTO_ESCALATED", parentAppealId: appeal.id,
        status: target === "TAA" ? "SCRUTINY" : "UNDER_REVIEW", authorityId: authorityFor(app, target),
        filedOn: today, filedById: SYSTEM_ACTOR.id, groundsText: appeal.groundsText, reliefSought: appeal.reliefSought,
        windowStartOn: today, windowEndsOn: today, deadlineOn: appealDeadline(target, today, s, cal, notifiedDays(app.service, target)),
      },
    });
    await tx.missedDeadline.create({ data: { appealId, level, authorityId: appeal.authorityId!, deadlineOn: deadline, detectedOn: today, escalatedToAppealId: child.id } });
    await audit(tx, today, { actor: SYSTEM_ACTOR, action: "appeal.escalate", entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo, before: appeal.status, after: d.to, details: { deadline, to: childNo, mode: s.escalationMode } });
    await audit(tx, today, { actor: SYSTEM_ACTOR, action: "appeal.escalatedIn", entityType: "appeal", entityId: child.id, caseRef: childNo, after: child.status, details: { from: appeal.appealNo } });
    if (child.status === "UNDER_REVIEW" && !existing) await startReview(tx, child, app, today, s, cal);
    const text = `Appeal ${appeal.appealNo} was not decided by the ${AUTHORITY_NAME[level]} by ${formatDate(deadline)}. It has moved to the ${AUTHORITY_NAME[target]} as ${LEVEL_SHORT[target]} ${childNo}. The missed deadline is recorded.`;
    await notifyMany(tx, today, [app.citizenId, app.dpsId, appeal.authorityId], text, { entityType: "appeal", entityId: child.id, caseRef: childNo });
    await notifyDecider(tx, child, text, today);
    if (target === "TAA") await notifyMany(tx, today, await registrarIds(tx), text, { channels: ["DASHBOARD"], entityType: "appeal", entityId: child.id, caseRef: childNo });
  });
  return true;
}

/** The lower authority missed the remand deadline: the case goes back to the Commission (A11). */
export async function remandMissed(appealId: string, today: string): Promise<boolean> {
  const appeal = await prisma.appeal.findUniqueOrThrow({ where: { id: appealId }, include: { application: { include: { appeals: true } } } });
  const taa = appeal.application.appeals.find((a) => a.level === "TAA");
  const d = decide(appealMachine, appeal.status as AppealStatus, "remandMissed", "SYSTEM", {});
  const back = taa ? decide(appealMachine, taa.status as AppealStatus, "reopenOnRemand", "SYSTEM", {}) : null;
  if (!taa || !d.ok || !back?.ok) return false;
  await prisma.$transaction(async (tx) => {
    await tx.appeal.update({ where: { id: appealId }, data: { status: d.to } });
    await tx.missedDeadline.create({ data: { appealId, level: appeal.level, authorityId: appeal.authorityId!, deadlineOn: appeal.remandDueOn!, detectedOn: today, escalatedToAppealId: taa.id } });
    const oldVotes = await tx.vote.findMany({ where: { appealId: taa.id } });
    await tx.vote.deleteMany({ where: { appealId: taa.id } });
    await tx.appeal.update({ where: { id: taa.id }, data: { status: back.to, decidedOn: null, closedOn: null, reopenCount: { increment: 1 } } });
    await audit(tx, today, { actor: SYSTEM_ACTOR, action: "appeal.remandMissed", entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo, before: appeal.status, after: d.to, details: { remandDueOn: appeal.remandDueOn } });
    await audit(tx, today, { actor: SYSTEM_ACTOR, action: "appeal.reopen", entityType: "appeal", entityId: taa.id, caseRef: taa.appealNo, before: taa.status, after: back.to, details: { reason: "Remand deadline missed", earlierVotes: oldVotes.map((v) => ({ memberId: v.memberId, position: v.position, isCasting: v.isCasting })) } });
    const bench = await tx.bench.findUnique({ where: { appealId: taa.id } });
    await notifyMany(tx, today, [appeal.application.citizenId, appeal.authorityId, ...(bench ? JSON.parse(bench.memberIds) : []), ...(await registrarIds(tx))],
      `Appeal ${appeal.appealNo} was not decided again by ${formatDate(appeal.remandDueOn)} after remand. Third appeal ${taa.appealNo} is back with the Commission; the missed deadline is recorded.`,
      { channels: ["DASHBOARD", "EMAIL"], entityType: "appeal", entityId: taa.id, caseRef: taa.appealNo });
  });
  return true;
}

/** AMS-76: the SAA may extend its time once, with a recorded reason, up to the maximum. */
export async function extendSaa(actor: Actor, appealId: string, totalDays: number, reason: string) {
  const { today, settings: s, cal } = await getRuleContext();
  const appeal = await prisma.appeal.findUniqueOrThrow({ where: { id: appealId }, include: { application: true } });
  if (!appeal.filedOn) throw new DomainError("This appeal has not been filed.");
  const extensionError = checkSaaExtension(s.saaDecisionDays, totalDays, reason, !!appeal.extendedDeadlineOn, s);
  const to = await check(appealMachine, { ...appeal, caseRef: appeal.appealNo }, "extend", actor,
    { isAuthority: appeal.authorityId === actor.id, level: appeal.level as Level, extensionError, currentStatus: appeal.status as AppealStatus }, today);
  const extendedDeadlineOn = extendedSaaDeadline(appeal.filedOn, totalDays, s, cal);
  await prisma.$transaction(async (tx) => {
    await tx.appeal.update({ where: { id: appealId }, data: { status: to, extendedDeadlineOn, extensionReason: reason.trim() } });
    await audit(tx, today, { actor, action: "appeal.extend", entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo, details: { from: appeal.deadlineOn, to: extendedDeadlineOn, totalDays, reason } });
    await notifyMany(tx, today, [appeal.application.citizenId, appeal.application.dpsId],
      `The Second Appellate Authority has extended the time to decide appeal ${appeal.appealNo} to ${formatDate(extendedDeadlineOn)}. Reason: ${reason}`,
      { entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo });
  });
  return extendedDeadlineOn;
}
