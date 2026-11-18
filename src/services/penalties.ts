// Penalty use-cases (PLAN.md Part 2): imposing a penalty with deemed service, paying through eGRAS (QR or challan),
// GRN settlement and matching, reminders, and the proof of service. Recovery from salary follows in later steps.

import type { Penalty, Prisma, Ticket } from "@prisma/client";
import { egras } from "@/adapters";
import { staffRecords } from "@/adapters/staff-records";
import { addWorkingDays, type Calendar } from "@/domain/calendar";
import { replan, type Instalment } from "@/domain/recovery";
import { formatDate } from "@/domain/dates";
import { deemedServiceDate, isReminderDay, penaltyAmounts, penaltyDueDate, type Money } from "@/domain/penalty";
import { decidePenalty, FINAL, penaltyMachine, type PenaltyCtx, type PenaltyEvent, type PenaltyStatus } from "@/domain/penalty-machine";
import type { Settings } from "@/domain/settings";
import { audit, SYSTEM_ACTOR, type Actor } from "@/lib/audit";
import { getRuleContext, type RuleContext } from "@/lib/context";
import { type Db, nextSeq, parseJson, prisma } from "@/lib/db";
import { notifyAddress, notifyMany, notifyUser } from "@/lib/notify";
import { rupees } from "@/lib/view";
import { DomainError } from "./errors";
import { check } from "./transition";

export const LEVEL_AUTHORITY: Record<string, string> = { FAA: "First Appellate Authority", SAA: "Second Appellate Authority", TAA: "RTPS Commission" };

// ---------- Helpers ----------

/** Money collected and returned on a penalty, from its receipts, deductions, refunds and write-offs. */
export async function moneyOf(db: Db, penaltyId: string): Promise<Money> {
  const [grns, deductions, refunds, writeOffs] = await Promise.all([
    db.paymentGRN.findMany({ where: { penaltyId, status: "SUCCESS" } }),
    db.deduction.findMany({ where: { penaltyId, verification: { not: "RETURNED" } } }),
    db.refund.findMany({ where: { penaltyId, status: "REFUNDED" } }),
    db.writeOff.findMany({ where: { penaltyId, status: "APPROVED" } }),
  ]);
  const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
  return { egras: sum(grns), deducted: sum(deductions), refunded: sum(refunds), writtenOff: sum(writeOffs) };
}

export async function amountsOf(db: Db, p: Pick<Penalty, "id" | "amount">) {
  const m = await moneyOf(db, p.id);
  return { ...m, ...penaltyAmounts(p.amount, m) };
}

/** The Finance nodal officer who receives work now: the primary, or the backup while the primary is on leave (P-A12). */
export async function activeNodal(db: Db) {
  const nodal = await db.user.findMany({ where: { role: "FINANCE_NODAL" } });
  const primary = nodal.find((u) => !u.isBackup);
  const backup = nodal.find((u) => u.isBackup);
  if (primary && !primary.onLeave) return { officer: primary, bothOnLeave: false };
  if (backup && !backup.onLeave) return { officer: backup, bothOnLeave: false };
  return { officer: primary ?? backup ?? null, bothOnLeave: true };
}

async function roleUserIds(db: Db, role: string) {
  return (await db.user.findMany({ where: { role }, select: { id: true } })).map((u) => u.id);
}

/** A system-driven status change: checked against the machine, written and audited. Returns the new status, or null if not allowed. */
export async function systemMove(db: Db, p: Pick<Penalty, "id" | "status" | "uin" | "ref">, event: PenaltyEvent, ctx: PenaltyCtx, today: string, data: Prisma.PenaltyUpdateInput = {}, details: Record<string, unknown> = {}) {
  const d = decidePenalty(p.status as PenaltyStatus, event, "SYSTEM", ctx);
  if (!d.ok) return null;
  await db.penalty.update({ where: { id: p.id }, data: { ...data, status: d.to } });
  await audit(db, today, { actor: SYSTEM_ACTOR, action: `penalty.${event}`, entityType: "penalty", entityId: p.id, caseRef: p.uin, before: p.status, after: d.to, details: { ref: p.ref, ...details } });
  return d.to;
}

