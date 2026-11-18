// Penalty module, step P2: day 30, confirm unpaid, Recovery Direction, one ticket per officer, deductions, verification.
import { beforeEach, describe, expect, it } from "vitest";
import { SYSTEM_ACTOR } from "@/lib/audit";
import { getRuleContext } from "@/lib/context";
import { prisma } from "@/lib/db";
import { advanceClockBy, advanceClockTo } from "@/scheduler";
import { seedBaseline } from "@/seed";
import { fileAppeal } from "@/services/appeals";
import { imposePenalty, payPenalty } from "@/services/penalties";
import { confirmUnpaid, recordDeduction, returnDeduction, setLeave, signDirection, verifyDeduction } from "@/services/recovery";
import { updateSetting } from "@/services/settings";

const actor = (id: string, role: string) => ({ id, name: id, role });
const ddo = actor("u-ss-ddo", "SEWA_SETU_DDO");
const nodal = actor("u-fin-nodal", "FINANCE_NODAL");
const backup = actor("u-fin-backup", "FINANCE_NODAL");
const admin = actor("u-admin", "ADMIN");
const setSetting = (key: string, value: unknown) => prisma.setting.update({ where: { key }, data: { value: JSON.stringify(value) } });
const penalty = (id: string) => prisma.penalty.findUniqueOrThrow({ where: { id } });

/** Penalties imposed by the FAA on Tue 3 Nov 2026 (last date Thu 3 Dec), on any officer, from Rina's real appeal. */
async function impose(lines: { officerId: string; amount: number }[]) {
  await advanceClockBy(SYSTEM_ACTOR, 1);
  const app = await prisma.application.findFirstOrThrow({ where: { citizenId: "u-cit-1", serviceCode: "PRC" } });
  const appeal = await fileAppeal(actor("u-cit-1", "CITIZEN"), { applicationId: app.id });
  const { today, settings, cal } = await getRuleContext();
  const out = [];
  for (const [i, l] of lines.entries()) {
    out.push(await imposePenalty(prisma, {
      order: { id: `order-${i}`, orderNo: `${appeal.appealNo}/ORD-${i + 1}` }, appeal: { id: appeal.id, appealNo: appeal.appealNo, level: "FAA" }, app,
      line: { officerId: l.officerId, capacity: "DPS", amount: l.amount }, delayDays: 5, imposedById: "u-faa-kmm",
    }, today, settings, cal));
  }
  return out;
}

beforeEach(async () => {
  await seedBaseline(prisma);
});

