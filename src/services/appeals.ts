// Appeal use-cases up to the decision (AMS-14 to AMS-52, 74, 77): drafts on breach, rejection or an undelivered decision,
// filing at every level, decline and lapse, late filing, respondent reply and hearings. Orders live in ./orders.

import { randomBytes } from "node:crypto";
import type { Appeal, Application, Service } from "@prisma/client";
import { videoConferencing } from "@/adapters";
import { addPeriod, addWorkingDays, isWorkingDay, type Calendar } from "@/domain/calendar";
import { addDays, formatDate, isValidISODate } from "@/domain/dates";
import { appealNumber } from "@/domain/numbering";
import { appealDeadline, checkFilingWindow, checkHearingNotice, filingWindowDays } from "@/domain/rules";
import type { Level, Settings } from "@/domain/settings";
import { appealMachine, applicationMachine, decide, hearingMachine, type AppealCtx, type AppealStatus } from "@/domain/state-machines";
import { audit, SYSTEM_ACTOR, type Actor } from "@/lib/audit";
import { getRuleContext } from "@/lib/context";
import { type Db, parseJson, prisma } from "@/lib/db";
import { notifyMany, notifyUser } from "@/lib/notify";
import { DomainError } from "./errors";
import { check } from "./transition";

export type Ground = "DELAY" | "REJECTION";

/** Appeals that have been filed and are not finished. */
export const FILED_LIVE: AppealStatus[] = [
  "FILED_LATE", "SCRUTINY", "RETURNED", "UNDER_REVIEW", "HEARING_SCHEDULED", "ORDER_DRAFTED", "AWAITING_AUTHENTICATION", "COMPLIANCE", "AWAITING_CONFIRMATION",
];

export const IN_PERSON_REASONS = ["The citizen does not have digital access", "Original records must be examined"];

/** Where the SMS and email links point. The messages log turns these into links inside the demo. */
export const DEMO_LINK_HOST = "sewasetu-demo.example";
export const draftLink = (token: string) => `${DEMO_LINK_HOST}/a/${token}`;

export const LEVEL_SHORT: Record<Level, string> = { FAA: "first appeal", SAA: "second appeal", TAA: "third appeal" };
export const AUTHORITY_NAME: Record<Level, string> = { FAA: "First Appellate Authority", SAA: "Second Appellate Authority", TAA: "RTPS Commission" };
export const PREVIOUS_LEVEL: Record<Level, Level | null> = { FAA: null, SAA: "FAA", TAA: "SAA" };
export const NEXT_LEVEL: Record<Level, Level | null> = { FAA: "SAA", SAA: "TAA", TAA: null };
const LEVEL_ORDER: Record<string, number> = { FAA: 1, SAA: 2, TAA: 3 };

type AppWithService = Application & { service: Service };

const needText = (v: string | null | undefined, min = 10) => !!v && v.trim().length >= min;
const DELIVERED = ["DELIVERED", "DELIVERED_CONFIRMED"];

/** Stipulated time for the appellate authority in the service's own notification, if any. */
export function notifiedDays(service: Pick<Service, "faaDays" | "saaDays">, level: Level): number | null {
  return level === "FAA" ? service.faaDays : level === "SAA" ? service.saaDays : null;
}

export function authorityFor(app: Pick<Application, "faaId" | "saaId">, level: Level): string | null {
  return level === "FAA" ? app.faaId : level === "SAA" ? app.saaId : null;
}

export async function registrarIds(db: Db): Promise<string[]> {
  return (await db.user.findMany({ where: { role: "REGISTRAR" }, select: { id: true } })).map((u) => u.id);
}

/** The authority, or for the Commission the Registrar, who must act on a newly arrived appeal. */
export async function notifyDecider(db: Db, appeal: Pick<Appeal, "id" | "appealNo" | "level" | "authorityId">, text: string, today: string) {
  const ids = appeal.level === "TAA" ? await registrarIds(db) : [appeal.authorityId];
  await notifyMany(db, today, ids, text, { channels: ["DASHBOARD", "EMAIL"], entityType: "appeal", entityId: appeal.id, caseRef: appeal.appealNo });
}

/** Whether the user decides this appeal: the authority, or a member of the Commission bench. */
export async function isDecider(db: Db, appeal: Pick<Appeal, "id" | "level" | "authorityId">, userId: string): Promise<boolean> {
  if (appeal.level !== "TAA") return appeal.authorityId === userId;
  const bench = await db.bench.findUnique({ where: { appealId: appeal.id } });
  return !!bench && parseJson<string[]>(bench.memberIds, []).includes(userId);
}

