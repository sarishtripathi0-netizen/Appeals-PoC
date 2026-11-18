// Business rules of the to-be process, as pure functions.

import { addPeriod, addWorkingDays, clearWorkingDaysBetween, workingDaysBetween, type Calendar } from "./calendar";
import { addDays, daysBetween, type ISODate } from "./dates";
import type { Level, PenaltyTarget, Settings } from "./settings";

// ---------- Service time limit ----------

export type PauseInterval = { from: ISODate; to: ISODate | null };

/** Working days during which the timer was paused. A pause runs from the day after the request to the day of the reply. */
export function pausedWorkingDays(pauses: PauseInterval[], today: ISODate, cal: Calendar): number {
  return pauses.reduce((sum, p) => sum + workingDaysBetween(p.from, p.to ?? today, cal), 0);
}

/** Due date: the time limit counted in working days from the day the UIN was issued, pushed back by paused days. */
export function serviceDueDate(uinDate: ISODate, timeLimit: number, pausedDays: number, cal: Calendar): ISODate {
  return addWorkingDays(uinDate, timeLimit + pausedDays, cal);
}

/** Working days used so far (excluding paused days). */
export function workingDaysUsed(uinDate: ISODate, today: ISODate, pausedDays: number, cal: Calendar): number {
  return Math.max(0, workingDaysBetween(uinDate, today, cal) - pausedDays);
}

/** The time limit is breached on any day after the due date while the timer is running. */
export function isBreached(dueOn: ISODate, today: ISODate, timerRunning: boolean): boolean {
  return timerRunning && today > dueOn;
}

// ---------- Filing windows ----------

export type WindowCheck =
  | { status: "IN_TIME"; windowEndsOn: ISODate }
  | { status: "LATE_NEEDS_REASON"; windowEndsOn: ISODate }
  | { status: "NOT_ALLOWED"; windowEndsOn: ISODate; message: string };

export function filingWindowDays(level: Level, s: Settings): number {
  return level === "FAA" ? s.firstAppealWindowDays : level === "SAA" ? s.secondAppealWindowDays : s.thirdAppealWindowDays;
}

export function checkFilingWindow(level: Level, windowStart: ISODate, filingOn: ISODate, s: Settings, cal: Calendar): WindowCheck {
  const windowEndsOn = addPeriod(windowStart, filingWindowDays(level, s), s.windowBasis, cal);
  if (filingOn <= windowEndsOn) return { status: "IN_TIME", windowEndsOn };
  if (level === "TAA") {
    const cap = addPeriod(windowStart, s.thirdAppealHardCapDays, s.windowBasis, cal);
    if (filingOn > cap)
      return { status: "NOT_ALLOWED", windowEndsOn, message: `A third appeal cannot be accepted more than ${s.thirdAppealHardCapDays} days after the Second Appellate Authority's order.` };
  }
  return { status: "LATE_NEEDS_REASON", windowEndsOn };
}

// ---------- Hearing notice ----------

export type NoticeCheck = { ok: true; clearDays: number } | { ok: false; clearDays: number; message: string };

export function checkHearingNotice(noticeOn: ISODate, hearingOn: ISODate, required: number, shortNoticeReason: string | null | undefined, cal: Calendar): NoticeCheck {
  const clearDays = clearWorkingDaysBetween(noticeOn, hearingOn, cal);
  if (hearingOn <= noticeOn) return { ok: false, clearDays, message: "The hearing date must be after today." };
  if (clearDays >= required) return { ok: true, clearDays };
  if (shortNoticeReason && shortNoticeReason.trim().length >= 5) return { ok: true, clearDays };
  return { ok: false, clearDays, message: `This gives ${clearDays} clear working days' notice. At least ${required} are needed, or record a reason for shorter notice.` };
}

/** Earliest hearing date that meets the notice rule. */
export function earliestHearingDate(noticeOn: ISODate, required: number, cal: Calendar): ISODate {
  return addWorkingDays(addWorkingDays(noticeOn, required, cal), 1, cal);
}

