// Penalty rules as pure functions (PLAN.md Part 2): last date from deemed service, the money arithmetic,
// reminders, the eGRAS QR payload and who may see a penalty.

import { addPeriod, nextWorkingDayOnOrAfter, type Calendar } from "./calendar";
import { daysBetween, type ISODate } from "./dates";
import type { Settings } from "./settings";

/**
 * Last date to pay through eGRAS: the payment period after the deemed service date. In calendar days (default),
 * a last date that falls on a holiday or weekly off moves to the next working day (P-A4).
 */
export function penaltyDueDate(serviceDate: ISODate, s: Pick<Settings, "paymentPeriodDays" | "paymentBasis">, cal: Calendar): ISODate {
  const raw = addPeriod(serviceDate, s.paymentPeriodDays, s.paymentBasis, cal);
  return s.paymentBasis === "CALENDAR" ? nextWorkingDayOnOrAfter(raw, cal) : raw;
}

/** Deemed service: both the dashboard posting and the first SMS or email have happened (P-A3). */
export function deemedServiceDate(dashboardPostedOn: ISODate, messageSentOn: ISODate | null): ISODate | null {
  if (!messageSentOn) return null;
  return dashboardPostedOn > messageSentOn ? dashboardPostedOn : messageSentOn;
}

export type Money = { egras: number; deducted: number; refunded: number; writtenOff: number };

/** What is still due, and what has been over-collected, on the current penalty amount. */
export function penaltyAmounts(amount: number, m: Money) {
  const due = Math.max(0, amount - m.writtenOff);
  const collected = m.egras + m.deducted;
  const net = collected - m.refunded;
  return { due, collected, net, outstanding: Math.max(0, due - net), excess: Math.max(0, net - due) };
}

/** Reminder days count from the service date (day 20 and day 27 by default). */
export function isReminderDay(serviceDate: ISODate, today: ISODate, reminderDays: number[]): number | null {
  const n = daysBetween(serviceDate, today);
  return reminderDays.includes(n) ? n : null;
}

/** What the mock eGRAS QR code encodes: the penalty reference, UIN, exact amount and head of account. */
export function qrPayload(p: { ref: string; uin: string; amount: number; headOfAccount: string }): string {
  return `EGRAS|PENALTY=${p.ref}|UIN=${p.uin}|AMOUNT=${p.amount}|HOA=${p.headOfAccount}`;
}

export function parseQrPayload(s: string): { ref: string; uin: string; amount: number; headOfAccount: string } | null {
  const m = /^EGRAS\|PENALTY=([^|]+)\|UIN=([^|]+)\|AMOUNT=(\d+)\|HOA=(.+)$/.exec(s);
  return m ? { ref: m[1], uin: m[2], amount: Number(m[3]), headOfAccount: m[4] } : null;
}

/** Roles that see every penalty: the Sewa Setu DDO, Finance and the Commission. */
export const PENALTY_OVERSIGHT_ROLES = ["SEWA_SETU_DDO", "FINANCE_NODAL", "FINANCE_SENIOR", "REGISTRAR", "COMMISSIONER", "CHIEF_COMMISSIONER"];

/**
 * Who may see a penalty. The penalised officer is matched by employee ID, so a successor in the same post never sees it (E7).
 * Other officers never see it.
 */
export function canViewPenalty(
  user: { id: string; role: string; employeeId: string | null },
  p: { employeeId: string; imposedById: string; competentAuthorityId: string | null },
): boolean {
  if (user.employeeId && user.employeeId === p.employeeId) return true;
  if (user.id === p.imposedById) return true;
  if (p.competentAuthorityId && user.id === p.competentAuthorityId) return true;
  return PENALTY_OVERSIGHT_ROLES.includes(user.role);
}
