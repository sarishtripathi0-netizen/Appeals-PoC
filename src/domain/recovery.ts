// Recovery from salary as pure functions (PLAN.md Part 2): salary pay dates, the instalment plan,
// re-planning when lines change, routing to the exceptions queue, and the retirement window.

import { addWorkingDays, isWorkingDay, type Calendar } from "./calendar";
import { addDays, type ISODate } from "./dates";
import type { Settings } from "./settings";

export type Month = string; // YYYY-MM
export type Instalment = { month: Month; amount: number; dueOn: ISODate };

export function monthOf(d: ISODate): Month {
  return d.slice(0, 7);
}

export function addMonths(m: Month, n: number): Month {
  const [y, mo] = m.split("-").map(Number);
  const t = y * 12 + (mo - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** Salary is paid on the last working day of the month. */
export function payDateOf(m: Month, cal: Calendar): ISODate {
  let d = addDays(`${addMonths(m, 1)}-01`, -1);
  while (!isWorkingDay(d, cal)) d = addDays(d, -1);
  return d;
}

/** The next salary cycle: this month if its pay date has not passed, otherwise next month. */
export function nextPayMonth(today: ISODate, cal: Calendar): Month {
  const m = monthOf(today);
  return today <= payDateOf(m, cal) ? m : addMonths(m, 1);
}

/** A deduction is due by the pay date plus the nodal officer's grace period. */
export function deductionDueOn(m: Month, s: Pick<Settings, "nodalGraceDays">, cal: Calendar): ISODate {
  return addWorkingDays(payDateOf(m, cal), s.nodalGraceDays, cal);
}

/** Above the threshold, the total is split into the maximum number of equal instalments; the last takes the rounding (P-A10). */
export function instalmentAmounts(total: number, s: Pick<Settings, "instalmentThreshold" | "maxInstalments">): number[] {
  if (total <= 0) return [];
  if (total <= s.instalmentThreshold || s.maxInstalments <= 1) return [total];
  const n = s.maxInstalments;
  const each = Math.floor(total / n);
  return [...Array(n - 1).fill(each), total - each * (n - 1)];
}

export function buildPlan(total: number, today: ISODate, s: Pick<Settings, "instalmentThreshold" | "maxInstalments" | "nodalGraceDays">, cal: Calendar): Instalment[] {
  const start = nextPayMonth(today, cal);
  return instalmentAmounts(total, s).map((amount, i) => {
    const month = addMonths(start, i);
    return { month, amount, dueOn: deductionDueOn(month, s, cal) };
  });
}

/**
 * Re-plans what is still to be recovered. Before any deduction, the instalment rule applies to the whole total (E12).
 * After deductions have started, the remaining balance is spread over the months still to come in the plan (E13: a
 * shortfall carries forward); if none are left, it falls due in the next cycle. Months that already have a deduction
 * (`doneMonths`) are not asked for again: a part deduction closes that month and the rest moves on.
 */
export function replan(
  plan: Instalment[], remaining: number, started: boolean, today: ISODate,
  s: Pick<Settings, "instalmentThreshold" | "maxInstalments" | "nodalGraceDays">, cal: Calendar, doneMonths: Set<Month> = new Set(),
): Instalment[] {
  if (remaining <= 0) return [];
  if (!started) return buildPlan(remaining, today, s, cal);
  const future = plan.filter((p) => p.dueOn >= today && !doneMonths.has(p.month));
  if (future.length === 0) {
    let month = nextPayMonth(today, cal);
    while (doneMonths.has(month)) month = addMonths(month, 1);
    return [{ month, amount: remaining, dueOn: deductionDueOn(month, s, cal) }];
  }
  const each = Math.floor(remaining / future.length);
  return future.map((p, i) => ({ ...p, amount: i === future.length - 1 ? remaining - each * (future.length - 1) : each }));
}

export type ExceptionKind =
  | "NOT_ON_STATE_PAYROLL" | "RETIRED_NO_PENSION" | "RESIGNED" | "DISMISSED" | "DECEASED" | "SUSPENDED" | "STAFF_RECORD_MISMATCH" | "UNMATCHED_PAYMENT";

export const EXCEPTION_LABELS: Record<ExceptionKind, string> = {
  NOT_ON_STATE_PAYROLL: "Not on the State payroll: recover through the paying authority",
  RETIRED_NO_PENSION: "Retired: recovery from pension is switched off",
  RESIGNED: "Officer has resigned",
  DISMISSED: "Officer has been dismissed",
  DECEASED: "Officer has died",
  SUSPENDED: "Officer is under suspension (subsistence allowance): open point",
  STAFF_RECORD_MISMATCH: "Employee ID not found, or details do not match the staff records",
  UNMATCHED_PAYMENT: "eGRAS payment with an unknown reference",
};

const sameName = (a: string, b: string) => a.replace(/\(demo\)/i, "").trim().toLowerCase() === b.replace(/\(demo\)/i, "").trim().toLowerCase();

/**
 * Whether a penalty can go on a normal salary-recovery ticket (E8, E9, E10, E11, E16). Returns the exception kind, or null.
 * A retired officer stays on the normal route only when recovery from pension is switched on.
 */
export function routingProblem(
  staff: { name: string; payrollType: string; status: string; retirementOn: string | null } | null,
  officerName: string,
  today: ISODate,
  s: Pick<Settings, "pensionRecovery">,
): ExceptionKind | null {
  if (!staff || !sameName(staff.name, officerName)) return "STAFF_RECORD_MISMATCH";
  if (staff.status === "RESIGNED" || staff.status === "DISMISSED" || staff.status === "DECEASED" || staff.status === "SUSPENDED") return staff.status;
  const retired = staff.status === "RETIRED" || (!!staff.retirementOn && staff.retirementOn < today);
  if (retired && !s.pensionRecovery) return "RETIRED_NO_PENSION";
  if (staff.payrollType !== "STATE") return "NOT_ON_STATE_PAYROLL";
  return null;
}

/** Retiring within the alert window (E9): the ticket goes to the front of the queue. */
export function retiringSoon(retirementOn: string | null, today: ISODate, months: number): boolean {
  if (!retirementOn || retirementOn < today) return false;
  const limit = `${addMonths(monthOf(today), months)}${today.slice(7)}`;
  return retirementOn <= limit;
}

/** The monthly statement is generated on the first working day of each month (step 8). */
export function isFirstWorkingDayOfMonth(d: ISODate, cal: Calendar): boolean {
  if (!isWorkingDay(d, cal)) return false;
  for (let x = `${monthOf(d)}-01`; x < d; x = addDays(x, 1)) if (isWorkingDay(x, cal)) return false;
  return true;
}

/** "December 2026" for the deduction message. */
export function monthName(m: Month): string {
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
}