describe("unpaid to recovered (main flow)", () => {
  it("flags day 30, confirms, tickets, deducts with proof and verifies, with every control", async () => {
    const [p] = await impose([{ officerId: "u-dps-kmm", amount: 4000 }]);
    await advanceClockTo(SYSTEM_ACTOR, "2026-12-03");
    expect((await penalty(p.id)).status).toBe("RAISED");
    await advanceClockBy(SYSTEM_ACTOR, 1);
    expect(await penalty(p.id)).toMatchObject({ status: "OVERDUE", overdueOn: "2026-12-04" });

    await expect(confirmUnpaid(nodal, p.id)).rejects.toThrow(/role/);
    await confirmUnpaid(ddo, p.id);
    expect(await penalty(p.id)).toMatchObject({ status: "IN_RECOVERY", qrActive: false, unpaidConfirmedOn: "2026-12-04" });
    expect(await prisma.recoveryDirection.findFirstOrThrow({ where: { penaltyId: p.id } })).toMatchObject({ mode: "STANDING", status: "IN_PLACE" });
    const ticket = await prisma.ticket.findFirstOrThrow({ where: { employeeId: "EMP-000101" }, include: { lines: true } });
    expect(ticket).toMatchObject({ status: "OPEN", assigneeId: "u-fin-nodal", priority: "NORMAL" });
    expect(JSON.parse(ticket.plan)).toEqual([{ month: "2026-12", amount: 4000, dueOn: "2027-01-06" }]);
    const lineId = ticket.lines[0].id;
    await expect(payPenalty({ ...actor("u-dps-kmm", "DPS"), employeeId: "EMP-000101" }, p.ref, { amount: 4000, channel: "QR" })).rejects.toThrow(/QR code is switched off/);

    const entry = { lineId, payrollRef: "", salaryMonth: "2026-12", amount: 4000, voucherNo: "TV/2026/12/0091", proofFile: "salary-slip-dec.pdf" };
    await expect(recordDeduction(backup, entry)).rejects.toThrow(/not assigned to you/);
    await expect(recordDeduction(ddo, entry)).rejects.toThrow(/role/);
    await expect(recordDeduction(nodal, { ...entry, amount: 5000 })).rejects.toThrow(/more than/);
    await expect(recordDeduction(nodal, { ...entry, proofFile: "" })).rejects.toThrow(/proof/);
    await expect(recordDeduction(nodal, { ...entry, voucherNo: "" })).rejects.toThrow(/voucher/);
    await recordDeduction(nodal, entry);
    expect((await penalty(p.id)).status).toBe("DEDUCTED");
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({ status: "CLOSED" });
    const d = await prisma.deduction.findFirstOrThrow({ where: { penaltyId: p.id } });
    expect(d).toMatchObject({ verification: "SUBMITTED", payrollRef: expect.stringMatching(/^SAL-/), kind: "SALARY" });
    expect(await prisma.creditFeedEntry.findFirstOrThrow({ where: { voucherNo: "TV/2026/12/0091" } })).toMatchObject({ amount: 4000, expectedOn: "2026-12-09" });

    await expect(verifyDeduction(nodal, d.id)).rejects.toThrow(/role/);
    await verifyDeduction(ddo, d.id);
    expect((await penalty(p.id)).status).toBe("RECOVERED");
    const msg = "Deduction for UIN " + p.uin + " has been processed. Rs. 4,000 has been deducted from your salary for December 2026.";
    expect(await prisma.notification.count({ where: { recipientId: "u-dps-kmm", text: msg } })).toBe(3); // dashboard, SMS, email
    expect(await prisma.notification.count({ where: { recipientId: { in: ["u-faa-kmm", "u-ca-pers"] }, text: { contains: msg } } })).toBeGreaterThanOrEqual(2);
    await expect(verifyDeduction(ddo, d.id)).rejects.toThrow(/already been checked/);
  });

  it("returns a deduction to Finance with a reason, reopening the line", async () => {
    const [p] = await impose([{ officerId: "u-dps-kmm", amount: 2000 }]);
    await advanceClockTo(SYSTEM_ACTOR, "2026-12-04");
    await confirmUnpaid(ddo, p.id);
    const line = await prisma.ticketLine.findFirstOrThrow({ where: { penaltyId: p.id } });
    await recordDeduction(nodal, { lineId: line.id, payrollRef: "", salaryMonth: "2026-12", amount: 2000, voucherNo: "TV-1", proofFile: "p.pdf" });
    const d = await prisma.deduction.findFirstOrThrow({ where: { penaltyId: p.id } });
    await expect(returnDeduction(ddo, d.id, "")).rejects.toThrow(/wrong/);
    await returnDeduction(ddo, d.id, "Voucher number does not match the treasury schedule");
    expect((await penalty(p.id)).status).toBe("IN_RECOVERY");
    expect((await prisma.ticketLine.findUniqueOrThrow({ where: { id: line.id } })).status).toBe("ACTIVE");
    expect((await prisma.ticket.findFirstOrThrow({ where: { id: line.ticketId } })).status).toBe("OPEN");
  });
});

describe("a receipt pending on day 30 (E1 guard)", () => {
  it("cannot be confirmed unpaid until it settles; when it succeeds, no ticket is raised", async () => {
    const [p] = await impose([{ officerId: "u-dps-kmm", amount: 2000 }]);
    await advanceClockTo(SYSTEM_ACTOR, "2026-12-04");
    expect((await penalty(p.id)).status).toBe("OVERDUE");
    await payPenalty({ ...actor("u-dps-kmm", "DPS"), employeeId: "EMP-000101" }, p.ref, { amount: 2000, channel: "QR" });
    await expect(confirmUnpaid(ddo, p.id)).rejects.toThrow(/pending/);
    await advanceClockBy(SYSTEM_ACTOR, 1);
    expect((await penalty(p.id)).status).toBe("CLOSED");
    expect(await prisma.ticket.count()).toBe(0);
  });
});

