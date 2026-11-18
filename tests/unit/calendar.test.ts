import { describe, expect, it } from "vitest";
import { addPeriod, addWorkingDays, clearWorkingDaysBetween, daysLeft, isWorkingDay, makeCalendar, nextWorkingDayOnOrAfter, subtractWorkingDays, workingDaysBetween } from "@/domain/calendar";
import { addDays, daysBetween, isValidISODate } from "@/domain/dates";

// November 2026: Sun 1, Mon 2. Holidays on Mon 9 and Tue 24. Saturdays 14 (2nd) and 28 (4th) are off.
const cal = makeCalendar(["2026-11-09", "2026-11-24"]);

describe("working days", () => {
  it("treats Sundays, 2nd and 4th Saturdays and holidays as non-working", () => {
    expect(isWorkingDay("2026-11-01", cal)).toBe(false); // Sunday
    expect(isWorkingDay("2026-11-07", cal)).toBe(true); // 1st Saturday
    expect(isWorkingDay("2026-11-14", cal)).toBe(false); // 2nd Saturday
    expect(isWorkingDay("2026-11-21", cal)).toBe(true); // 3rd Saturday
    expect(isWorkingDay("2026-11-28", cal)).toBe(false); // 4th Saturday
    expect(isWorkingDay("2026-11-09", cal)).toBe(false); // holiday
    expect(isWorkingDay("2026-11-10", cal)).toBe(true);
  });

  it("honours a different Saturday rule", () => {
    const allSat = makeCalendar([], [1, 2, 3, 4, 5]);
    expect(isWorkingDay("2026-11-07", allSat)).toBe(false);
  });

  it("adds working days, not counting the start day", () => {
    expect(addWorkingDays("2026-11-02", 0, cal)).toBe("2026-11-02");
    expect(addWorkingDays("2026-11-02", 5, cal)).toBe("2026-11-07");
    expect(addWorkingDays("2026-11-06", 3, cal)).toBe("2026-11-11"); // skips Sun 8 and holiday 9
  });

  it("subtracts working days", () => {
    expect(subtractWorkingDays("2026-11-11", 3, cal)).toBe("2026-11-06");
  });

  it("counts working days in (a, b]", () => {
    expect(workingDaysBetween("2026-11-02", "2026-11-11", cal)).toBe(7);
    expect(workingDaysBetween("2026-11-11", "2026-11-02", cal)).toBe(0);
    expect(workingDaysBetween("2026-11-02", "2026-11-02", cal)).toBe(0);
  });

  it("counts clear working days with both ends excluded", () => {
    expect(clearWorkingDaysBetween("2026-11-02", "2026-11-11", cal)).toBe(6);
    expect(clearWorkingDaysBetween("2026-11-02", "2026-11-12", cal)).toBe(7);
  });

  it("adds periods in either basis", () => {
    expect(addPeriod("2026-11-02", 45, "CALENDAR", cal)).toBe("2026-12-17");
    expect(addPeriod("2026-11-02", 5, "WORKING", cal)).toBe("2026-11-07");
  });

  it("reports days left, negative when overdue", () => {
    expect(daysLeft("2026-11-02", "2026-11-11", "WORKING", cal)).toBe(7);
    expect(daysLeft("2026-11-11", "2026-11-02", "WORKING", cal)).toBe(-7);
    expect(daysLeft("2026-11-02", "2026-11-12", "CALENDAR", cal)).toBe(10);
  });

  it("finds the next working day", () => {
    expect(nextWorkingDayOnOrAfter("2026-11-08", cal)).toBe("2026-11-10");
    expect(nextWorkingDayOnOrAfter("2026-11-10", cal)).toBe("2026-11-10");
  });
});

describe("dates", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-11-02", "2026-12-02")).toBe(30);
  });

  it("validates ISO dates", () => {
    expect(isValidISODate("2026-11-02")).toBe(true);
    expect(isValidISODate("2026-02-30")).toBe(false);
    expect(isValidISODate("02/11/2026")).toBe(false);
  });
});