function defaultGrounds(app: AppWithService, ground: Ground, parent?: Pick<Appeal, "appealNo" | "level" | "decidedOn"> | null): string {
  const base = ground === "DELAY"
    ? `I applied for ${app.service.name} on ${formatDate(app.submittedOn)} (UIN ${app.uin}). The notified time limit is ${app.timeLimitDays ?? app.service.timeLimitWorkingDays} working days, so it was due by ${formatDate(app.dueOn)}. It has not been delivered within the time limit.`
    : `My application for ${app.service.name} (UIN ${app.uin}) was rejected on ${formatDate(app.rejectedOn)} with the reasons: "${app.rejectionReasons}". I believe the rejection is not correct.`;
  return parent
    ? `${base} The ${AUTHORITY_NAME[parent.level as Level]} decided appeal ${parent.appealNo} on ${formatDate(parent.decidedOn)}, but the service has still not been delivered.`
    : base;
}

function defaultRelief(ground: Ground): string {
  return ground === "DELAY"
    ? "Direct the office to deliver the service, and act under the Act on the delay."
    : "Set the rejection aside and direct the office to deliver the service.";
}

/** AMS-25, AMS-26: only two grounds, and each must match the application. */
export function groundError(app: Application, ground: Ground): string | null {
  if (ground === "DELAY" && !app.heldOn) return `An appeal for delay can be filed only after the time limit has passed. This application is due by ${formatDate(app.dueOn)}.`;
  if (ground === "REJECTION" && app.status !== "REJECTED") return "An appeal against rejection can be filed only for a rejected application.";
  return null;
}

/** AMS-74, 77: a citizen's next appeal needs a decided, closed appeal below it and an undelivered service. */
export function nextLevelError(app: Application, parent: Pick<Appeal, "status" | "decidedOn"> | undefined, level: Level): string | null {
  const prev = PREVIOUS_LEVEL[level]!;
  if (!parent || !parent.decidedOn || parent.status !== "CLOSED")
    return `A ${LEVEL_SHORT[level]} can be filed only after the ${AUTHORITY_NAME[prev]} has decided the ${LEVEL_SHORT[prev]}.`;
  if (DELIVERED.includes(app.status)) return "The service has been delivered, so there is nothing further to appeal.";
  return null;
}

async function headOfOffice(db: Db, officeId: string) {
  return (await db.office.findUnique({ where: { id: officeId } }))?.headOfOfficeId ?? null;
}

// ---------- Drafts (AMS-18, 19, 24, 74) ----------

export async function createDraftAppeal(
  db: Db, app: AppWithService, ground: Ground, today: string, s: Settings, cal: Calendar,
  opts: { level?: Level; parent?: Pick<Appeal, "id" | "appealNo" | "level" | "decidedOn"> } = {},
) {
  const level = opts.level ?? "FAA";
  const appealNo = appealNumber(app.uin!, level);
  const existing = await db.appeal.findUnique({ where: { appealNo } });
  if (existing) return existing;
  const linkToken = randomBytes(9).toString("base64url");
  const linkExpiresOn = addDays(today, s.draftLinkValidityDays);
  const appeal = await db.appeal.create({
    data: {
      appealNo, applicationId: app.id, level, ground, origin: "AUTO_DRAFT", status: "DRAFT", authorityId: authorityFor(app, level), parentAppealId: opts.parent?.id,
      draftCreatedOn: today, linkToken, linkExpiresOn, groundsText: defaultGrounds(app, ground, opts.parent), reliefSought: defaultRelief(ground),
      windowStartOn: today, windowEndsOn: addPeriod(today, filingWindowDays(level, s), s.windowBasis, cal),
    },
  });
  await audit(db, today, { actor: SYSTEM_ACTOR, action: "appeal.draft", entityType: "appeal", entityId: appeal.id, caseRef: appealNo, after: "DRAFT", details: { level, ground, linkExpiresOn } });
  const what = opts.parent
    ? `Appeal ${opts.parent.appealNo} has been decided, but your ${app.service.name} (${app.uin}) has still not been delivered.`
    : ground === "DELAY" ? `Your ${app.service.name} (${app.uin}) was not delivered by ${formatDate(app.dueOn)}.` : `Your application ${app.uin} was rejected.`;
  await notifyUser(db, today, app.citizenId,
    `Sewa Setu: ${what} We have prepared a ${LEVEL_SHORT[level]} for you. File it, change it or decline it here: ${draftLink(linkToken)} (valid until ${formatDate(linkExpiresOn)}). Nothing is filed without you.`,
    { entityType: "appeal", entityId: appeal.id, caseRef: appealNo });
  return appeal;
}

