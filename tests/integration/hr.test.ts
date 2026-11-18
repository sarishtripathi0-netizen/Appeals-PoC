// HR Utility layer against a fake HR client: readiness, delay ledger with a Link Officer, event cursor.
import { beforeEach, describe, expect, it } from "vitest";
import { HrError, type HrClient, type HrEventRow, type SeatHolders } from "@/adapters/hr";
import { SYSTEM_ACTOR } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { seedBaseline } from "@/seed";
import { hrDelayLedger, hrReadiness, pullHrEvents } from "@/services/hr";

const seat = (q: { officeCode: string; postCode: string; functionCode: string; at: string }, holders: { id: string; available?: boolean; demo?: boolean }[], link?: string): SeatHolders => ({
  office_id: q.officeCode, post_code: q.postCode, function_code: q.functionCode, at: q.at, roster_mode: false,
  holders: holders.map((h) => ({ sanctioned_post_id: `${q.officeCode}-${q.postCode}-01`, employee_id: h.id, name: `Name ${h.id}`, cadre: null, year_of_joining: null, charge_type: "SUBSTANTIVE", available: h.available ?? true, unavailable_reason: h.available === false ? "LEAVE" : null, is_demo: !!h.demo })),
  link_officer: link ? { employee_id: link, name: `Name ${link}`, sanctioned_post_id: "X", rule_step: "SAME_POST", deemed_dps_under_rule_3_3: true, is_demo: false } : null,
  status: holders.length || link ? "RESOLVED" : "NO_HOLDER", reason: holders.length || link ? null : "No officer holds it.",
});

/** A small HR world: Dispur CO on leave 10–13 Nov 2026 (covered by EMP-9); Social Welfare ADC is a demo officer; Sonapur vacant. */
function fakeHr(events: HrEventRow[] = []): HrClient {
  const wrap = <T,>(body: T) => ({ body, mdmVersion: 39019, mdmStale: false });
  return {
    mdmStatus: async () => wrap({ mode: "LIVE", base_url: "", applied_version: 39019, last_checked_at: null, last_error: null, last_check: null, consumer_code: "hr-utility-poc" }),
    seatHolders: async (q) => {
      if (!["CO_DISPUR", "DC_KMM", "SDO_KMM-SNP"].includes(q.officeCode)) throw new HrError(`Office ${q.officeCode} is not in MDM`, 404);
      if (q.officeCode === "CO_DISPUR") {
        const day = q.at.slice(0, 10);
        const away = day >= "2026-11-10" && day <= "2026-11-13";
        return wrap(seat(q, [{ id: "EMP-0047", available: !away }], away ? "EMP-0009" : undefined));
      }
      if (q.officeCode === "DC_KMM" && q.postCode === "ADC") return wrap(seat(q, [{ id: "DEMO-0008", demo: true }]));
      if (q.officeCode === "DC_KMM" && q.postCode === "DISTRICT_COMMISSIONER") return wrap(seat(q, [{ id: "EMP-0008" }]));
      return wrap(seat(q, []));
    },
    chairHistory: async () => { throw new Error("not used"); },
    employeePosts: async () => { throw new Error("not used"); },
    roster: async () => { throw new Error("not used"); },
    events: async (after) => wrap({ events: events.filter((e) => e.id > after) }),
  };
}

beforeEach(async () => {
  await seedBaseline(prisma);
  await prisma.hrResolution.deleteMany();
  await prisma.hrEvent.deleteMany();
  await prisma.hrEventCursor.deleteMany();
});

describe("readiness of AMS seats", () => {
  it("resolves covered seats, flags demo officers, empty seats and offices HR does not cover, without logging", async () => {
    const rows = await hrReadiness("2026-11-04", fakeHr());
    const get = (s: string, o: string, r: string) => rows.find((x) => x.serviceCode === s && x.officeId === o && x.role === r)!;
    expect(get("INC", "OFF-KMM-DPR", "DPS")).toMatchObject({ outcome: "RESOLVED", hrOfficer: "Name EMP-0047 (EMP-0047)", amsOfficer: "Anjali Baruah" });
    expect(get("SCC", "OFF-KMM-DCO", "DPS").outcome).toBe("RESOLVED_DEMO");
    expect(get("SCC", "OFF-SNP-CDO", "DPS").outcome).toBe("NO_ONE");
    expect(get("INC", "OFF-JRT-WRC", "DPS")).toMatchObject({ outcome: "NOT_IN_HR", note: expect.stringContaining("not in MDM") });
    expect(get("TRL", "OFF-KMM-MUN", "DPS").outcome).toBe("NOT_IN_HR");
    expect(await prisma.hrResolution.count()).toBe(0);
  });
});

describe("delay ledger from HR", () => {
  it("gives the days the CO was on leave to the Link Officer, and keeps each answer with its MDM version", async () => {
    const cal = await prisma.application.findFirstOrThrow({ where: { officeId: "OFF-KMM-DPR", status: "HELD" } });
    // Make the delay run from Mon 9 Nov to Mon 16 Nov 2026 (Wed 11 Nov is a working day; 9 Nov is a holiday in the demo calendar).
    await prisma.application.update({ where: { id: cal.id }, data: { dueOn: "2026-11-06", deliveredOn: "2026-11-16" } });
    const l = await hrDelayLedger(cal.id, fakeHr());
    expect(l.hr).toEqual([
      { officerId: "EMP-0009", capacity: "LINK_OFFICER", delayDays: 4 },
      { officerId: "EMP-0047", capacity: "DPS", delayDays: 2 },
    ]);
    expect(l.mdmVersions).toEqual([39019]);
    expect(await prisma.hrResolution.count({ where: { purpose: "LEDGER", applicationId: cal.id } })).toBe(l.days.length);
  });

  it("stops with HR's reason for an office HR does not cover", async () => {
    const app = await prisma.application.findFirstOrThrow({ where: { officeId: "OFF-JRT-WRC" } });
    await prisma.application.update({ where: { id: app.id }, data: { dueOn: "2026-10-01", deliveredOn: "2026-10-20" } });
    await expect(hrDelayLedger(app.id, fakeHr())).rejects.toThrow(/AS-CR-290-01 is not in MDM/);
  });
});

describe("HR events", () => {
  it("reads from the last id seen and never stores an event twice", async () => {
    const ev = (id: number): HrEventRow => ({ id, ts: "2026-11-04T10:00:00+05:30", type: "availability.started", effective_at: "2026-11-10T00:00:00+05:30", payload: { employee_id: "EMP-0047", office_id: "CO_DISPUR", post_code: "CIRCLE_OFFICER", is_demo: false } });
    expect(await pullHrEvents(SYSTEM_ACTOR, fakeHr([ev(1), ev(2)]))).toEqual({ received: 2, lastId: 2 });
    expect(await pullHrEvents(SYSTEM_ACTOR, fakeHr([ev(1), ev(2), ev(3)]))).toEqual({ received: 1, lastId: 3 });
    expect(await prisma.hrEvent.count()).toBe(3);
  });
});
