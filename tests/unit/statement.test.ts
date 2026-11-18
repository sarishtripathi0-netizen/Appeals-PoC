import { describe, expect, it } from "vitest";
import { makeCalendar } from "@/domain/calendar";
import { buildPlan, isFirstWorkingDayOfMonth, replan } from "@/domain/recovery";
import { DEFAULT_SETTINGS as s } from "@/domain/settings";
import { statementCsv, statementRow, statementTotals } from "@/domain/statement";

const cal = makeCalendar(["2026-11-09", "2026-11-24", "2026-12-25"]);

const base = {
  ref: "PEN-2026-000001", officerName: "Anjali Baruah (Demo)", employeeId: "EMP-000101", uin: "RTPS-PRC/2026/000007", amount: 4000, status: "RECOVERED",
  grns: [] as { grn: string; amount: number; status: string; settledOn: string | null }[],
  deductions: [] as { voucherNo: string; amount: number; recordedOn: string; verification: string; credit: string; creditedOn: string | null }[],
  refunds: [] as { amount: number; status: string; refundedOn: string | null }[],
  writeOffs: [] as { amount: number; status: string; decidedOn: string | null }[],
};

describe("statement rows", () => {
  it("counts eGRAS receipts as credited directly", () => {
    const r = statementRow({ ...base, grns: [{ grn: "G1", amount: 4000, status: "SUCCESS", settledOn: "2026-12-10" }] }, "2026-12-31");
    expect(r).toMatchObject({ egras: 4000, credited: 4000, difference: 0, outstanding: 0, grns: ["G1"] });
  });

  it("shows a deduction not yet credited as a difference", () => {
    const d = { voucherNo: "TV-1", amount: 4000, recordedOn: "2026-12-04", verification: "VERIFIED", credit: "MISSING", creditedOn: null };
    expect(statementRow({ ...base, deductions: [d] }, "2026-12-31")).toMatchObject({ deducted: 4000, credited: 0, difference: 4000, outstanding: 0, vouchers: ["TV-1"] });
    expect(statementRow({ ...base, deductions: [{ ...d, credit: "CREDITED", creditedOn: "2026-12-09" }] }, "2026-12-31")).toMatchObject({ credited: 4000, difference: 0 });
  });

  it("ignores returned entries and anything after the month end", () => {
    const r = statementRow({
      ...base,
      deductions: [
        { voucherNo: "TV-R", amount: 4000, recordedOn: "2026-12-04", verification: "RETURNED", credit: "AWAITED", creditedOn: null },
        { voucherNo: "TV-2", amount: 2000, recordedOn: "2027-01-05", verification: "SUBMITTED", credit: "AWAITED", creditedOn: null },
      ],
    }, "2026-12-31");
    expect(r).toMatchObject({ deducted: 0, outstanding: 4000, vouchers: [] });
  });

  it("shows refunds and write-offs", () => {
    const r = statementRow({
      ...base,
      grns: [{ grn: "G1", amount: 4000, status: "SUCCESS", settledOn: "2026-12-02" }],
      deductions: [{ voucherNo: "TV-1", amount: 4000, recordedOn: "2026-12-04", verification: "VERIFIED", credit: "CREDITED", creditedOn: "2026-12-09" }],
      refunds: [{ amount: 4000, status: "REFUNDED", refundedOn: "2026-12-20" }],
    }, "2026-12-31");
    expect(r).toMatchObject({ egras: 4000, deducted: 4000, credited: 8000, refunded: 4000, outstanding: 0 });
    expect(statementRow({ ...base, writeOffs: [{ amount: 4000, status: "APPROVED", decidedOn: "2026-12-15" }] }, "2026-12-31")).toMatchObject({ writtenOff: 4000, outstanding: 0 });
  });

  it("totals and exports to CSV with quoting", () => {
    const rows = [statementRow(base, "2026-12-31"), statementRow({ ...base, ref: "PEN-2026-000002", officerName: "Das, Mitali", amount: 1000 }, "2026-12-31")];
    expect(statementTotals(rows)).toMatchObject({ penalties: 2, imposed: 5000, outstanding: 5000 });
    const csv = statementCsv(rows, (x) => x.toLowerCase());
    expect(csv.split("\n")[0]).toContain("Collected through eGRAS");
    expect(csv).toContain('"Das, Mitali"');
  });
});

describe("statement day and re-planning", () => {
  it("is the first working day of the month", () => {
    expect(isFirstWorkingDayOfMonth("2026-12-01", cal)).toBe(true);
    expect(isFirstWorkingDayOfMonth("2026-11-02", cal)).toBe(true); // Sun 1 Nov
    expect(isFirstWorkingDayOfMonth("2026-11-03", cal)).toBe(false);
    expect(isFirstWorkingDayOfMonth("2026-08-01", cal)).toBe(true); // a 1st Saturday is a working day
  });

  it("does not ask again for a month already deducted; the shortfall moves on", () => {
    const plan = buildPlan(13000, "2026-12-04", s, cal);
    const after = replan(plan, 10000, true, "2026-12-10", s, cal, new Set(["2026-12"]));
    expect(after.map((p) => p.month)).toEqual(["2027-01", "2027-02"]);
    expect(after.reduce((x, p) => x + p.amount, 0)).toBe(10000);
    const single = replan(buildPlan(4000, "2026-12-04", s, cal), 1000, true, "2026-12-10", s, cal, new Set(["2026-12"]));
    expect(single.map((p) => [p.month, p.amount])).toEqual([["2027-01", 1000]]);
  });
});