/** A user's status change: refused attempts are audited and shown to the user in plain words. */
export async function userMove(actor: Actor, p: Pick<Penalty, "id" | "status" | "uin">, event: PenaltyEvent, ctx: PenaltyCtx, today: string) {
  return check(penaltyMachine, { id: p.id, status: p.status, caseRef: p.uin }, event, actor, { ...ctx, role: actor.role }, today);
}

// ---------- Imposing a penalty (step 1) ----------

export type ImposeInput = {
  order: { id: string; orderNo: string };
  appeal: { id: string; appealNo: string; level: string };
  app: { uin: string | null };
  line: { officerId: string; capacity: string; amount: number };
  delayDays: number;
  imposedById: string;
};

/**
 * Creates the penalty from a final order: snapshot of the officer from staff records, posting on the dashboard,
 * SMS and email (deemed service, both moments recorded), last date, and copies to everyone who must have one.
 */
export async function imposePenalty(db: Db, input: ImposeInput, today: string, s: Settings, cal: Calendar) {
  const officer = await db.user.findUniqueOrThrow({ where: { id: input.line.officerId }, include: { office: true } });
  const employeeId = officer.employeeId ?? `NOT-FOUND-${officer.id}`;
  const staff = officer.employeeId ? await staffRecords.find(db, officer.employeeId) : null;
  const ref = `PEN-${today.slice(0, 4)}-${String(await nextSeq(db, `penalty:${today.slice(0, 4)}`)).padStart(6, "0")}`;
  const authority = LEVEL_AUTHORITY[input.appeal.level];
  const postedAt = new Date().toISOString();

  // Posted on the dashboard first; the SMS and email follow at once (the mock gateway never fails).
  const penalty = await db.penalty.create({
    data: {
      ref, orderId: input.order.id, appealId: input.appeal.id, officerId: officer.id, employeeId,
      officerName: staff?.name ?? officer.name, designation: staff?.designation ?? officer.designation ?? "", office: staff?.office ?? officer.office?.name ?? "",
      capacity: input.line.capacity, imposedByLevel: input.appeal.level, imposedById: input.imposedById, competentAuthorityId: staff?.competentAuthorityId ?? null,
      uin: input.app.uin ?? "", appealNo: input.appeal.appealNo, originalAmount: input.line.amount, amount: input.line.amount, orderDate: today,
      dashboardPostedOn: today, dashboardPostedAt: postedAt, serviceDate: today, dueOn: today, status: "RAISED", headOfAccount: s.headOfAccount,
      delayDaysAttributed: input.delayDays,
    },
  });
  const notice =
    `A penalty of ${rupees(input.line.amount)} has been imposed on you by the ${authority} (order ${input.order.orderNo}, UIN ${input.app.uin}, appeal ${input.appeal.appealNo}). ` +
    `Please pay it through eGRAS using the QR code on your Sewa Setu dashboard (reference ${ref}). If it is not paid in time, it will be recovered from your salary.`;
  await notifyUser(db, today, officer.id, notice, { channels: ["DASHBOARD"], entityType: "penalty", entityId: penalty.id, caseRef: input.app.uin });
  await notifyUser(db, today, officer.id, notice, { channels: ["SMS", "EMAIL"], entityType: "penalty", entityId: penalty.id, caseRef: input.app.uin });
  const sentAt = new Date().toISOString();
  const serviceDate = deemedServiceDate(today, today)!;
  const dueOn = penaltyDueDate(serviceDate, s, cal);
  await db.penalty.update({ where: { id: penalty.id }, data: { messageSentOn: today, messageSentAt: sentAt, serviceDate, dueOn } });
  await audit(db, today, {
    actor: SYSTEM_ACTOR, action: "penalty.raise", entityType: "penalty", entityId: penalty.id, caseRef: input.app.uin, after: "RAISED",
    details: { ref, amount: input.line.amount, serviceDate, dueOn, dashboardPostedAt: postedAt, messageSentAt: sentAt, employeeId, staffRecordFound: !!staff },
  });
  await notifyUser(db, today, officer.id, `Last date to pay penalty ${ref}: ${formatDate(dueOn, true)}.`, { channels: ["DASHBOARD"], entityType: "penalty", entityId: penalty.id, caseRef: input.app.uin });

  // Copies of the order (step 1): the public authority, the Competent Authority, the Sewa Setu DDO and the Finance nodal officer.
  const copy = `Copy for information: order ${input.order.orderNo} of the ${authority} imposes a penalty of ${rupees(input.line.amount)} on ${penalty.officerName}, ${penalty.designation} (employee ID ${employeeId}), UIN ${input.app.uin}, penalty reference ${ref}. Last date to pay: ${formatDate(dueOn)}.`;
  const opts = { channels: ["DASHBOARD", "EMAIL"] as ("DASHBOARD" | "EMAIL")[], entityType: "penalty", entityId: penalty.id, caseRef: input.app.uin };
  const hoo = officer.office?.headOfOfficeId;
  if (hoo) await notifyUser(db, today, hoo, copy, opts);
  else await notifyAddress(db, today, `${officer.office?.name ?? penalty.office} (public authority)`, `office.${(officer.officeId ?? "unknown").toLowerCase()}@sewasetu-demo.example`, copy, opts);
  const nodal = await activeNodal(db);
  await notifyMany(db, today, [staff?.competentAuthorityId, ...(await roleUserIds(db, "SEWA_SETU_DDO")), nodal.officer?.id], copy, opts);
  return { ...penalty, serviceDate, dueOn };
}