// ---------- Breach (AMS-14, 15, 17) — run by the scheduler ----------

export async function breachApplication(app: AppWithService, today: string, s: Settings, cal: Calendar) {
  const d = decide(applicationMachine, app.status as "IN_PROGRESS", "breach", "SYSTEM", {});
  if (!d.ok) return false;
  await prisma.$transaction(async (tx) => {
    await tx.application.update({ where: { id: app.id }, data: { status: d.to, heldOn: today } });
    await audit(tx, today, { actor: SYSTEM_ACTOR, action: "application.breach", entityType: "application", entityId: app.id, caseRef: app.uin, before: app.status, after: d.to, details: { dueOn: app.dueOn } });
    await notifyMany(tx, today, [app.dpsId, await headOfOffice(tx, app.officeId)],
      `Time limit passed on ${app.uin} (${app.service.name}, due ${formatDate(app.dueOn)}). The application is on hold: it can still be delivered, but not closed or rejected.`,
      { channels: ["DASHBOARD", "EMAIL"], entityType: "application", entityId: app.id, caseRef: app.uin });
    await createDraftAppeal(tx, { ...app, heldOn: today }, "DELAY", today, s, cal);
  });
  return true;
}

// ---------- Filing at every level (AMS-20, 21, 27–30, 74, 77) ----------

export type FileInput = { applicationId: string; level?: Level; ground?: Ground; groundsText?: string; reliefSought?: string; lateReason?: string };

export async function fileAppeal(actor: Actor, input: FileInput) {
  const { today, settings: s, cal } = await getRuleContext();
  const level = input.level ?? "FAA";
  const app = await prisma.application.findUniqueOrThrow({ where: { id: input.applicationId }, include: { service: true, appeals: true } });
  if (actor.role === "CITIZEN" && app.citizenId !== actor.id) throw new DomainError("This is not your application.");
  if (!app.uin) throw new DomainError("This application has not been submitted, so there is nothing to appeal.");
  const appealNo = appealNumber(app.uin, level);
  const existing = app.appeals.find((a) => a.appealNo === appealNo);

  let ground: Ground;
  let windowStart: string;
  let parent: Appeal | undefined;
  if (level === "FAA") {
    ground = (existing?.ground as Ground | undefined) ?? input.ground ?? (app.status === "REJECTED" ? "REJECTION" : "DELAY");
    const gErr = existing ? null : groundError(app, ground);
    if (gErr) throw new DomainError(gErr);
    windowStart = existing?.windowStartOn ?? (ground === "DELAY" ? app.heldOn! : app.rejectedOn!);
  } else {
    parent = existing?.parentAppealId
      ? app.appeals.find((a) => a.id === existing.parentAppealId)
      : app.appeals.find((a) => a.level === PREVIOUS_LEVEL[level]);
    const nErr = existing ? null : nextLevelError(app, parent, level);
    if (nErr) throw new DomainError(nErr);
    ground = (existing?.ground ?? parent!.ground) as Ground;
    windowStart = existing?.windowStartOn ?? parent!.decidedOn!;
  }

  const w = checkFilingWindow(level, windowStart, today, s, cal);
  const groundsText = input.groundsText?.trim() || existing?.groundsText || defaultGrounds(app, ground, parent);
  const reliefSought = input.reliefSought?.trim() || existing?.reliefSought || defaultRelief(ground);
  if (!needText(groundsText, 20)) throw new DomainError("Please explain the grounds of the appeal in a sentence or two.");
  const ctx: AppealCtx = {
    level,
    isLate: w.status === "LATE_NEEDS_REASON",
    lateReason: input.lateReason,
    windowNotAllowedMessage: w.status === "NOT_ALLOWED" ? w.message : null,
  };
  const to = await check(appealMachine, { id: existing?.id ?? appealNo, status: existing?.status ?? "DRAFT", caseRef: appealNo }, "file", actor, ctx, today);
  const deadlineOn = appealDeadline(level, today, s, cal, notifiedDays(app.service, level));

  return prisma.$transaction(async (tx) => {
    const data = {
      status: to, filedOn: today, filedById: actor.id, groundsText, reliefSought, deadlineOn, windowEndsOn: w.windowEndsOn,
      isLate: !!ctx.isLate, lateReason: ctx.isLate ? input.lateReason!.trim() : null,
    };
    const appeal = existing
      ? await tx.appeal.update({ where: { id: existing.id }, data })
      : await tx.appeal.create({
          data: {
            ...data, appealNo, applicationId: app.id, level, ground, origin: actor.role === "CALL_CENTRE" ? "ASSISTED" : "CITIZEN",
            authorityId: authorityFor(app, level), parentAppealId: parent?.id, windowStartOn: windowStart,
          },
        });
    await audit(tx, today, {
      actor, action: "appeal.file", entityType: "appeal", entityId: appeal.id, caseRef: appealNo, before: existing?.status ?? null, after: to,
      details: { level, ground, isLate: !!ctx.isLate, deadlineOn, edited: !!existing && groundsText !== existing.groundsText },
    });
    const next =
      to === "FILED_LATE" ? "It was filed after the filing window, so the authority will first decide whether to accept your reason." :
      to === "SCRUTINY" ? `The Registrar of the Commission will check it first. The Commission aims to decide within ${s.commissionTargetDays} working days.` :
      `It should be decided by ${formatDate(deadlineOn)}.`;
    await notifyUser(tx, today, app.citizenId, `Sewa Setu: Your ${LEVEL_SHORT[level]} ${appealNo} has been filed with the ${AUTHORITY_NAME[level]}. ${next}`,
      { entityType: "appeal", entityId: appeal.id, caseRef: appealNo });
    await notifyDecider(tx, appeal,
      `New ${LEVEL_SHORT[level]} ${appealNo} (${ground === "DELAY" ? "delay" : "rejection"})${to === "FILED_LATE" ? ": filed late, reason to be considered" : to === "SCRUTINY" ? ": for scrutiny" : `; decide by ${formatDate(deadlineOn)}`}.`, today);
    if (to === "UNDER_REVIEW") await startReview(tx, appeal, app, today, s, cal);
    return appeal;
  });
}

