// Penalty module, step P1: a penalty from a signed order, deemed service, copies, QR and challan payments, GRN settlement.
import { beforeEach, describe, expect, it } from "vitest";
import { canViewPenalty } from "@/domain/penalty";
import { SYSTEM_ACTOR } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { advanceClockBy, advanceClockTo } from "@/scheduler";
import { seedBaseline } from "@/seed";
import { fileAppeal } from "@/services/appeals";
import { saveOrderDraft, signOrder } from "@/services/orders";
import { forceGrnFailure, payPenalty } from "@/services/penalties";

const rina = { id: "u-cit-1", name: "Rina", role: "CITIZEN" };
const faa = { id: "u-faa-kmm", name: "Pranab Hazarika (Demo)", role: "FAA" };
const dps = { id: "u-dps-kmm", name: "Anjali Baruah (Demo)", role: "DPS", employeeId: "EMP-000101" };

/** Rina's certificate breaches; she files; the FAA imposes Rs. 2,000 on the DPS on Tue 3 Nov. */
async function imposeOnDps(amount = 2000) {
  await advanceClockBy(SYSTEM_ACTOR, 1);
  const app = await prisma.application.findFirstOrThrow({ where: { citizenId: rina.id, serviceCode: "PRC" } });
  const appeal = await fileAppeal(rina, { applicationId: app.id });
  const order = await saveOrderDraft(faa, appeal.id, {
    templateCode: "ALLOW_DELIVER", findings: "Not delivered within the time limit.", reasons: "No reason was shown for the delay of the certificate.",
    directionDays: 7, penalties: [{ officerId: dps.id, capacity: "DPS", amount }],
  });
  await signOrder(faa, order.id);
  return prisma.penalty.findFirstOrThrow({ where: { orderId: order.id } });
}

beforeEach(async () => {
  await seedBaseline(prisma);
});

describe("imposing a penalty", () => {
  it("records deemed service, the last date, a snapshot of the officer and sends every copy", async () => {
    const p = await imposeOnDps();
    expect(p).toMatchObject({
      ref: expect.stringMatching(/^PEN-2026-\d{6}$/), status: "RAISED", amount: 2000, employeeId: "EMP-000101", capacity: "DPS", imposedByLevel: "FAA",
      imposedById: faa.id, competentAuthorityId: "u-ca-pers", orderDate: "2026-11-03", dashboardPostedOn: "2026-11-03", messageSentOn: "2026-11-03",
      serviceDate: "2026-11-03", dueOn: "2026-12-03", qrActive: true, appealNo: expect.stringMatching(/-FAA$/),
    });
    expect(p.dashboardPostedAt).toBeTruthy();
    expect(p.messageSentAt).toBeTruthy();
    const to = await prisma.notification.findMany({ where: { entityType: "penalty", entityId: p.id } });
    const recipients = new Set(to.map((n) => n.recipientId));
    for (const id of [dps.id, "u-hoo-kmm", "u-ca-pers", "u-ss-ddo", "u-fin-nodal"]) expect(recipients).toContain(id);
    expect(to.filter((n) => n.recipientId === dps.id).map((n) => n.channel)).toEqual(expect.arrayContaining(["DASHBOARD", "SMS", "EMAIL"]));
  });

  it("sends the Finance copy to the backup while the primary is on leave", async () => {
    await prisma.user.update({ where: { id: "u-fin-nodal" }, data: { onLeave: true } });
    const p = await imposeOnDps();
    const finance = await prisma.notification.findMany({ where: { entityId: p.id, recipientId: { in: ["u-fin-nodal", "u-fin-backup"] } } });
    expect(new Set(finance.map((n) => n.recipientId))).toEqual(new Set(["u-fin-backup"]));
  });
});

