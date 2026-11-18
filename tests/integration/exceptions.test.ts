// Penalty module, step P4: exception cases E2–E18 against the test database, through the simulated clock.
import { beforeEach, describe, expect, it } from "vitest";
import { SYSTEM_ACTOR } from "@/lib/audit";
import { getRuleContext } from "@/lib/context";
import { prisma } from "@/lib/db";
import { advanceClockBy, advanceClockTo } from "@/scheduler";
import { seedBaseline } from "@/seed";
import { fileAppeal } from "@/services/appeals";
import {
  acknowledgeTask, adjustPenalty, closeUnmatchedPayment, decideWriteOff, liftStay, recordManualRecovery, recordRefund, recordStay,
  requestWriteOff, resumeException, simulateUnmatchedPayment, updateStaffRecord,
} from "@/services/exceptions";
import { imposePenalty, payPenalty } from "@/services/penalties";
import { confirmUnpaid, recordDeduction } from "@/services/recovery";

const actor = (id: string, role: string) => ({ id, name: id, role });
const ddo = actor("u-ss-ddo", "SEWA_SETU_DDO");
const nodal = actor("u-fin-nodal", "FINANCE_NODAL");
const admin = actor("u-admin", "ADMIN");
const court = { authority: "COURT" as const, orderRef: "WP(C) 1234/2026", documentName: "order.pdf" };
const penalty = (id: string) => prisma.penalty.findUniqueOrThrow({ where: { id } });
const officer = (id: string, employeeId: string) => ({ ...actor(id, "DPS"), employeeId });

/** Penalties imposed by the FAA (u-faa-kmm) on Tue 3 Nov 2026; last date Thu 3 Dec. */
async function impose(lines: { officerId: string; amount: number; level?: string }[]) {
  await advanceClockBy(SYSTEM_ACTOR, 1);
  const app = await prisma.application.findFirstOrThrow({ where: { citizenId: "u-cit-1", serviceCode: "PRC" } });
  const appeal = await fileAppeal(actor("u-cit-1", "CITIZEN"), { applicationId: app.id });
  const { today, settings, cal } = await getRuleContext();
  const out = [];
  for (const [i, l] of lines.entries()) {
    out.push(await imposePenalty(prisma, {
      order: { id: `order-${i}`, orderNo: `${appeal.appealNo}/ORD-${i + 1}` }, appeal: { id: appeal.id, appealNo: appeal.appealNo, level: l.level ?? "FAA" }, app,
      line: { officerId: l.officerId, capacity: "DPS", amount: l.amount }, delayDays: 5, imposedById: "u-faa-kmm",
    }, today, settings, cal));
  }
  return out;
}
async function onTicket(lines: { officerId: string; amount: number; level?: string }[]) {
  const ps = await impose(lines);
  await advanceClockTo(SYSTEM_ACTOR, "2026-12-04");
  for (const p of ps) await confirmUnpaid(ddo, p.id);
  return ps;
}
const lineOf = (penaltyId: string) => prisma.ticketLine.findFirstOrThrow({ where: { penaltyId } });

beforeEach(async () => {
  await seedBaseline(prisma);
});

