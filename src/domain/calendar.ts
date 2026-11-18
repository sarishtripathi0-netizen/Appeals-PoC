// Working-day calendar: weekly offs + public holidays.
// All functions are pure so they can be unit-tested without a database.

import { addDays, toDate, type ISODate } from "./dates";

export type Calendar = {
  holidays: Set<ISODate>;
  sundayOff: boolean;
  /** Which Saturdays of the month are off, e.g. [2, 4]. */
  offSaturdays: number[];
};

export type DayBasis = "WORKING" | "CALENDAR";

export function makeCalendar(holidays: Iterable<ISODate>, offSaturdays: number[] = [2, 4], sundayOff = true): Calendar {
  return { holidays: new Set(holidays), sundayOff, offSaturdays };
}

export function isWorkingDay(d: ISODate, cal: Calendar): boolean {
  if (cal.holidays.has(d)) return false;
  const dt = toDate(d);
  const dow = dt.getUTCDay();
  if (dow === 0 && cal.sundayOff) return false;
  if (dow === 6) {
    const nth = Math.ceil(dt.getUTCDate() / 7);
    if (cal.offSaturdays.includes(nth)) return false;
  }
  return true;
}

/** The date that is the n-th working day after `start` (start itself is not counted). n = 0 returns start. */
export function addWorkingDays(start: ISODate, n: number, cal: Calendar): ISODate {
  let d = start;
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (isWorkingDay(d, cal)) left--;
  }
  return d;
}

/** The date that is n working days before `start`. */
export function subtractWorkingDays(start: ISODate, n: number, cal: Calendar): ISODate {
  let d = start;
  let left = n;
  while (left > 0) {
    d = addDays(d, -1);
    if (isWorkingDay(d, cal)) left--;
  }
  return d;
}

/** Working days in the half-open interval (a, b]. Returns 0 when b <= a. */
export function workingDaysBetween(a: ISODate, b: ISODate, cal: Calendar): number {
  if (b <= a) return 0;
  let count = 0;
  for (let d = addDays(a, 1); d <= b; d = addDays(d, 1)) if (isWorkingDay(d, cal)) count++;
  return count;
}

/** "Clear" working days: strictly between a and b, both ends excluded. */
export function clearWorkingDaysBetween(a: ISODate, b: ISODate, cal: Calendar): number {
  if (b <= a) return 0;
  return workingDaysBetween(a, addDays(b, -1), cal);
}

/** Add a period in either basis. */
export function addPeriod(start: ISODate, n: number, basis: DayBasis, cal: Calendar): ISODate {
  return basis === "WORKING" ? addWorkingDays(start, n, cal) : addDays(start, n);
}

/** Remaining days from today until (and including) the deadline, in the given basis. Negative when overdue. */
export function daysLeft(today: ISODate, deadline: ISODate, basis: DayBasis, cal: Calendar): number {
  if (basis === "CALENDAR") return Math.round((toDate(deadline).getTime() - toDate(today).getTime()) / 86_400_000);
  if (deadline >= today) return workingDaysBetween(today, deadline, cal);
  return -workingDaysBetween(deadline, today, cal);
}

/** First working day on or after d. */
export function nextWorkingDayOnOrAfter(d: ISODate, cal: Calendar): ISODate {
  let x = d;
  while (!isWorkingDay(x, cal)) x = addDays(x, 1);
  return x;
}