describe("per-case Recovery Direction", () => {
  it("waits for the Competent Authority's signature, with reminders, before the ticket", async () => {
    await setSetting("recoveryDirectionMode", "PER_CASE");
    const [p] = await impose([{ officerId: "u-dps-kmm", amount: 2000 }]);
    await advanceClockTo(SYSTEM_ACTOR, "2026-12-04");
    await confirmUnpaid(ddo, p.id);
    expect((await penalty(p.id)).status).toBe("UNPAID_CONFIRMED");
    expect(await prisma.ticket.count()).toBe(0);
    const dir = await prisma.recoveryDirection.findFirstOrThrow({ where: { penaltyId: p.id } });
    expect(dir).toMatchObject({ mode: "PER_CASE", status: "AWAITING_SIGNATURE", competentAuthorityId: "u-ca-pers" });
    await advanceClockTo(SYSTEM_ACTOR, "2026-12-09"); // 3 working days later
    expect((await prisma.recoveryDirection.findUniqueOrThrow({ where: { id: dir.id } })).remindersSent).toBe(1);
    await expect(signDirection(actor("u-ca-ias", "COMPETENT_AUTHORITY"), dir.id)).rejects.toThrow(/Only the officer's Competent Authority/);
    await signDirection(actor("u-ca-pers", "COMPETENT_AUTHORITY"), dir.id);
    expect((await penalty(p.id)).status).toBe("IN_RECOVERY");
    expect(await prisma.ticket.count()).toBe(1);
  });
});

describe("one ticket per officer (E12, E13)", () => {
  it("combines penalties, applies the instalment rule to the total and carries a shortfall forward", async () => {
    const [a, b] = await impose([{ officerId: "u-dps-two", amount: 5000 }, { officerId: "u-dps-two", amount: 8000 }]);
    await advanceClockTo(SYSTEM_ACTOR, "2026-12-04");
    await confirmUnpaid(ddo, a.id);
    await confirmUnpaid(ddo, b.id);
    const tickets = await prisma.ticket.findMany({ include: { lines: true } });
    expect(tickets).toHaveLength(1);
    expect(tickets[0].lines).toHaveLength(2);
    expect(JSON.parse(tickets[0].plan).map((x: { amount: number }) => x.amount)).toEqual([4333, 4333, 4334]);
    const lineA = tickets[0].lines.find((l) => l.penaltyId === a.id)!;
    await recordDeduction(nodal, { lineId: lineA.id, payrollRef: "", salaryMonth: "2026-12", amount: 3000, voucherNo: "TV-A1", proofFile: "a.pdf" });
    expect((await penalty(a.id)).status).toBe("PARTLY_DEDUCTED");
    const plan = JSON.parse((await prisma.ticket.findUniqueOrThrow({ where: { id: tickets[0].id } })).plan) as { amount: number; month: string }[];
    expect(plan.reduce((s, x) => s + x.amount, 0)).toBe(10000);
    expect(plan.map((x) => x.month)).toEqual(["2027-01", "2027-02"]); // December is done (part deduction); the rest carries forward
  });
});

describe("routing and priority (E8, E9, E11, E16)", () => {
  it("sends officers who cannot be recovered from State salary to the exceptions queue, and puts retiring officers first", async () => {
    const [dep, sus, ret, mis] = await impose([
      { officerId: "u-dps-dep", amount: 1000 }, { officerId: "u-dps-sus", amount: 1000 }, { officerId: "u-dps-ret", amount: 1000 }, { officerId: "u-dps-jrt", amount: 1000 },
    ]);
    await prisma.staffRecord.update({ where: { employeeId: "EMP-000201" }, data: { name: "A Different Person" } });
    await advanceClockTo(SYSTEM_ACTOR, "2026-12-04");
    for (const p of [dep, sus, ret, mis]) await confirmUnpaid(ddo, p.id);
    const kinds = Object.fromEntries((await prisma.exceptionCase.findMany()).map((e) => [e.penaltyId, e.kind]));
    expect(kinds).toEqual({ [dep.id]: "NOT_ON_STATE_PAYROLL", [sus.id]: "SUSPENDED", [mis.id]: "STAFF_RECORD_MISMATCH" });
    for (const p of [dep, sus, mis]) expect((await penalty(p.id)).status).toBe("EXCEPTION");
    expect(await prisma.ticket.findFirstOrThrow({ where: { employeeId: "EMP-000121" } })).toMatchObject({ priority: "RETIREMENT" });
    expect((await penalty(ret.id)).retirementAlertOn).toBe("2026-12-04");
  });
});

describe("nodal officer on leave", () => {
  it("moves open tickets to the backup, flags both on leave, and moves them back", async () => {
    const [p] = await impose([{ officerId: "u-dps-kmm", amount: 2000 }]);
    await advanceClockTo(SYSTEM_ACTOR, "2026-12-04");
    await confirmUnpaid(ddo, p.id);
    await setLeave(nodal, true);
    expect(await prisma.ticket.findFirstOrThrow()).toMatchObject({ assigneeId: "u-fin-backup", bothOnLeave: false });
    await setLeave(backup, true);
    expect(await prisma.ticket.findFirstOrThrow()).toMatchObject({ assigneeId: "u-fin-nodal", bothOnLeave: true });
    await setLeave(nodal, false);
    expect(await prisma.ticket.findFirstOrThrow()).toMatchObject({ assigneeId: "u-fin-nodal", bothOnLeave: false });
    await expect(setLeave(ddo, true)).rejects.toThrow(/Finance nodal officer/);
  });
});

describe("settings editor", () => {
  it("lets only the administrator change a setting, validates it and audits it", async () => {
    await expect(updateSetting(ddo, "maxInstalments", "4")).rejects.toThrow(/administrator/);
    await expect(updateSetting(admin, "maxInstalments", "four")).rejects.toThrow(/number/);
    await expect(updateSetting(admin, "recoveryDirectionMode", "SOMETIMES")).rejects.toThrow(/options/);
    await updateSetting(admin, "pensionRecovery", "true");
    expect((await getRuleContext()).settings.pensionRecovery).toBe(true);
    expect(await prisma.auditEvent.count({ where: { action: "setting.change", entityId: "pensionRecovery" } })).toBe(1);
  });
});
