// Penalty module, step P3: treasury credits, the monthly statement, credit missing (E15) and ticket deadlines (E14).
import { beforeEach, describe, expect, it } from "vitest";
import type { StatementRow } from "@/domain/statement";
import { SYSTEM_ACTOR } from "@/lib/audit";
import { getRuleContext } from "@/lib/context";
import { prisma } from "@/lib/db";
import { advanceClockBy, advanceClockTo } from "@/scheduler";
import { seedBaseline } from "@/seed";
import { fileAppeal } from "@/services/appeals";
import { imposePenalty } from "@/services/penalties";
import { dropCredit, followUpCredit } from "@/services/reconciliation";
import { confirmUnpaid, recordDeduction, setLeave, verifyDeduction } from "@/services/recovery";

const actor = (id: string, role: string) => ({ id, name: id, role });
const ddo = actor("u-ss-ddo", "SEWA_SETU_DDO");
const nodal = actor("u-fin-nodal", "FINANCE_NODAL");
const penalty = (id: string) => prisma.penalty.findUniqueOrThrow({ where: { id } });

/** Rs. 4,000 on the DPS, imposed Tue 3 Nov, confirmed unpaid on Fri 4 Dec and on a ticket. */
async function onTicket(amount = 4000) {
  await advanceClockBy(SYSTEM_ACTOR, 1);
  const app = await prisma.application.findFirstOrThrow({ where: { citizenId: "u-cit-1", serviceCode: "PRC" } });
  const appeal = await fileAppeal(actor("u-cit-1", "CITIZEN"), { applicationId: app.id });
  const { today, settings, cal } = await getRuleContext();
  const p = await imposePenalty(prisma, {
    order: { id: "order-1", orderNo: `${appeal.appealNo}/ORD-1` }, appeal: { id: appeal.id, appealNo: appeal.appealNo, level: "FAA" }, app,
    line: { officerId: "u-dps-kmm", capacity: "DPS", amount }, delayDays: 5, imposedById: "u-faa-kmm",
  }, today, settings, cal);
  await advanceClockTo(SYSTEM_ACTOR, "2026-12-04");
  await confirmUnpaid(ddo, p.id);
  const line = await prisma.ticketLine.findFirstOrThrow({ where: { penaltyId: p.id } });
  return { p, line };
}

async function deductAndVerify(lineId: string, penaltyId: string, amount = 4000) {
  await recordDeduction(nodal, { lineId, payrollRef: "", salaryMonth: "2026-12", amount, voucherNo: "TV/2026/12/0091", proofFile: "slip.pdf" });
  const d = await prisma.deduction.findFirstOrThrow({ where: { penaltyId } });
  await verifyDeduction(ddo, d.id);
  return d;
}

const statement = async (month: string) => {
  const st = await prisma.monthlyStatement.findUniqueOrThrow({ where: { month } });
  return { ...st, rows: JSON.parse(st.rows) as StatementRow[] };
};

beforeEach(async () => {
  await seedBaseline(prisma);
});

describe("credit confirmed, then closed by the monthly statement", () => {
  it("matches the treasury credit to the voucher and closes the penalty on the first working day of the next month", async () => {
    const { p, line } = await onTicket();
    // The November statement is generated on Tue 1 Dec and shows the unpaid penalty.
    expect((await statement("2026-11")).rows.find((r) => r.ref === p.ref)).toMatchObject({ imposed: 4000, outstanding: 4000 });
    await deductAndVerify(line.id, p.id);
    expect((await penalty(p.id)).status).toBe("RECOVERED");
    await advanceClockTo(SYSTEM_ACTOR, "2026-12-09");
    expect((await penalty(p.id)).status).toBe("CREDIT_CONFIRMED");
    expect(await prisma.deduction.findFirstOrThrow({ where: { penaltyId: p.id } })).toMatchObject({ credit: "CREDITED", creditedOn: "2026-12-09" });
    await advanceClockTo(SYSTEM_ACTOR, "2026-12-31");
    expect((await penalty(p.id)).status).toBe("CREDIT_CONFIRMED");
    await advanceClockBy(SYSTEM_ACTOR, 1); // Fri 1 Jan 2027
    expect(await penalty(p.id)).toMatchObject({ status: "CLOSED", closedOn: "2027-01-01" });
    expect((await statement("2026-12")).rows.find((r) => r.ref === p.ref)).toMatchObject({ deducted: 4000, credited: 4000, difference: 0, vouchers: ["TV/2026/12/0091"] });
    expect(await prisma.notification.count({ where: { entityType: "statement", entityId: "2026-12", recipientId: { in: ["u-fin-senior", "u-registrar"] } } })).toBeGreaterThanOrEqual(2);
  });
});

