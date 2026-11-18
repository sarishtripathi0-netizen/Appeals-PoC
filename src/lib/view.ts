// Presentation helpers shared by several screens.

import { workingDaysBetween, type Calendar } from "@/domain/calendar";
import { formatDate } from "@/domain/dates";
import { appealMachine, applicationMachine, type AppealStatus, type ApplicationStatus } from "@/domain/state-machines";
import type { Tone } from "@/components/ui";

export type TimerView = { text: string; tone: Tone; overdue: boolean };

export function applicationTimer(
  a: { status: string; submittedOn: string | null; dueOn: string | null; pausedWorkingDays: number; deliveredOn: string | null; rejectedOn: string | null; closedOn: string | null },
  limit: number,
  today: string,
  cal: Calendar,
): TimerView {
  if (!a.submittedOn || !a.dueOn) return { text: "Not started (application not yet complete)", tone: "grey", overdue: false };
  const end = a.deliveredOn ?? a.rejectedOn ?? a.closedOn;
  if (end) {
    const late = workingDaysBetween(a.dueOn, end, cal);
    return late > 0
      ? { text: `Finished ${late} working day${late === 1 ? "" : "s"} after the time limit`, tone: "red", overdue: true }
      : { text: "Finished within the time limit", tone: "green", overdue: false };
  }
  if (a.status === "AWAITING_CITIZEN") return { text: "Paused: waiting for the citizen", tone: "blue", overdue: false };
  if (today > a.dueOn) {
    const late = workingDaysBetween(a.dueOn, today, cal);
    return { text: `Time limit passed ${late} working day${late === 1 ? "" : "s"} ago`, tone: "red", overdue: true };
  }
  const used = Math.max(0, workingDaysBetween(a.submittedOn, today, cal) - a.pausedWorkingDays);
  const left = workingDaysBetween(today, a.dueOn, cal);
  return { text: `Day ${used} of ${limit} · ${left} working day${left === 1 ? "" : "s"} left`, tone: left <= 2 ? "amber" : "grey", overdue: false };
}

/** The time limit that applies to an application: fixed at submission, or the service's current one before that. */
export function timeLimitOf(a: { timeLimitDays: number | null; service: { timeLimitWorkingDays: number } }): number {
  return a.timeLimitDays ?? a.service.timeLimitWorkingDays;
}

export function appStatusLabel(s: string) {
  return applicationMachine.statusLabels[s as ApplicationStatus] ?? s;
}

export function appStatusTone(s: string): Tone {
  switch (s) {
    case "HELD": return "red";
    case "AWAITING_CITIZEN": return "blue";
    case "DELIVERED":
    case "DELIVERED_CONFIRMED": return "green";
    case "REJECTED":
    case "CLOSED": return "purple";
    case "DRAFT": return "grey";
    default: return "amber";
  }
}

export function appealStatusLabel(s: string) {
  return appealMachine.statusLabels[s as AppealStatus] ?? s;
}

export function appealStatusTone(s: string): Tone {
  switch (s) {
    case "CLOSED": return "green";
    case "ESCALATED": return "red";
    case "DRAFT":
    case "FILED_LATE":
    case "RETURNED": return "amber";
    case "DECLINED":
    case "LAPSED": return "grey";
    case "COMPLIANCE":
    case "AWAITING_CONFIRMATION": return "blue";
    default: return "purple";
  }
}

export const rupees = (n: number) => `Rs. ${n.toLocaleString("en-IN")}`;

export const GROUND_LABELS: Record<string, string> = { DELAY: "Delay (time limit missed)", REJECTION: "Rejection" };
export const ORIGIN_LABELS: Record<string, string> = {
  AUTO_DRAFT: "Drafted by the portal, filed by the citizen",
  CITIZEN: "Filed by the citizen",
  ASSISTED: "Filed through the call centre",
  AUTO_ESCALATED: "Moved up after a missed deadline",
  REMANDED: "Sent back by the Commission",
};

/** Deadline badge for an appeal: working days left, or how late it is. */
export function appealDeadlineView(deadline: string | null, today: string, cal: Calendar, finished: boolean): TimerView {
  if (!deadline) return { text: "No deadline yet", tone: "grey", overdue: false };
  if (finished) return { text: `Deadline ${formatDate(deadline)}`, tone: "grey", overdue: false };
  if (today > deadline) {
    const late = workingDaysBetween(deadline, today, cal);
    return { text: `Deadline passed ${late} working day${late === 1 ? "" : "s"} ago`, tone: "red", overdue: true };
  }
  const left = workingDaysBetween(today, deadline, cal);
  return { text: `${left} working day${left === 1 ? "" : "s"} left (by ${formatDate(deadline)})`, tone: left <= 3 ? "red" : left <= 8 ? "amber" : "grey", overdue: false };
}