describe("late payment and double recovery (E2, E3, E4)", () => {
  it("E2: paid after the ticket was raised, before any deduction: line removed, Finance told to stop, closed", async () => {
    const [p] = await onTicket([{ officerId: "u-dps-kmm", amount: 3000 }]);
    await expect(payPenalty(officer("u-dps-kmm", "EMP-000101"), p.ref, { amount: 3000, channel: "QR" })).rejects.toThrow(/switched off/);
    await payPenalty(officer("u-dps-kmm", "EMP-000101"), p.ref, { amount: 3000, channel: "CHALLAN" });
    await advanceClockBy(SYSTEM_ACTOR, 1);
    expect((await penalty(p.id)).status).toBe("CLOSED");
    expect(await lineOf(p.id)).toMatchObject({ status: "REMOVED" });
    expect((await prisma.ticket.findFirstOrThrow()).status).toBe("CLOSED");
    const task = await prisma.task.findFirstOrThrow({ where: { penaltyId: p.id, kind: "STOP_DEDUCTION" } });
    expect(task.assigneeId).toBe("u-fin-nodal");
    await acknowledgeTask(nodal, task.id);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("DONE");
  });

  it("E3: paid through eGRAS and also deducted: flagged, refunded with a reference, then closed", async () => {
    const [p] = await onTicket([{ officerId: "u-dps-two", amount: 2500 }]);
    await recordDeduction(nodal, { lineId: (await lineOf(p.id)).id, payrollRef: "", salaryMonth: "2026-12", amount: 2500, voucherNo: "TV-3", proofFile: "slip.pdf" });
    await payPenalty(officer("u-dps-two", "EMP-000122"), p.ref, { amount: 2500, channel: "CHALLAN" });
    await advanceClockBy(SYSTEM_ACTOR, 1);
    expect(await penalty(p.id)).toMatchObject({ status: "REFUND_DUE", doubleRecovery: true });
    const r = await prisma.refund.findFirstOrThrow({ where: { penaltyId: p.id } });
    expect(r).toMatchObject({ reason: "DOUBLE_RECOVERY", amount: 2500, status: "DUE" });
    await expect(recordRefund(nodal, r.id, "")).rejects.toThrow(/refund reference/);
    await expect(recordRefund(ddo, r.id, "RF-1")).rejects.toThrow(/role/);
    await recordRefund(nodal, r.id, "RF/2026/12/007");
    expect(await penalty(p.id)).toMatchObject({ status: "CLOSED" });
  });

  it("E4: a short challan while on a ticket leaves only the balance to recover", async () => {
    const [p] = await onTicket([{ officerId: "u-dps-kmm", amount: 4000 }]);
    await payPenalty(officer("u-dps-kmm", "EMP-000101"), p.ref, { amount: 1500, channel: "CHALLAN" });
    await advanceClockBy(SYSTEM_ACTOR, 1);
    expect((await penalty(p.id)).status).toBe("IN_RECOVERY");
    expect(JSON.parse((await prisma.ticket.findFirstOrThrow()).plan)[0].amount).toBe(2500);
  });
});

describe("stay (E5)", () => {
  it("before confirmation: pauses the 30-day clock and resumes with the days that were left", async () => {
    const [p] = await impose([{ officerId: "u-dps-kmm", amount: 2000 }]);
    await advanceClockTo(SYSTEM_ACTOR, "2026-11-20");
    await expect(recordStay(ddo, p.id, { ...court, documentName: "" })).rejects.toThrow(/copy of the order/);
    await expect(recordStay(nodal, p.id, court)).rejects.toThrow(/role/);
    await recordStay(ddo, p.id, court);
    expect(await penalty(p.id)).toMatchObject({ status: "STAYED", qrActive: false });
    expect((await prisma.stay.findFirstOrThrow()).daysRemaining).toBe(13);
    await advanceClockTo(SYSTEM_ACTOR, "2026-12-10");
    expect((await penalty(p.id)).status).toBe("STAYED"); // never went overdue
    await liftStay(actor("u-registrar", "REGISTRAR"), p.id, { orderRef: "WP(C) 1234/2026 (vacated)", documentName: "vacate.pdf" });
    expect(await penalty(p.id)).toMatchObject({ status: "RAISED", qrActive: true, dueOn: "2026-12-23" });
  });

  it("during instalments: the line goes on hold, deductions stop, no escalation, then resumes", async () => {
    const [p] = await onTicket([{ officerId: "u-dps-two", amount: 7000, level: "SAA" }, { officerId: "u-dps-two", amount: 6000, level: "SAA" }]);
    await recordStay(ddo, p.id, court);
    const line = await lineOf(p.id);
    expect(line.status).toBe("ON_HOLD");
    expect(await prisma.task.count({ where: { penaltyId: p.id, kind: "STOP_DEDUCTION" } })).toBe(1);
    await expect(recordDeduction(nodal, { lineId: line.id, payrollRef: "", salaryMonth: "2026-12", amount: 1000, voucherNo: "TV-X", proofFile: "x.pdf" })).rejects.toThrow(/on hold/);
    await liftStay(ddo, p.id, { orderRef: "Vacated", documentName: "vacate.pdf" });
    expect(await penalty(p.id)).toMatchObject({ status: "IN_RECOVERY" });
    expect((await lineOf(p.id)).status).toBe("ACTIVE");
  });
});

