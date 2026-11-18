import { describe, expect, it } from "vitest";
import { makeCalendar } from "@/domain/calendar";
import {
  appealDeadline, checkFilingWindow, checkHearingNotice, checkPenalty, checkSaaExtension, delayBand, earliestHearingDate,
  escalationTarget, isBreached, pausedWorkingDays, repeatedDelay, serviceDueDate, workingDaysUsed,
} from "@/domain/rules";
import { DEFAULT_SETTINGS as s } from "@/domain/settings";

const cal = makeCalendar(["2026-11-09", "2026-11-24"]);

describe("service time limit", () => {
  it("counts the time limit in working days from the UIN date", () => {
    // 3-7, 10-13, 16-20, 21 (3rd Saturday): the 15th working day is Sat 21 Nov.
    expect(serviceDueDate("2026-11-02", 15, 0, cal)).toBe("2026-11-21");
  });

  it("pushes the due date back by paused working days", () => {
    expect(serviceDueDate("2026-11-02", 15, 2, cal)).toBe("2026-11-25"); // skips Sun 22 and holiday 24
    expect(pausedWorkingDays([{ from: "2026-11-05", to: "2026-11-10" }], "2026-11-20", cal)).toBe(3); // 6, 7, 10
    expect(pausedWorkingDays([{ from: "2026-11-05", to: null }], "2026-11-07", cal)).toBe(2);
  });

  it("counts working days used, net of pauses", () => {
    expect(workingDaysUsed("2026-11-02", "2026-11-11", 2, cal)).toBe(5);
  });

  it("breaches only the day after the due date, and never while paused", () => {
    expect(isBreached("2026-11-21", "2026-11-21", true)).toBe(false);
    expect(isBreached("2026-11-21", "2026-11-22", true)).toBe(true);
    expect(isBreached("2026-11-21", "2026-11-30", false)).toBe(false);
  });
});

describe("filing windows", () => {
  it("first appeal: 45 calendar days, then late with a reason", () => {
    expect(checkFilingWindow("FAA", "2026-11-02", "2026-12-17", s, cal)).toEqual({ status: "IN_TIME", windowEndsOn: "2026-12-17" });
    expect(checkFilingWindow("FAA", "2026-11-02", "2026-12-18", s, cal).status).toBe("LATE_NEEDS_REASON");
  });

  it("second appeal: 60 days from the FAA order", () => {
    expect(checkFilingWindow("SAA", "2026-11-02", "2027-01-01", s, cal).status).toBe("IN_TIME");
    expect(checkFilingWindow("SAA", "2026-11-02", "2027-01-02", s, cal).status).toBe("LATE_NEEDS_REASON");
  });

  it("third appeal: late up to 120 days, never after", () => {
    expect(checkFilingWindow("TAA", "2026-01-01", "2026-04-01", s, cal).status).toBe("IN_TIME");
    expect(checkFilingWindow("TAA", "2026-01-01", "2026-04-02", s, cal).status).toBe("LATE_NEEDS_REASON");
    expect(checkFilingWindow("TAA", "2026-01-01", "2026-05-01", s, cal).status).toBe("LATE_NEEDS_REASON");
    expect(checkFilingWindow("TAA", "2026-01-01", "2026-05-02", s, cal).status).toBe("NOT_ALLOWED");
  });
});

describe("hearing notice", () => {
  it("needs 7 clear working days, or a reason", () => {
    expect(checkHearingNotice("2026-11-02", "2026-11-12", 7, null, cal).ok).toBe(true);
    const short = checkHearingNotice("2026-11-02", "2026-11-11", 7, null, cal);
    expect(short).toMatchObject({ ok: false, clearDays: 6 });
    expect(checkHearingNotice("2026-11-02", "2026-11-11", 7, "Citizen asked for an early date", cal).ok).toBe(true);
    expect(checkHearingNotice("2026-11-02", "2026-11-02", 7, "same day please", cal).ok).toBe(false);
  });

  it("suggests the earliest valid date", () => {
    expect(earliestHearingDate("2026-11-02", 7, cal)).toBe("2026-11-12");
  });
});