// ---------- Appeal deadlines and escalation ----------

export function decisionDays(level: Level, s: Settings): number {
  return level === "FAA" ? s.faaDecisionDays : level === "SAA" ? s.saaDecisionDays : s.commissionTargetDays;
}

/** `notifiedDays` is the stipulated time in the service's own notification, when there is one. */
export function appealDeadline(level: Level, filedOn: ISODate, s: Settings, cal: Calendar, notifiedDays?: number | null): ISODate {
  return addPeriod(filedOn, notifiedDays ?? decisionDays(level, s), s.appealDecisionBasis, cal);
}

export function extendedSaaDeadline(filedOn: ISODate, totalDays: number, s: Settings, cal: Calendar): ISODate {
  return addPeriod(filedOn, totalDays, s.appealDecisionBasis, cal);
}

export function checkSaaExtension(currentTotal: number, requestedTotal: number, reason: string | null | undefined, alreadyExtended: boolean, s: Settings): string | null {
  if (alreadyExtended) return "The time to decide has already been extended once.";
  if (requestedTotal <= currentTotal) return "The extended time must be longer than the current time.";
  if (requestedTotal > s.saaMaxExtendedDays) return `The time can be extended to at most ${s.saaMaxExtendedDays} days.`;
  if (!reason || reason.trim().length < 5) return "Please record the reason for the extension.";
  return null;
}

/** Where an appeal goes when the authority at `level` misses its deadline. The Commission (TAA) never escalates. */
export function escalationTarget(level: Level, mode: Settings["escalationMode"]): Level | null {
  if (level === "TAA") return null;
  if (mode === "STRAIGHT_TO_COMMISSION") return "TAA";
  return level === "FAA" ? "SAA" : "TAA";
}

export function isDeadlineMissed(deadline: ISODate, today: ISODate): boolean {
  return today > deadline;
}

// ---------- Penalties ----------

/** Officer capacities that count as "DPS" for penalty ranges. */
export function penaltyTargetOf(capacity: string): PenaltyTarget {
  if (capacity === "FAA" || capacity === "SAA") return capacity;
  return "DPS";
}

export function checkPenalty(level: Level, capacity: string, amount: number, s: Settings): string | null {
  const target = penaltyTargetOf(capacity);
  const range = s.penaltyRanges[level]?.[target];
  if (!range) return `A penalty on the ${target === "DPS" ? "Designated Public Servant" : target} cannot be imposed at this level.`;
  if (!Number.isInteger(amount)) return "The penalty must be a whole number of rupees.";
  if (amount < range[0] || amount > range[1]) return `The penalty must be between Rs. ${range[0].toLocaleString("en-IN")} and Rs. ${range[1].toLocaleString("en-IN")}.`;
  return null;
}

// ---------- Repeated delay ----------

export type CaseOutcome = { dueOn: ISODate; delayed: boolean };

export function repeatedDelay(cases: CaseOutcome[], today: ISODate, s: Settings) {
  const from = addDays(today, -s.repeatedDelayWindowDays);
  const inWindow = cases.filter((c) => c.dueOn > from && c.dueOn <= today);
  const delayed = inWindow.filter((c) => c.delayed).length;
  const total = inWindow.length;
  const ratio = total ? delayed / total : 0;
  return { delayed, total, ratio, isFlagged: total >= s.repeatedDelayMinCases && ratio >= s.repeatedDelayThreshold };
}

// ---------- Time-taken bands (report) ----------

export type Band = "WITHIN" | "UP_TO_30" | "UP_TO_90" | "OVER_90";

export function delayBand(deadline: ISODate, decidedOn: ISODate): Band {
  const late = daysBetween(deadline, decidedOn);
  if (late <= 0) return "WITHIN";
  if (late <= 30) return "UP_TO_30";
  if (late <= 90) return "UP_TO_90";
  return "OVER_90";
}