describe("reduction and set-aside (E6)", () => {
  it("lets the imposing authority reduce, but not another officer", async () => {
    const [p] = await impose([{ officerId: "u-dps-kmm", amount: 4000 }]);
    await expect(adjustPenalty(actor("u-faa-jrt", "FAA"), p.id, { ...court, kind: "REDUCED", newAmount: 2500 })).rejects.toThrow(/imposing authority or a higher authority/);
    await adjustPenalty(actor("u-faa-kmm", "FAA"), p.id, { ...court, authority: "HIGHER_AUTHORITY", kind: "REDUCED", newAmount: 2500 });
    expect(await penalty(p.id)).toMatchObject({ status: "RAISED", amount: 2500, originalAmount: 4000 });
  });

  it("refunds what was deducted when the penalty is set aside", async () => {
    const [p] = await onTicket([{ officerId: "u-dps-kmm", amount: 4000 }]);
    await recordDeduction(nodal, { lineId: (await lineOf(p.id)).id, payrollRef: "", salaryMonth: "2026-12", amount: 1500, voucherNo: "TV-S", proofFile: "s.pdf" });
    await adjustPenalty(ddo, p.id, { ...court, kind: "SET_ASIDE", newAmount: 0 });
    expect(await penalty(p.id)).toMatchObject({ status: "REFUND_DUE", amount: 0 });
    expect((await lineOf(p.id)).status).toBe("REMOVED");
    const r = await prisma.refund.findFirstOrThrow({ where: { penaltyId: p.id } });
    expect(r).toMatchObject({ reason: "SET_ASIDE", amount: 1500 });
    await recordRefund(nodal, r.id, "RF-SA-1");
    expect((await penalty(p.id)).status).toBe("SET_ASIDE");
  });
});