// ---------- Paying through eGRAS (step 2) ----------

/** Pays through the mock eGRAS: by QR (exact amount, while the QR is active) or by challan quoting the reference (any amount). */
export async function payPenalty(actor: Actor & { employeeId?: string | null }, ref: string, input: { amount: number; channel: "QR" | "CHALLAN" }) {
  const { today, settings: s, cal } = await getRuleContext();
  const p = await prisma.penalty.findUnique({ where: { ref }, include: { grns: true } });
  if (!p) throw new DomainError("No penalty has this reference.");
  if (!actor.employeeId || actor.employeeId !== p.employeeId) throw new DomainError("Only the officer on whom the penalty was imposed can pay it here.");
  if (FINAL.includes(p.status as PenaltyStatus)) throw new DomainError("This penalty is already closed.");
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new DomainError("Enter the amount in whole rupees.");
  const a = await amountsOf(prisma, p);
  if (input.channel === "QR") {
    if (!p.qrActive) throw new DomainError("The QR code is switched off for this penalty. You can still pay by an eGRAS challan quoting the reference.");
    if (p.grns.some((g) => g.status === "PENDING" && g.channel === "QR")) throw new DomainError("A payment by QR is already being confirmed. Please wait for it to settle.");
    if (input.amount !== a.outstanding) throw new DomainError(`The QR code is for the exact amount due: ${rupees(a.outstanding)}.`);
  }
  const grn = egras.newGrn(p.ref, await nextSeq(prisma, "grn"));
  const settlesOn = addWorkingDays(today, s.egrasSettlementLagDays, cal);
  await prisma.$transaction(async (tx) => {
    await tx.paymentGRN.create({ data: { grn, scannedRef: p.ref, penaltyId: p.id, amount: input.amount, channel: input.channel, paidOn: today, paidAt: new Date().toISOString(), settlesOn, status: "PENDING" } });
    await audit(tx, today, { actor, action: "penalty.payment", entityType: "penalty", entityId: p.id, caseRef: p.uin, details: { ref: p.ref, grn, amount: input.amount, channel: input.channel, settlesOn } });
    await notifyUser(tx, today, p.officerId,
      `eGRAS has received your payment of ${rupees(input.amount)} for penalty ${p.ref} (receipt ${grn}). It will be confirmed by ${formatDate(settlesOn)}.`,
      { entityType: "penalty", entityId: p.id, caseRef: p.uin });
  });
  return { grn, settlesOn };
}