describe("paying through eGRAS", () => {
  it("matches a QR payment after the settlement lag and closes the penalty", async () => {
    const p = await imposeOnDps();
    await expect(payPenalty(dps, p.ref, { amount: 1500, channel: "QR" })).rejects.toThrow(/exact amount/);
    await expect(payPenalty({ ...dps, id: "u-dps-jrt", employeeId: "EMP-000201" }, p.ref, { amount: 2000, channel: "QR" })).rejects.toThrow(/Only the officer/);
    const { grn, settlesOn } = await payPenalty(dps, p.ref, { amount: 2000, channel: "QR" });
    expect(settlesOn).toBe("2026-11-04");
    await expect(payPenalty(dps, p.ref, { amount: 2000, channel: "QR" })).rejects.toThrow(/already being confirmed/);
    expect((await prisma.penalty.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("RAISED");
    await advanceClockBy(SYSTEM_ACTOR, 1);
    expect(await prisma.paymentGRN.findUniqueOrThrow({ where: { grn } })).toMatchObject({ status: "SUCCESS", penaltyId: p.id });
    expect(await prisma.penalty.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ status: "CLOSED", qrActive: false, closedOn: "2026-11-04" });
    expect(await prisma.ticket.count()).toBe(0);
    expect((await prisma.auditEvent.findMany({ where: { entityId: p.id, action: { in: ["penalty.settlePaid", "penalty.close"] } } })).map((e) => e.afterStatus)).toEqual(["PAID_EGRAS", "CLOSED"]);
  });

  it("keeps the balance due after a short challan, and lets a failed receipt be paid again", async () => {
    const p = await imposeOnDps();
    await payPenalty(dps, p.ref, { amount: 500, channel: "CHALLAN" });
    await advanceClockBy(SYSTEM_ACTOR, 1); // pending money does not count until it settles
    expect((await prisma.penalty.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("RAISED");
    const { grn } = await payPenalty(dps, p.ref, { amount: 1500, channel: "QR" });
    await forceGrnFailure(dps, grn);
    await advanceClockBy(SYSTEM_ACTOR, 1);
    expect(await prisma.penalty.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ status: "RAISED", qrActive: true });
    expect((await prisma.paymentGRN.findUniqueOrThrow({ where: { grn } })).status).toBe("FAILED");
    await payPenalty(dps, p.ref, { amount: 1500, channel: "QR" });
    await advanceClockBy(SYSTEM_ACTOR, 1);
    expect((await prisma.penalty.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("CLOSED");
  });

  it("flags an excess challan payment for refund", async () => {
    const p = await imposeOnDps();
    await payPenalty(dps, p.ref, { amount: 2500, channel: "CHALLAN" });
    await advanceClockBy(SYSTEM_ACTOR, 1);
    expect((await prisma.penalty.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("REFUND_DUE");
    expect(await prisma.refund.findFirstOrThrow({ where: { penaltyId: p.id } })).toMatchObject({ amount: 500, reason: "EXCESS_PAYMENT", status: "DUE", assigneeId: "u-fin-nodal" });
  });
});

describe("reminders and visibility", () => {
  it("reminds the officer on day 20 and day 27", async () => {
    const p = await imposeOnDps();
    await advanceClockTo(SYSTEM_ACTOR, "2026-11-30");
    const reminders = await prisma.notification.findMany({ where: { entityId: p.id, recipientId: dps.id, channel: "SMS", text: { startsWith: "Reminder" } } });
    expect(reminders.map((r) => r.sentOn)).toEqual(["2026-11-23", "2026-11-30"]);
  });

  it("is visible to the officer and oversight roles but not to another officer", async () => {
    const p = await imposeOnDps();
    expect(canViewPenalty({ id: dps.id, role: "DPS", employeeId: "EMP-000101" }, p)).toBe(true);
    expect(canViewPenalty({ id: "u-dps-jrt", role: "DPS", employeeId: "EMP-000201" }, p)).toBe(false);
    expect(canViewPenalty({ id: "u-ca-pers", role: "COMPETENT_AUTHORITY", employeeId: null }, p)).toBe(true);
  });
});
