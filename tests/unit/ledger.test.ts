import { describe, expect, it } from "vitest";
import { makeCalendar } from "@/domain/calendar";
import { attributeDelay, buildLedger, holderOn, suggestedPenaltyOfficer } from "@/domain/ledger";

const cal = makeCalendar(["2026-11-09", "2026-11-24"]);
const leave = { fromDpsId: "dps", toLinkOfficerId: "link", startOn: "2026-11-05", endOn: "2026-11-10" };

describe("responsibility ledger", () => {
  it("gives the case to the Link Officer during a handover", () => {
    expect(buildLedger("dps", "2026-11-02", null, [leave])).toEqual([
      { officerId: "dps", capacity: "DPS", fromOn: "2026-11-02", toOn: "2026-11-04", source: "ASSIGNMENT" },
      { officerId: "link", capacity: "LINK_OFFICER", fromOn: "2026-11-05", toOn: "2026-11-10", source: "HANDOVER" },
      { officerId: "dps", capacity: "DPS", fromOn: "2026-11-11", toOn: null, source: "ASSIGNMENT" },
    ]);
  });

  it("ignores other officers' handovers and those outside the case", () => {
    expect(buildLedger("dps", "2026-11-02", "2026-11-04", [leave, { ...leave, fromDpsId: "other" }])).toHaveLength(1);
    expect(buildLedger("dps", "2026-11-12", null, [leave])).toHaveLength(1);
  });

  it("trims a handover to the end of the case", () => {
    const spans = buildLedger("dps", "2026-11-02", "2026-11-06", [leave]);
    expect(spans.at(-1)).toMatchObject({ officerId: "link", toOn: "2026-11-06" });
  });

  it("finds the holder on a day", () => {
    const spans = buildLedger("dps", "2026-11-02", null, [leave]);
    expect(holderOn(spans, "2026-11-06")?.officerId).toBe("link");
    expect(holderOn(spans, "2026-12-01")?.officerId).toBe("dps");
  });

  it("splits delay days by holder and suggests the officer with the most", () => {
    const spans = buildLedger("dps", "2026-11-02", null, [leave]);
    // Delay days after 3 Nov up to 12 Nov: 4 (DPS), 5, 6, 7, 10 (Link), 11, 12 (DPS).
    const split = attributeDelay(spans, "2026-11-03", "2026-11-12", cal);
    expect(split).toEqual([
      { officerId: "link", capacity: "LINK_OFFICER", delayDays: 4 },
      { officerId: "dps", capacity: "DPS", delayDays: 3 },
    ]);
    expect(suggestedPenaltyOfficer(split)?.officerId).toBe("link");
  });

  it("has no attribution when there is no delay", () => {
    expect(attributeDelay(buildLedger("dps", "2026-11-02", null, []), "2026-11-20", "2026-11-20", cal)).toEqual([]);
  });
});