/** AMS-39, 41: the DPS is told they are the respondent and given a reply date. */
export async function startReview(db: Db, appeal: Pick<Appeal, "id" | "appealNo" | "level">, app: Application, today: string, s: Settings, cal: Calendar) {
  const dueOn = addWorkingDays(today, s.replyDays, cal);
  await db.respondentReply.create({ data: { appealId: appeal.id, dpsId: app.dpsId, requestedOn: today, dueOn } });
  await notifyUser(db, today, app.dpsId,
    `You are the respondent in ${LEVEL_SHORT[appeal.level as Level]} ${appeal.appealNo} on ${app.uin}. Please give your reply on Sewa Setu by ${formatDate(dueOn)}.`,
    { entityType: "appeal", entityId: appeal.id, caseRef: appeal.appealNo });
}

// ---------- Decline, lapse, release (AMS-22, 23) ----------

export async function declineDraft(actor: Actor, appealId: string, reason: string) {
  const { today, settings: s } = await getRuleContext();
  const appeal = await prisma.appeal.findUniqueOrThrow({ where: { id: appealId }, include: { application: true } });
  if (actor.role === "CITIZEN" && appeal.application.citizenId !== actor.id) throw new DomainError("This is not your appeal.");
  const to = await check(appealMachine, { ...appeal, caseRef: appeal.appealNo }, "decline", actor, {}, today);
  await prisma.$transaction(async (tx) => {
    await tx.appeal.update({ where: { id: appealId }, data: { status: to, declinedOn: today, declineReason: reason || null } });
    await audit(tx, today, { actor, action: "appeal.decline", entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo, before: appeal.status, after: to, details: { reason } });
    if (appeal.level === "FAA") await afterDeclineOrLapse(tx, appeal.application, appeal.windowEndsOn, "declined", today, s);
  });
}