/** Demo control: make a pending receipt fail when it settles. */
export async function forceGrnFailure(actor: Actor, grn: string) {
  const { today } = await getRuleContext();
  const g = await prisma.paymentGRN.findUnique({ where: { grn } });
  if (!g || g.status !== "PENDING") throw new DomainError("Only a pending receipt can be set to fail.");
  await prisma.paymentGRN.update({ where: { grn }, data: { forceFail: true } });
  await audit(prisma, today, { actor, action: "penalty.demoForceFail", entityType: "penalty", entityId: g.penaltyId ?? grn, details: { grn } });
}

/**
 * After money moves, decide where the penalty stands (PLAN.md §P4 `settle`):
 * - more collected than due → REFUND_DUE (double recovery when paid and also deducted, E3; excess payment, E4);
 * - fully paid through eGRAS → PAID_EGRAS → CLOSED; any ticket line is removed and Finance told to stop (E2);
 * - a short payment leaves the balance due, and the ticket is re-planned for the balance only (E4).
 */
export async function settle(db: Db, penaltyId: string, today: string) {
  const p = await db.penalty.findUniqueOrThrow({ where: { id: penaltyId } });
  const a = await amountsOf(db, p);
  const { settings: s, cal } = await getRuleContext(db);
  if (a.excess > 0) {
    const double = a.egras > 0 && a.deducted > 0;
    const to = await systemMove(db, p, "refundDue", { excess: a.excess }, today, { qrActive: false, doubleRecovery: double }, { excess: a.excess, doubleRecovery: double });
    if (to) {
      await stopRecovery(db, p, today, double ? "Paid through eGRAS as well as deducted: double recovery" : "Paid in full through eGRAS", s, cal);
      const nodal = await activeNodal(db);
      await db.refund.create({ data: { penaltyId: p.id, reason: double ? "DOUBLE_RECOVERY" : "EXCESS_PAYMENT", amount: a.excess, status: "DUE", assigneeId: nodal.officer?.id, createdOn: today } });
      await notifyUser(db, today, p.officerId, `More than the penalty amount has been collected on ${p.ref}${double ? " (paid through eGRAS and also deducted from salary)" : ""}. ${rupees(a.excess)} will be refunded to you.`, { entityType: "penalty", entityId: p.id, caseRef: p.uin });
      await notifyMany(db, today, [nodal.officer?.id], `Refund due: ${rupees(a.excess)} to ${p.officerName} on penalty ${p.ref}${double ? " (double recovery)" : ""}. Please make the refund and record its reference.`, { channels: ["DASHBOARD", "EMAIL"], entityType: "penalty", entityId: p.id, caseRef: p.uin });
    }
    return;
  }
  if (a.outstanding === 0) {
    const paid = await systemMove(db, p, "settlePaid", { outstanding: 0, excess: 0 }, today, { qrActive: false });
    if (!paid) return;
    await stopRecovery(db, p, today, "Paid through eGRAS", s, cal);
    await systemMove(db, { ...p, status: paid }, "close", { excess: 0 }, today, { closedOn: today }, { route: "eGRAS" });
    await notifyUser(db, today, p.officerId, `Thank you. Penalty ${p.ref} (UIN ${p.uin}) has been paid in full through eGRAS and is now closed.`, { entityType: "penalty", entityId: p.id, caseRef: p.uin });
    return;
  }
  if (a.egras > 0) {
    for (const l of await db.ticketLine.findMany({ where: { penaltyId: p.id, status: { in: ["ACTIVE", "ON_HOLD"] } } })) await replanTicket(db, l.ticketId, today, s, cal);
    await notifyUser(db, today, p.officerId, `Payment received on penalty ${p.ref}. A balance of ${rupees(a.outstanding)} is still due.`, { channels: ["DASHBOARD", "SMS"], entityType: "penalty", entityId: p.id, caseRef: p.uin });
  }
}

