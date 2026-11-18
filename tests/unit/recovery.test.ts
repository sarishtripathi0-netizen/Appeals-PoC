import { describe, expect, it } from "vitest";
import { makeCalendar } from "@/domain/calendar";
import { addMonths, buildPlan, deductionDueOn, instalmentAmounts, monthName, nextPayMonth, payDateOf, replan, retiringSoon, routingProblem } from "@/domain/recovery";
import { DEFAULT_SETTINGS as s } from "@/domain/settings";

const cal = makeCalendar(["2026-11-09", "2026-11-24", "2026-12-25"]);

describe("salary pay dates", () => {
  it("is the last working day of the month", () => {
    expect(payDateOf("2026-11", cal)).toBe("2026-11-30");
    expect(payDateOf("2026-12", cal)).toBe("2026-12-31");
    expect(payDateOf("2027-01", cal)).toBe("2027-01-30"); // Sun 31 Jan; Sat 30 Jan is a 5th Saturday, a working day
    expect(payDateOf("2027-02", cal)).toBe("2027-02-26"); // Sun 28, Sat 27 (4th Saturday) off
  });

  it("takes this month's cycle until its pay date has passed", () => {
    expect(nextPayMonth("2026-11-30", cal)).toBe("2026-11");
    expect(nextPayMonth("2026-12-01", cal)).toBe("2026-12");
    expect(addMonths("2026-12", 2)).toBe("2027-02");
  });

  it("is due by the pay date plus 5 working days", () => {
    expect(deductionDueOn("2026-11", s, cal)).toBe("2026-12-05"); // 1, 2, 3, 4 Dec and Sat 5 Dec (a 1st Saturday is a working day)
  });
});

describe("instalments", () => {
  it("splits a total above Rs. 10,000 into 3 equal instalments, the last taking the rounding", () => {
    expect(instalmentAmounts(13000, s)).toEqual([4333, 4333, 4334]);
    expect(instalmentAmounts(10001, s)).toEqual([3333, 3333, 3335]);
    expect(instalmentAmounts(10000, s)).toEqual([10000]);
    expect(instalmentAmounts(0, s)).toEqual([]);
  });

  it("plans from the next salary cycle", () => {
    expect(buildPlan(13000, "2026-12-04", s, cal).map((p) => [p.month, p.amount])).toEqual([["2026-12", 4333], ["2027-01", 4333], ["2027-02", 4334]]);
  });

  it("re-plans the whole total before deductions start, and spreads a shortfall over the months left afterwards", () => {
    const plan = buildPlan(13000, "2026-12-04", s, cal);
    expect(replan(plan, 18000, false, "2026-12-04", s, cal).map((p) => p.amount)).toEqual([6000, 6000, 6000]);
    const after = replan(plan, 10000, true, "2027-01-08", s, cal); // December's due date has passed
    expect(after.map((p) => [p.month, p.amount])).toEqual([["2027-01", 5000], ["2027-02", 5000]]);
    const late = replan(plan, 1500, true, "2027-03-20", s, cal); // every planned month has passed
    expect(late).toEqual([{ month: "2027-03", amount: 1500, dueOn: deductionDueOn("2027-03", s, cal) }]);
    expect(replan(plan, 0, true, "2027-01-08", s, cal)).toEqual([]);
  });
});

describe("routing to the exceptions queue", () => {
  const staff = (o: Partial<{ name: string; payrollType: string; status: string; retirementOn: string | null }> = {}) => ({ name: "Pallab Dutta (Demo)", payrollType: "STATE", status: "ACTIVE", retirementOn: "2040-01-31", ...o });
  const today = "2026-12-04";
  it("keeps active State-payroll officers on the normal route", () => {
    expect(routingProblem(staff(), "Pallab Dutta", today, s)).toBeNull();
  });
  it("routes every special case", () => {
    expect(routingProblem(null, "Pallab Dutta", today, s)).toBe("STAFF_RECORD_MISMATCH");
    expect(routingProblem(staff(), "Someone Else", today, s)).toBe("STAFF_RECORD_MISMATCH");
    for (const t of ["DEPUTATION_OUTSIDE", "ULB", "AUTONOMOUS", "PSU", "CONTRACTUAL"]) expect(routingProblem(staff({ payrollType: t }), "Pallab Dutta", today, s)).toBe("NOT_ON_STATE_PAYROLL");
    for (const st of ["RESIGNED", "DISMISSED", "DECEASED", "SUSPENDED"]) expect(routingProblem(staff({ status: st }), "Pallab Dutta", today, s)).toBe(st);
    expect(routingProblem(staff({ status: "RETIRED" }), "Pallab Dutta", today, s)).toBe("RETIRED_NO_PENSION");
    expect(routingProblem(staff({ retirementOn: "2026-11-30" }), "Pallab Dutta", today, s)).toBe("RETIRED_NO_PENSION");
  });
  it("keeps a retired officer on the normal route when recovery from pension is on", () => {
    expect(routingProblem(staff({ status: "RETIRED" }), "Pallab Dutta", today, { pensionRecovery: true })).toBeNull();
  });
});

describe("retirement and wording", () => {
  it("flags retirement within 3 months", () => {
    expect(retiringSoon("2026-12-31", "2026-11-02", 3)).toBe(true);
    expect(retiringSoon("2027-02-02", "2026-11-02", 3)).toBe(true);
    expect(retiringSoon("2027-02-03", "2026-11-02", 3)).toBe(false);
    expect(retiringSoon("2026-10-31", "2026-11-02", 3)).toBe(false);
    expect(retiringSoon(null, "2026-11-02", 3)).toBe(false);
  });
  it("names the month for the deduction message", () => {
    expect(monthName("2026-12")).toBe("December 2026");
  });
});