/** The draft link expired without action (run by the scheduler). */
export async function lapseDraft(appealId: string, today: string, s: Settings) {
  const appeal = await prisma.appeal.findUniqueOrThrow({ where: { id: appealId }, include: { application: true } });
  const d = decide(appealMachine, appeal.status as AppealStatus, "lapse", "SYSTEM", {});
  if (!d.ok) return false;
  await prisma.$transaction(async (tx) => {
    await tx.appeal.update({ where: { id: appealId }, data: { status: d.to } });
    await audit(tx, today, { actor: SYSTEM_ACTOR, action: "appeal.lapse", entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo, before: appeal.status, after: d.to });
    await notifyUser(tx, today, appeal.application.citizenId,
      `Sewa Setu: The link to your draft appeal ${appeal.appealNo} has expired. You can still file an appeal from your Sewa Setu dashboard until ${formatDate(appeal.windowEndsOn)}.`,
      { entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo });
    if (appeal.level === "FAA") await afterDeclineOrLapse(tx, appeal.application, appeal.windowEndsOn, "lapsed", today, s);
  });
  return true;
}

/** The policy switch (AMS-23): keep the application held and flag it to the Head of Office, or release it to the DPS. */
async function afterDeclineOrLapse(db: Db, app: Application, windowEndsOn: string | null, why: "declined" | "lapsed", today: string, s: Settings) {
  if (app.status !== "HELD") return;
  const what = why === "declined" ? "the citizen declined the draft appeal" : "the citizen did not act on the draft appeal before the link expired";
  if (s.onDeclineOrLapse === "RELEASE_TO_DPS") {
    const d = decide(applicationMachine, "HELD", "release", "SYSTEM", {});
    if (!d.ok) return;
    await db.application.update({ where: { id: app.id }, data: { status: d.to, releasedOn: today, releaseReason: `Released under the policy switch: ${what}.` } });
    await audit(db, today, { actor: SYSTEM_ACTOR, action: "application.release", entityType: "application", entityId: app.id, caseRef: app.uin, before: "HELD", after: d.to, details: { switch: "RELEASE_TO_DPS", why } });
    await notifyUser(db, today, app.dpsId,
      `Application ${app.uin} is released back to you: ${what}. Please complete it. The citizen can still appeal until ${formatDate(windowEndsOn)}.`,
      { channels: ["DASHBOARD", "EMAIL"], entityType: "application", entityId: app.id, caseRef: app.uin });
  } else {
    await db.application.update({ where: { id: app.id }, data: { flaggedToHoO: true } });
    await audit(db, today, { actor: SYSTEM_ACTOR, action: "application.flagToHoO", entityType: "application", entityId: app.id, caseRef: app.uin, details: { switch: "HOLD_FLAG_HOO", why } });
    await notifyMany(db, today, [await headOfOffice(db, app.officeId)],
      `Application ${app.uin} stays on hold: ${what}. You can release it with a recorded reason once the filing window closes on ${formatDate(windowEndsOn)}.`,
      { channels: ["DASHBOARD", "EMAIL"], entityType: "application", entityId: app.id, caseRef: app.uin });
  }
}

type AppealWindowRow = { status: string; filedOn: string | null; windowEndsOn: string | null; level: string; decidedOn: string | null };

/** Whether the citizen can still appeal at any level, or has an appeal open. While true, a held application cannot be released. */
export function appealPossibleOrOpen(app: Pick<Application, "heldOn" | "status">, appeals: AppealWindowRow[], today: string, s: Settings, cal: Calendar): boolean {
  if (appeals.some((a) => FILED_LIVE.includes(a.status as AppealStatus) || a.status === "DRAFT")) return true;
  const faa = appeals.find((a) => a.level === "FAA");
  if (!faa?.filedOn) {
    const windowEnd = faa?.windowEndsOn ?? (app.heldOn ? addPeriod(app.heldOn, s.firstAppealWindowDays, s.windowBasis, cal) : null);
    return !!windowEnd && today <= windowEnd;
  }
  // After a decision, the next level stays open while its window (with the late-filing allowance for the Commission) runs.
  const last = appeals.filter((a) => a.decidedOn && a.status === "CLOSED").sort((a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level])[0];
  const next = last ? NEXT_LEVEL[last.level as Level] : null;
  if (!last || !next || appeals.some((a) => a.level === next) || DELIVERED.includes(app.status)) return false;
  const days = next === "TAA" ? s.thirdAppealHardCapDays : s.secondAppealWindowDays;
  return today <= addPeriod(last.decidedOn!, days, s.windowBasis, cal);
}