/** Takes a penalty off its recovery ticket and tells the nodal officer to stop deducting (E2, E5, E6, E18). */
export async function stopRecovery(db: Db, p: Pick<Penalty, "id" | "ref" | "uin" | "officerName">, today: string, reason: string, s: Settings, cal: Calendar, lineStatus: "REMOVED" | "ON_HOLD" = "REMOVED") {
  const lines = await db.ticketLine.findMany({ where: { penaltyId: p.id, status: { in: lineStatus === "ON_HOLD" ? ["ACTIVE"] : ["ACTIVE", "ON_HOLD"] } }, include: { ticket: true } });
  for (const l of lines) {
    await db.ticketLine.update({ where: { id: l.id }, data: { status: lineStatus, note: reason } });
    await replanTicket(db, l.ticketId, today, s, cal);
    await closeTicketIfDone(db, l.ticket, today);
    await db.task.create({ data: { kind: "STOP_DEDUCTION", assigneeId: l.ticket.assigneeId, penaltyId: p.id, ticketId: l.ticketId, status: "OPEN", createdOn: today, text: `Stop deducting penalty ${p.ref} (${p.officerName}, UIN ${p.uin}) on ticket ${l.ticket.ticketNo}: ${reason}.` } });
    await notifyMany(db, today, [l.ticket.assigneeId], `Please stop the salary deduction for penalty ${p.ref} (${p.officerName}) on ticket ${l.ticket.ticketNo}: ${reason}.`, { channels: ["DASHBOARD", "EMAIL"], entityType: "penalty", entityId: p.id, caseRef: p.uin });
    await audit(db, today, { actor: SYSTEM_ACTOR, action: lineStatus === "ON_HOLD" ? "penalty.lineOnHold" : "penalty.lineRemoved", entityType: "penalty", entityId: p.id, caseRef: p.uin, details: { ticketNo: l.ticket.ticketNo, reason } });
  }
  return lines.length;
}

/** What remains on a ticket's active lines, spread over the instalment plan (E12, E13). */
export async function replanTicket(db: Db, ticketId: string, today: string, s: Settings, cal: Calendar, carry = false): Promise<Instalment[]> {
  const t = await db.ticket.findUniqueOrThrow({ where: { id: ticketId }, include: { lines: { include: { penalty: true } } } });
  let remaining = 0;
  for (const l of t.lines) if (l.status === "ACTIVE") remaining += (await amountsOf(db, l.penalty)).outstanding;
  const deductions = await db.deduction.findMany({ where: { ticketLineId: { in: t.lines.map((l) => l.id) }, verification: { not: "RETURNED" } }, select: { salaryMonth: true } });
  const doneMonths = new Set(deductions.map((d) => d.salaryMonth));
  // After a missed month (carry), the plan keeps its remaining months rather than starting the instalments over.
  const plan = replan(parseJson<Instalment[]>(t.plan, []), remaining, deductions.length > 0 || carry, today, s, cal, doneMonths);
  await db.ticket.update({ where: { id: t.id }, data: { plan: JSON.stringify(plan) } });
  return plan;
}

export async function closeTicketIfDone(db: Db, ticket: Pick<Ticket, "id" | "ticketNo">, today: string) {
  const open = await db.ticketLine.count({ where: { ticketId: ticket.id, status: { in: ["ACTIVE", "ON_HOLD"] } } });
  if (open > 0) return;
  await db.ticket.update({ where: { id: ticket.id }, data: { status: "CLOSED", closedOn: today, plan: "[]" } });
  await audit(db, today, { actor: SYSTEM_ACTOR, action: "ticket.close", entityType: "ticket", entityId: ticket.id, details: { ticketNo: ticket.ticketNo } });
}