describe("credit missing (E15)", () => {
  it("flags a dropped credit, asks Finance to follow up, escalates, shows in the statement, and recovers once re-sent", async () => {
    const { p, line } = await onTicket();
    await deductAndVerify(line.id, p.id);
    const feed = await prisma.creditFeedEntry.findFirstOrThrow({ where: { voucherNo: "TV/2026/12/0091" } });
    await expect(dropCredit(nodal, feed.id)).rejects.toThrow(/demo control/);
    await dropCredit(ddo, feed.id);
    await advanceClockTo(SYSTEM_ACTOR, "2026-12-19");
    expect((await penalty(p.id)).status).toBe("RECOVERED");
    await advanceClockBy(SYSTEM_ACTOR, 1);
    expect((await penalty(p.id)).status).toBe("CREDIT_MISSING");
    const task = await prisma.task.findFirstOrThrow({ where: { penaltyId: p.id, kind: "CREDIT_FOLLOW_UP" } });
    expect(task).toMatchObject({ assigneeId: "u-fin-nodal", status: "OPEN", dueOn: "2026-12-27" });
    await advanceClockTo(SYSTEM_ACTOR, "2026-12-28");
    expect((await penalty(p.id)).status).toBe("ESCALATED");
    expect(await prisma.notification.count({ where: { entityId: p.id, channel: "DASHBOARD", recipientId: { in: ["u-fin-senior", "u-registrar"] }, text: { startsWith: "Escalated" } } })).toBe(2);
    await advanceClockTo(SYSTEM_ACTOR, "2027-01-01");
    expect((await statement("2026-12")).rows.find((r) => r.ref === p.ref)).toMatchObject({ deducted: 4000, credited: 0, difference: 4000 });
    expect((await penalty(p.id)).status).toBe("ESCALATED"); // not closed while the credit is missing

    await expect(followUpCredit(actor("u-fin-backup", "FINANCE_NODAL"), task.id, "Asked treasury")).rejects.toThrow(/not assigned/);
    await followUpCredit(nodal, task.id, "Treasury had posted it to a suspense head; re-posted today.");
    await advanceClockBy(SYSTEM_ACTOR, 1);
    expect((await penalty(p.id)).status).toBe("CREDIT_CONFIRMED");
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("DONE");
  });
});

describe("ticket deadline (E14)", () => {
  it("escalates a ticket with nothing deducted by pay date plus grace, and carries the amount to the next salary", async () => {
    const { p } = await onTicket();
    const t = await prisma.ticket.findFirstOrThrow();
    expect(JSON.parse(t.plan)[0].dueOn).toBe("2027-01-06");
    await advanceClockTo(SYSTEM_ACTOR, "2027-01-06");
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } })).escalatedOn).toBeNull();
    await advanceClockBy(SYSTEM_ACTOR, 1);
    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.escalatedOn).toBe("2027-01-07");
    expect(JSON.parse(after.plan)).toEqual([expect.objectContaining({ month: "2027-01", amount: 4000 })]);
    expect(await prisma.notification.count({ where: { entityId: t.id, channel: "DASHBOARD", recipientId: "u-fin-senior" } })).toBe(1);
    expect((await penalty(p.id)).status).toBe("IN_RECOVERY");
  });

  it("flags when both nodal officers were on leave", async () => {
    await prisma.user.updateMany({ where: { role: "FINANCE_NODAL" }, data: { onLeave: true } });
    await onTicket();
    const t = await prisma.ticket.findFirstOrThrow();
    expect(t.bothOnLeave).toBe(true);
    await advanceClockTo(SYSTEM_ACTOR, "2027-01-07");
    const n = await prisma.notification.findFirstOrThrow({ where: { entityId: t.id, recipientId: "u-fin-senior" } });
    expect(n.text).toContain("both nodal officers are on leave");
  });

  it("does not escalate a month that was partly deducted; the shortfall carries forward", async () => {
    const { p, line } = await onTicket();
    await recordDeduction(nodal, { lineId: line.id, payrollRef: "", salaryMonth: "2026-12", amount: 1500, voucherNo: "TV-P1", proofFile: "slip.pdf" });
    expect((await penalty(p.id)).status).toBe("PARTLY_DEDUCTED");
    await advanceClockTo(SYSTEM_ACTOR, "2027-01-07");
    const t = await prisma.ticket.findFirstOrThrow();
    expect(t.escalatedOn).toBeNull();
    expect(JSON.parse(t.plan)).toEqual([expect.objectContaining({ month: "2027-01", amount: 2500 })]);
    await setLeave(nodal, false);
  });
});