describe("the exceptions queue (E8, E10, E11, E16)", () => {
  it("E8: records recovery through the paying authority by hand", async () => {
    const [p] = await onTicket([{ officerId: "u-dps-dep", amount: 1500 }]);
    const e = await prisma.exceptionCase.findFirstOrThrow({ where: { penaltyId: p.id } });
    const input = { letterRef: "AITEC/RTPS/2026/41", letterOn: "2026-12-05", replyRef: "PSU/FIN/2026/88", replyOn: "2026-12-12", proofFile: "psu-recovery.pdf", voucherNo: "TV-PSU-1", amount: 1500 };
    await expect(recordManualRecovery(ddo, e.id, { ...input, amount: 1000 })).rejects.toThrow(/outstanding/);
    await expect(recordManualRecovery(ddo, e.id, { ...input, replyRef: "" })).rejects.toThrow(/reply/);
    await recordManualRecovery(ddo, e.id, input);
    expect((await penalty(p.id)).status).toBe("RECOVERED");
    expect((await prisma.exceptionCase.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("RESOLVED");
    expect(await prisma.deduction.findFirstOrThrow({ where: { penaltyId: p.id } })).toMatchObject({ kind: "MANUAL", verification: "VERIFIED" });
  });

  it("E10: an officer who dies during recovery goes to the exceptions queue", async () => {
    const [p] = await onTicket([{ officerId: "u-dps-kmm", amount: 2000 }]);
    const rec = await prisma.staffRecord.findUniqueOrThrow({ where: { employeeId: "EMP-000101" } });
    await expect(updateStaffRecord(ddo, "EMP-000101", { ...rec, retirementOn: rec.retirementOn ?? "", status: "DECEASED" })).rejects.toThrow(/administrator/);
    await updateStaffRecord(admin, "EMP-000101", { ...rec, retirementOn: rec.retirementOn ?? "", status: "DECEASED" });
    await advanceClockBy(SYSTEM_ACTOR, 1);
    expect((await penalty(p.id)).status).toBe("EXCEPTION");
    expect(await prisma.exceptionCase.findFirstOrThrow({ where: { penaltyId: p.id } })).toMatchObject({ kind: "DECEASED" });
    expect((await lineOf(p.id)).status).toBe("REMOVED");
  });

  it("E11: a suspended officer's recovery resumes only on a recorded decision, and stays on the ticket", async () => {
    const [p] = await onTicket([{ officerId: "u-dps-sus", amount: 2000 }]);
    const e = await prisma.exceptionCase.findFirstOrThrow({ where: { penaltyId: p.id } });
    expect(e.kind).toBe("SUSPENDED");
    await resumeException(ddo, e.id, { note: "Personnel Department order 12/2026: recover from subsistence allowance" });
    expect((await penalty(p.id)).status).toBe("IN_RECOVERY");
    await advanceClockBy(SYSTEM_ACTOR, 1);
    expect((await penalty(p.id)).status).toBe("IN_RECOVERY");
  });

  it("E16: a wrong employee ID is held until the Sewa Setu DDO corrects it", async () => {
    const [p] = await impose([{ officerId: "u-dps-jrt", amount: 2000 }]);
    await prisma.penalty.update({ where: { id: p.id }, data: { employeeId: "EMP-000999" } });
    await advanceClockTo(SYSTEM_ACTOR, "2026-12-04");
    await confirmUnpaid(ddo, p.id);
    const e = await prisma.exceptionCase.findFirstOrThrow({ where: { penaltyId: p.id } });
    expect(e.kind).toBe("STAFF_RECORD_MISMATCH");
    await expect(resumeException(ddo, e.id, { note: "Corrected", correctEmployeeId: "EMP-123456" })).rejects.toThrow(/not in the staff records/);
    await resumeException(ddo, e.id, { note: "Corrected from the service book", correctEmployeeId: "EMP-000201" });
    expect(await penalty(p.id)).toMatchObject({ status: "IN_RECOVERY", employeeId: "EMP-000201" });
  });

  it("E7: a transfer changes nothing; recovery follows the employee ID", async () => {
    const [p] = await onTicket([{ officerId: "u-dps-kmm", amount: 2000 }]);
    const rec = await prisma.staffRecord.findUniqueOrThrow({ where: { employeeId: "EMP-000101" } });
    await updateStaffRecord(admin, "EMP-000101", { ...rec, retirementOn: rec.retirementOn ?? "", designation: "Circle Officer, Titabar Revenue Circle", office: "Titabar Revenue Circle Office (Demo)" });
    await advanceClockBy(SYSTEM_ACTOR, 1);
    expect((await penalty(p.id)).status).toBe("IN_RECOVERY");
    expect((await prisma.ticket.findFirstOrThrow()).employeeId).toBe("EMP-000101");
  });
});

describe("retirement and write-off (E9, E18)", () => {
  it("puts a retiring officer first, sends the case to exceptions after retirement, and writes off with approval", async () => {
    const [p] = await onTicket([{ officerId: "u-dps-ret", amount: 3000 }]);
    expect((await prisma.ticket.findFirstOrThrow()).priority).toBe("RETIREMENT");
    await advanceClockTo(SYSTEM_ACTOR, "2027-01-01");
    expect((await penalty(p.id)).status).toBe("EXCEPTION");
    expect(await prisma.exceptionCase.findFirstOrThrow({ where: { penaltyId: p.id } })).toMatchObject({ kind: "RETIRED_NO_PENSION" });
    await expect(requestWriteOff(ddo, p.id, "short")).rejects.toThrow(/reason/);
    await requestWriteOff(ddo, p.id, "Retired on 31 Dec 2026; recovery from pension is not permitted under the current setting.");
    const w = await prisma.writeOff.findFirstOrThrow({ where: { penaltyId: p.id } });
    await expect(decideWriteOff(actor("u-ca-ias", "COMPETENT_AUTHORITY"), w.id, true, "")).rejects.toThrow(/Competent Authority/);
    await decideWriteOff(actor("u-ca-pers", "COMPETENT_AUTHORITY"), w.id, true, "Approved");
    expect(await penalty(p.id)).toMatchObject({ status: "WRITTEN_OFF" });
    expect(await prisma.writeOff.findUniqueOrThrow({ where: { id: w.id } })).toMatchObject({ status: "APPROVED", amount: 3000, esignRef: expect.stringMatching(/^ESIGN-/) });
  });

  it("continues against pension when that setting is on", async () => {
    await prisma.setting.update({ where: { key: "pensionRecovery" }, data: { value: "true" } });
    const [p] = await onTicket([{ officerId: "u-dps-ret", amount: 3000 }]);
    await advanceClockTo(SYSTEM_ACTOR, "2027-01-02");
    expect((await penalty(p.id)).status).toBe("IN_RECOVERY");
    await recordDeduction(nodal, { lineId: (await lineOf(p.id)).id, payrollRef: "", salaryMonth: "2027-01", amount: 3000, voucherNo: "TV-PEN", proofFile: "pension.pdf" });
    expect((await prisma.deduction.findFirstOrThrow({ where: { penaltyId: p.id } })).kind).toBe("PENSION");
  });
});

describe("payment with an unknown reference", () => {
  it("goes to the exceptions queue and is resolved by hand", async () => {
    await expect(simulateUnmatchedPayment(ddo, "PEN-2026-999999", 1000)).rejects.toThrow(/administrator/);
    const grn = await simulateUnmatchedPayment(admin, "PEN-2026-999999", 1000);
    await advanceClockBy(SYSTEM_ACTOR, 1);
    const e = await prisma.exceptionCase.findFirstOrThrow({ where: { grn } });
    expect(e.kind).toBe("UNMATCHED_PAYMENT");
    await closeUnmatchedPayment(ddo, e.id, "Refunded to the payer through eGRAS");
    expect((await prisma.exceptionCase.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("RESOLVED");
  });
});