export async function releaseHeld(actor: Actor, applicationId: string, reason: string) {
  const { today, settings: s, cal } = await getRuleContext();
  const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, include: { appeals: true, office: true } });
  if (app.office.headOfOfficeId !== actor.id) throw new DomainError("This application is not in your office.");
  const ctx = { appealPossibleOrOpen: appealPossibleOrOpen(app, app.appeals, today, s, cal), reasons: reason };
  const to = await check(applicationMachine, { ...app, caseRef: app.uin }, "release", actor, ctx, today);
  await prisma.$transaction(async (tx) => {
    await tx.application.update({ where: { id: app.id }, data: { status: to, releasedOn: today, releaseReason: reason, flaggedToHoO: false } });
    await audit(tx, today, { actor, action: "application.release", entityType: "application", entityId: app.id, caseRef: app.uin, before: app.status, after: to, details: { reason } });
    await notifyUser(tx, today, app.dpsId, `Application ${app.uin} has been released back to you by the Head of Office. Reason: ${reason}`,
      { channels: ["DASHBOARD", "EMAIL"], entityType: "application", entityId: app.id, caseRef: app.uin });
  });
}

// ---------- Late filing at FAA and SAA (AMS-28) ----------

export async function decideLateFiling(actor: Actor, appealId: string, accept: boolean, reasons: string) {
  const { today, settings: s, cal } = await getRuleContext();
  const appeal = await prisma.appeal.findUniqueOrThrow({ where: { id: appealId }, include: { application: true } });
  const ctx: AppealCtx = { isAuthority: appeal.authorityId === actor.id, reasons };
  const to = await check(appealMachine, { ...appeal, caseRef: appeal.appealNo }, accept ? "acceptLate" : "refuseLate", actor, ctx, today);
  await prisma.$transaction(async (tx) => {
    await tx.appeal.update({
      where: { id: appealId },
      data: accept ? { status: to, lateDecision: "ACCEPTED" } : { status: to, lateDecision: "REFUSED", scrutinyNote: reasons, decidedOn: today, closedOn: today },
    });
    await audit(tx, today, { actor, action: accept ? "appeal.acceptLate" : "appeal.refuseLate", entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo, before: appeal.status, after: to, details: { reasons } });
    await notifyUser(tx, today, appeal.application.citizenId,
      accept
        ? `Sewa Setu: Your reason for filing appeal ${appeal.appealNo} late has been accepted. The appeal will now be heard.`
        : `Sewa Setu: Your late appeal ${appeal.appealNo} was not accepted. Reasons: ${reasons}`,
      { entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo });
    if (accept) await startReview(tx, appeal, appeal.application, today, s, cal);
  });
}

// ---------- Respondent reply (AMS-40) ----------

export async function submitReply(actor: Actor, appealId: string, text: string) {
  const { today } = await getRuleContext();
  const appeal = await prisma.appeal.findUniqueOrThrow({ where: { id: appealId }, include: { application: true, replies: true } });
  const app = appeal.application;
  if (![app.dpsId, app.linkOfficerId].includes(actor.id)) throw new DomainError("Only the officers responsible for this application can reply.");
  if (!FILED_LIVE.includes(appeal.status as AppealStatus)) throw new DomainError("This appeal is no longer open for a reply.");
  if (!needText(text)) throw new DomainError("Please write your reply, including the reason for any delay or for the rejection.");
  const open = appeal.replies.find((r) => !r.submittedOn);
  if (!open) throw new DomainError("No reply has been requested on this appeal, or it has already been given.");
  await prisma.$transaction(async (tx) => {
    await tx.respondentReply.update({ where: { id: open.id }, data: { submittedOn: today, text } });
    await audit(tx, today, { actor, action: "appeal.reply", entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo, details: { late: today > open.dueOn } });
    await notifyDecider(tx, appeal, `The DPS has replied in appeal ${appeal.appealNo}.`, today);
  });
}

// ---------- Hearings (AMS-43–51) ----------

export type HearingInput = { date: string; timeSlot: string; mode: "ONLINE" | "IN_PERSON"; inPersonReason?: string; shortNoticeReason?: string };

