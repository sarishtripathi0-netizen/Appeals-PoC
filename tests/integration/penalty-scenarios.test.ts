// Penalty module demo scenarios: each one stages cleanly and leaves the case where the presenter starts.
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getToday } from "@/lib/context";
import { SYSTEM_ACTOR } from "@/lib/audit";
import { advanceClockBy, advanceClockTo } from "@/scheduler";
import { PENALTY_SCENARIOS, stagePenaltyScenario } from "@/seed/penalty-scenarios";
import { recordRefund } from "@/services/exceptions";
import { payPenalty } from "@/services/penalties";
import { confirmUnpaid, recordDeduction, verifyDeduction } from "@/services/recovery";

const ddo = { id: "u-ss-ddo", name: "u-ss-ddo", role: "SEWA_SETU_DDO" };
const nodal = { id: "u-fin-nodal", name: "u-fin-nodal", role: "FINANCE_NODAL" };

const penalties = () => prisma.penalty.findMany({ orderBy: { amount: "asc" } });

const EXPECT: Record<number, { today: string; statuses: string[] }> = {
  1: { today: "2026-11-12", statuses: ["RAISED"] },
  2: { today: "2026-12-03", statuses: ["OVERDUE"] },
  3: { today: "2026-11-12", statuses: ["RAISED", "RAISED"] },
  4: { today: "2026-12-02", statuses: ["RAISED"] },
  5: { today: "2026-12-03", statuses: ["DEDUCTED", "IN_RECOVERY"] },
  6: { today: "2026-12-10", statuses: ["IN_RECOVERY", "PARTLY_DEDUCTED"] },
  7: { today: "2026-12-03", statuses: ["IN_RECOVERY", "IN_RECOVERY"] },
  8: { today: "2026-12-03", statuses: ["EXCEPTION"] },
  9: { today: "2026-12-03", statuses: ["IN_RECOVERY"] },
  10: { today: "2026-12-03", statuses: ["RECOVERED"] },
  11: { today: "2026-12-03", statuses: ["IN_RECOVERY"] },
  12: { today: "2026-12-03", statuses: ["OVERDUE"] },
};

describe("penalty demo scenarios", () => {
  it("has twelve scenarios, each with steps", () => {
    expect(PENALTY_SCENARIOS.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const s of PENALTY_SCENARIOS) expect(s.steps.length).toBeGreaterThan(0);
  });

  for (const s of PENALTY_SCENARIOS) {
    it(`stages scenario ${s.id}: ${s.title}`, async () => {
      await stagePenaltyScenario(prisma, s.id);
      expect(await getToday()).toBe(EXPECT[s.id].today);
      expect((await penalties()).map((p) => p.status).sort()).toEqual([...EXPECT[s.id].statuses].sort());
    });
  }

  it("scenario 9 puts the retiring officer's ticket first; scenario 10's credit is dropped; scenario 11 has both nodal officers on leave", async () => {
    await stagePenaltyScenario(prisma, 9);
    expect((await prisma.ticket.findFirstOrThrow()).priority).toBe("RETIREMENT");
    await stagePenaltyScenario(prisma, 10);
    expect(await prisma.creditFeedEntry.count({ where: { dropped: true } })).toBe(1);
    await stagePenaltyScenario(prisma, 11);
    expect(await prisma.user.count({ where: { role: "FINANCE_NODAL", onLeave: false } })).toBe(0);
  });

  it("scenario 2 runs end to end: confirmed, deducted, verified, credited, closed by the December statement", async () => {
    await stagePenaltyScenario(prisma, 2);
    const p = await prisma.penalty.findFirstOrThrow();
    await confirmUnpaid(ddo, p.id);
    const line = await prisma.ticketLine.findFirstOrThrow({ where: { penaltyId: p.id } });
    await recordDeduction(nodal, { lineId: line.id, payrollRef: "", salaryMonth: "2026-12", amount: 4000, voucherNo: "TV/2026/12/0042", proofFile: "proof.pdf" });
    await verifyDeduction(ddo, (await prisma.deduction.findFirstOrThrow()).id);
    await advanceClockTo(SYSTEM_ACTOR, "2026-12-08");
    expect((await prisma.penalty.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("CREDIT_CONFIRMED");
    await advanceClockTo(SYSTEM_ACTOR, "2027-01-01");
    expect((await prisma.penalty.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("CLOSED");
    expect(await prisma.monthlyStatement.count({ where: { month: "2026-12" } })).toBe(1);
  });

  it("scenario 5 runs end to end: one late payment closes, the other is a double recovery refunded", async () => {
    await stagePenaltyScenario(prisma, 5);
    const [a, b] = await prisma.penalty.findMany({ orderBy: { amount: "desc" } }); // 3,000 (not deducted), 2,500 (deducted)
    await payPenalty({ id: "u-dps-kmm", name: "x", role: "DPS", employeeId: a.employeeId }, a.ref, { amount: 3000, channel: "CHALLAN" });
    await payPenalty({ id: "u-dps-two", name: "x", role: "DPS", employeeId: b.employeeId }, b.ref, { amount: 2500, channel: "CHALLAN" });
    await advanceClockBy(SYSTEM_ACTOR, 1);
    expect((await prisma.penalty.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("CLOSED");
    expect((await prisma.penalty.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("REFUND_DUE");
    const refund = await prisma.refund.findFirstOrThrow({ where: { penaltyId: b.id } });
    expect(refund).toMatchObject({ reason: "DOUBLE_RECOVERY", amount: 2500 });
    await recordRefund(nodal, refund.id, "REF/2026/12/0007");
    expect((await prisma.penalty.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("CLOSED");
  });
});