describe("appeal deadlines and escalation", () => {
  it("FAA has 30 working days", () => {
    expect(appealDeadline("FAA", "2026-11-02", s, cal)).toBe("2026-12-11");
  });

  it("escalates to the next level, or straight to the Commission", () => {
    expect(escalationTarget("FAA", "NEXT_LEVEL")).toBe("SAA");
    expect(escalationTarget("SAA", "NEXT_LEVEL")).toBe("TAA");
    expect(escalationTarget("FAA", "STRAIGHT_TO_COMMISSION")).toBe("TAA");
    expect(escalationTarget("TAA", "NEXT_LEVEL")).toBeNull();
  });

  it("allows one SAA extension, up to 75 days, with a reason", () => {
    expect(checkSaaExtension(60, 75, "Records awaited from the district", false, s)).toBeNull();
    expect(checkSaaExtension(60, 76, "Records awaited from the district", false, s)).toMatch(/at most 75/);
    expect(checkSaaExtension(60, 70, "", false, s)).toMatch(/reason/);
    expect(checkSaaExtension(70, 75, "Records awaited", true, s)).toMatch(/once/);
    expect(checkSaaExtension(60, 60, "Records awaited", false, s)).toMatch(/longer/);
  });
});

describe("penalties", () => {
  it("checks every range, bounds inclusive", () => {
    const cases: [("FAA" | "SAA" | "TAA"), string, number, number][] = [
      ["FAA", "DPS", 100, 5000], ["SAA", "DPS", 100, 7000], ["TAA", "DPS", 100, 10000], ["TAA", "FAA", 500, 5000], ["TAA", "SAA", 1000, 5000],
    ];
    for (const [level, cap, min, max] of cases) {
      expect(checkPenalty(level, cap, min, s)).toBeNull();
      expect(checkPenalty(level, cap, max, s)).toBeNull();
      expect(checkPenalty(level, cap, min - 1, s)).not.toBeNull();
      expect(checkPenalty(level, cap, max + 1, s)).not.toBeNull();
    }
  });

  it("treats Link Officers and successors as DPS", () => {
    expect(checkPenalty("FAA", "LINK_OFFICER", 2000, s)).toBeNull();
    expect(checkPenalty("FAA", "SUCCESSOR", 6000, s)).not.toBeNull();
  });

  it("only the Commission can penalise an appellate authority", () => {
    expect(checkPenalty("FAA", "FAA", 1000, s)).toMatch(/cannot be imposed/);
    expect(checkPenalty("SAA", "FAA", 1000, s)).toMatch(/cannot be imposed/);
  });

});

describe("repeated delay", () => {
  const today = "2026-11-02";
  const c = (dueOn: string, delayed: boolean) => ({ dueOn, delayed });

  it("flags at exactly 25% with enough cases", () => {
    const r = repeatedDelay([c("2026-10-01", true), c("2026-10-02", false), c("2026-10-03", false), c("2026-10-04", false)], today, s);
    expect(r).toMatchObject({ delayed: 1, total: 4, isFlagged: true });
  });

  it("does not flag below 25% or below the minimum number of cases", () => {
    expect(repeatedDelay([c("2026-10-01", true), ...Array(4).fill(c("2026-10-02", false))], today, s).isFlagged).toBe(false);
    expect(repeatedDelay([c("2026-10-01", true), c("2026-10-02", false), c("2026-10-03", false)], today, s).isFlagged).toBe(false);
  });

  it("looks back 182 days only", () => {
    const r = repeatedDelay([c("2026-05-04", true), c("2026-05-05", false)], today, s); // 2026-05-04 is exactly 182 days back
    expect(r.total).toBe(1);
  });
});

describe("delay bands", () => {
  it("bands by days past the deadline", () => {
    expect(delayBand("2026-11-02", "2026-11-02")).toBe("WITHIN");
    expect(delayBand("2026-11-02", "2026-12-02")).toBe("UP_TO_30");
    expect(delayBand("2026-11-02", "2026-12-03")).toBe("UP_TO_90");
    expect(delayBand("2026-11-02", "2027-02-01")).toBe("OVER_90");
  });
});