export async function scheduleHearing(actor: Actor, appealId: string, input: HearingInput) {
  const { today, settings: s, cal } = await getRuleContext();
  const appeal = await prisma.appeal.findUniqueOrThrow({ where: { id: appealId }, include: { application: true, hearings: true } });
  if (!isValidISODate(input.date)) throw new DomainError("Please choose the hearing date.");
  const notice = checkHearingNotice(today, input.date, s.hearingNoticeClearDays, input.shortNoticeReason, cal);
  const noticeError = !notice.ok ? notice.message : !isWorkingDay(input.date, cal) ? "The office is closed on that date. Please choose a working day." : null;
  const inPersonError = input.mode === "IN_PERSON" && !IN_PERSON_REASONS.includes(input.inPersonReason ?? "")
    ? "Hearings are online by default. An in-person hearing needs one of the listed reasons." : null;
  // At the Commission the Registrar fixes hearings for the bench.
  const isAuthority = appeal.level === "TAA" ? actor.role === "REGISTRAR" : appeal.authorityId === actor.id;
  const to = await check(appealMachine, { ...appeal, caseRef: appeal.appealNo }, "scheduleHearing", actor, { isAuthority, noticeError, inPersonError }, today);
  const short = notice.clearDays < s.hearingNoticeClearDays;

  return prisma.$transaction(async (tx) => {
    const adjourned = appeal.hearings.filter((h) => h.status === "SCHEDULED");
    for (const h of adjourned) await tx.hearing.update({ where: { id: h.id }, data: { status: "ADJOURNED", notes: `Adjourned on ${formatDate(today)}; new date ${formatDate(input.date)}.` } });
    const hearing = await tx.hearing.create({
      data: {
        appealId, scheduledOn: input.date, timeSlot: input.timeSlot || "11:00", mode: input.mode,
        inPersonReason: input.mode === "IN_PERSON" ? input.inPersonReason : null,
        noticeServedOn: today, shortNoticeReason: short ? input.shortNoticeReason?.trim() : null, status: "SCHEDULED",
      },
    });
    const videoLink = input.mode === "ONLINE" ? videoConferencing.createMeeting(hearing.id).url : null;
    if (videoLink) await tx.hearing.update({ where: { id: hearing.id }, data: { videoLink } });
    await tx.appeal.update({ where: { id: appealId }, data: { status: to } });
    await audit(tx, today, {
      actor, action: adjourned.length ? "appeal.adjournHearing" : "appeal.scheduleHearing", entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo, before: appeal.status, after: to,
      details: { date: input.date, mode: input.mode, clearDays: notice.clearDays, shortNoticeReason: short ? input.shortNoticeReason : undefined },
    });
    const where = input.mode === "ONLINE" ? `online (join on Sewa Setu: ${videoLink})` : `in person at the office of the ${AUTHORITY_NAME[appeal.level as Level]} (${input.inPersonReason})`;
    await notifyMany(tx, today, [appeal.application.citizenId, appeal.application.dpsId],
      `Hearing notice: appeal ${appeal.appealNo} will be heard on ${formatDate(input.date, true)} at ${hearing.timeSlot}, ${where}.`,
      { entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo });
    return hearing;
  });
}

export async function recordHearing(actor: Actor, hearingId: string, input: { citizen: boolean; dps: boolean; notes: string }) {
  const { today } = await getRuleContext();
  const hearing = await prisma.hearing.findUniqueOrThrow({ where: { id: hearingId }, include: { appeal: true } });
  const appeal = hearing.appeal;
  const isAuthority = await isDecider(prisma, appeal, actor.id);
  if (hearing.scheduledOn > today) throw new DomainError(`The hearing is on ${formatDate(hearing.scheduledOn)}. It can be recorded on or after that date.`);
  const hTo = await check(hearingMachine, { id: hearing.id, status: hearing.status, caseRef: appeal.appealNo }, "hold", actor, { isAuthority }, today);
  const aTo = await check(appealMachine, { ...appeal, caseRef: appeal.appealNo }, "recordHearing", actor, { isAuthority }, today);
  await prisma.$transaction(async (tx) => {
    await tx.hearing.update({ where: { id: hearingId }, data: { status: hTo, attendance: JSON.stringify({ citizen: input.citizen, dps: input.dps }), notes: input.notes || null } });
    await tx.appeal.update({ where: { id: appeal.id }, data: { status: aTo } });
    await audit(tx, today, { actor, action: "appeal.recordHearing", entityType: "appeal", entityId: appeal.id, caseRef: appeal.appealNo, before: appeal.status, after: aTo, details: input });
  });
}