/** A settled payment whose reference matches no penalty goes to the Sewa Setu DDO's exceptions queue (P-A23). */
export async function openUnmatchedPaymentCase(db: Db, grn: string, today: string) {
  await db.exceptionCase.create({ data: { grn, kind: "UNMATCHED_PAYMENT", status: "OPEN", note: "eGRAS payment with an unknown reference", openedOn: today } });
  await notifyMany(db, today, await roleUserIds(db, "SEWA_SETU_DDO"), `eGRAS payment ${grn} quotes a reference that matches no penalty. It is in the exceptions queue.`, { channels: ["DASHBOARD"], entityType: "grn", entityId: grn });
}

// ---------- Scheduler jobs ----------

/** GRN settlement: pending receipts due today become SUCCESS (or FAILED if forced) and are matched to their penalty. */
export async function settleGrnsJob({ today }: RuleContext): Promise<number> {
  const due = await prisma.paymentGRN.findMany({ where: { status: "PENDING", settlesOn: { lte: today } }, include: { penalty: true } });
  for (const g of due) {
    const status = g.forceFail ? "FAILED" : "SUCCESS";
    await prisma.$transaction(async (tx) => {
      await tx.paymentGRN.update({ where: { grn: g.grn }, data: { status, settledOn: today } });
      if (!g.penalty) {
        if (status === "SUCCESS") await openUnmatchedPaymentCase(tx, g.grn, today);
        return;
      }
      await audit(tx, today, { actor: SYSTEM_ACTOR, action: status === "SUCCESS" ? "penalty.grnSuccess" : "penalty.grnFailed", entityType: "penalty", entityId: g.penalty.id, caseRef: g.penalty.uin, details: { grn: g.grn, amount: g.amount } });
      if (status === "FAILED") {
        await notifyUser(tx, today, g.penalty.officerId, `Your eGRAS payment ${g.grn} for penalty ${g.penalty.ref} failed. No money was taken. Please pay again${g.penalty.qrActive ? ` by ${formatDate(g.penalty.dueOn)}` : ""}.`,
          { entityType: "penalty", entityId: g.penalty.id, caseRef: g.penalty.uin });
        return;
      }
      await notifyUser(tx, today, g.penalty.officerId, `eGRAS has confirmed your payment ${g.grn} of ${rupees(g.amount)} for penalty ${g.penalty.ref}.`, { channels: ["DASHBOARD"], entityType: "penalty", entityId: g.penalty.id, caseRef: g.penalty.uin });
      await settle(tx, g.penalty.id, today);
    });
  }
  return due.length;
}

/** Reminders to the officer on the set days after service, while anything is still due through eGRAS. */
export async function penaltyRemindersJob({ today, settings }: RuleContext): Promise<number> {
  const open = await prisma.penalty.findMany({ where: { status: "RAISED", qrActive: true } });
  let n = 0;
  for (const p of open) {
    const day = isReminderDay(p.serviceDate, today, settings.reminderDays);
    if (day === null) continue;
    const a = await amountsOf(prisma, p);
    if (a.outstanding === 0) continue;
    await notifyUser(prisma, today, p.officerId,
      `Reminder: penalty ${p.ref} of ${rupees(a.outstanding)} (UIN ${p.uin}) is due by ${formatDate(p.dueOn, true)}. Please pay with the QR code on your Sewa Setu dashboard, or it will be recovered from your salary.`,
      { entityType: "penalty", entityId: p.id, caseRef: p.uin });
    n++;
  }
  return n;
}

// ---------- Proof of service (E17) ----------

/** Records the first time the penalised officer opens the penalty. */
export async function recordFirstView(user: { id: string; name: string; role: string; employeeId: string | null }, p: Pick<Penalty, "id" | "employeeId" | "firstViewedOn" | "uin">) {
  if (p.firstViewedOn || !user.employeeId || user.employeeId !== p.employeeId) return;
  const today = (await getRuleContext()).today;
  await prisma.penalty.update({ where: { id: p.id }, data: { firstViewedOn: today, firstViewedAt: new Date().toISOString() } });
  await audit(prisma, today, { actor: { id: user.id, name: user.name, role: user.role }, action: "penalty.firstView", entityType: "penalty", entityId: p.id, caseRef: p.uin });
}

