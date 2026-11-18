import { describe, expect, it } from "vitest";
import type { Holder, SeatHolders } from "@/adapters/hr";
import { makeCalendar } from "@/domain/calendar";
import { pickOfficer, SEATS, spansFromDays } from "@/domain/hr-seats";
import { attributeDelay } from "@/domain/ledger";
import { MAPPINGS } from "@/seed/masters";

const holder = (id: string, available = true, demo = false): Holder => ({
  sanctioned_post_id: `CO_DISPUR-CIRCLE_OFFICER-${id}`, employee_id: id, name: `Officer ${id}`, cadre: "ALRS", year_of_joining: 2015,
  charge_type: "SUBSTANTIVE", available, unavailable_reason: available ? null : "LEAVE", is_demo: demo,
});
const answer = (holders: Holder[], link: string | null = null, status: SeatHolders["status"] = "RESOLVED"): SeatHolders => ({
  office_id: "CO_DISPUR", post_code: "CIRCLE_OFFICER", function_code: "INCOME_CERTIFICATE", at: "", holders, status, reason: null, roster_mode: false,
  link_officer: link ? { employee_id: link, name: `Officer ${link}`, sanctioned_post_id: "CO_DISPUR-SUB_REGISTRAR-01", rule_step: "SUB_REGISTRAR", deemed_dps_under_rule_3_3: true, is_demo: false } : null,
});

describe("picking the answerable officer", () => {
  it("takes the first available holder (seniority order) and lists the others", () => {
    expect(pickOfficer(answer([holder("EMP-1", false), holder("EMP-2"), holder("EMP-3")]))).toMatchObject({ employeeId: "EMP-2", capacity: "HOLDER", others: [{ employee_id: "EMP-3" }] });
  });
  it("falls back to the Link Officer when no holder is available, and to nobody when there is none", () => {
    expect(pickOfficer(answer([holder("EMP-1", false)], "EMP-9"))).toMatchObject({ employeeId: "EMP-9", capacity: "LINK_OFFICER" });
    expect(pickOfficer(answer([], null, "NO_HOLDER"))).toBeNull();
  });
});

describe("ledger spans from daily HR answers", () => {
  const cal = makeCalendar([], [2, 4]);
  it("splits the delay between the holder and the Link Officer who covered the leave, over weekends", () => {
    // Mon 2 Nov – Fri 13 Nov 2026 (working days); holder on leave Thu 5 – Mon 9 Nov.
    const days = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-09", "2026-11-10"].map((day) => ({
      day, employeeId: day >= "2026-11-05" && day <= "2026-11-09" ? "EMP-9" : "EMP-1", capacity: (day >= "2026-11-05" && day <= "2026-11-09" ? "LINK_OFFICER" : "HOLDER") as "HOLDER" | "LINK_OFFICER",
    }));
    const spans = spansFromDays(days);
    expect(spans.map((s) => [s.officerId, s.capacity, s.fromOn, s.toOn])).toEqual([
      ["EMP-1", "DPS", "2026-11-02", "2026-11-04"],
      ["EMP-9", "LINK_OFFICER", "2026-11-05", "2026-11-09"],
      ["EMP-1", "DPS", "2026-11-10", "2026-11-10"],
    ]);
    // Sat 7 Nov is the 1st Saturday (working); Sun 8 Nov is off.
    expect(attributeDelay(spans, "2026-11-01", "2026-11-10", cal)).toEqual([
      { officerId: "EMP-1", capacity: "DPS", delayDays: 4 },
      { officerId: "EMP-9", capacity: "LINK_OFFICER", delayDays: 4 },
    ]);
  });
  it("leaves a vacant day with no one answerable", () => {
    const spans = spansFromDays([
      { day: "2026-11-02", employeeId: "EMP-1", capacity: "HOLDER" },
      { day: "2026-11-03", employeeId: null, capacity: null },
      { day: "2026-11-04", employeeId: "EMP-1", capacity: "HOLDER" },
    ]);
    expect(spans.map((s) => [s.fromOn, s.toOn])).toEqual([["2026-11-02", "2026-11-02"], ["2026-11-04", "2026-11-04"]]);
  });
});

describe("seat table", () => {
  it("defines DPS, FAA and SAA seats for every AMS authority mapping, and a DA seat where AMS has a dealing assistant", () => {
    for (const m of MAPPINGS) {
      const s = SEATS[`${m.serviceCode}|${m.officeId}`];
      expect(s, `${m.serviceCode}|${m.officeId}`).toBeDefined();
      expect(Object.keys(s).sort()).toEqual(["DA", "DPS", "FAA", "SAA"]);
    }
  });
});
