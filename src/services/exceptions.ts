// Exception cases of the penalty module (PLAN.md Part 2, E5–E18): stays, reductions and set-asides with refunds,
// refunds, manual recovery through the paying authority, the exceptions queue, write-offs, changes in staff records
// (retirement, resignation, death, suspension, transfer) and payments with an unknown reference.

import { eSign, egras } from "@/adapters";
import { staffRecords } from "@/adapters/staff-records";
import { addWorkingDays, nextWorkingDayOnOrAfter } from "@/domain/calendar";
import { addDays, daysBetween, formatDate } from "@/domain/dates";
import { type PenaltyStatus } from "@/domain/penalty-machine";
import { EXCEPTION_LABELS, retiringSoon, routingProblem } from "@/domain/recovery";
import { audit, type Actor } from "@/lib/audit";
import { getRuleContext, type RuleContext } from "@/lib/context";
import { type Db, nextSeq, prisma } from "@/lib/db";
import { notifyMany, notifyUser } from "@/lib/notify";
import { rupees } from "@/lib/view";
import { DomainError } from "./errors";
import { activeNodal, amountsOf, replanTicket, settle, stopRecovery, systemMove, userMove } from "./penalties";
import { addToTicket } from "./recovery";

const ACTIVE_LINE = ["IN_RECOVERY", "PARTLY_DEDUCTED"];
async function ddoIds(db: Db) {
  return (await db.user.findMany({ where: { role: "SEWA_SETU_DDO" }, select: { id: true } })).map((u) => u.id);
}

export type OrderDocs = { authority: "HIGHER_AUTHORITY" | "COMMISSION" | "COURT"; orderRef: string; documentName: string };

// ---------- Stay (E5) ----------

export async function recordStay(actor: Actor, penaltyId: string, input: OrderDocs) {
  const { today, settings: s, cal } = await getRuleContext();
  const p = await prisma.penalty.findUniqueOrThrow({ where: { id: penaltyId } });
  const to = await userMove(actor, p, "stay", { orderRef: input.orderRef, documentName: input.documentName }, today);
  // Before confirmation the 30-day clock is frozen with the days still left; afterwards recovery simply pauses.
  const daysRemaining = ["RAISED", "OVERDUE"].includes(p.status) ? Math.max(0, daysBetween(today, p.dueOn)) : null;
  await prisma.$transaction(async (tx) => {
    await tx.penalty.update({ where: { id: p.id }, data: { status: to, priorStatus: p.status, qrActive: false } });
    await tx.stay.create({ data: { penaltyId: p.id, authority: input.authority, orderRef: input.orderRef.trim(), documentName: input.documentName.trim(), recordedById: actor.id, startOn: today, priorStatus: p.status, daysRemaining } });
    await audit(tx, today, { actor, action: "penalty.stay", entityType: "penalty", entityId: p.id, caseRef: p.uin, before: p.status, after: to, details: { ...input, daysRemaining } });
    await stopRecovery(tx, p, today, `stayed by order ${input.orderRef}`, s, cal, "ON_HOLD");
    await notifyMany(tx, today, [p.officerId, p.imposedById], `Penalty ${p.ref} (UIN ${p.uin}) has been stayed by order ${input.orderRef}. No payment or deduction will be taken while the stay lasts.`,
      { entityType: "penalty", entityId: p.id, caseRef: p.uin });
  });
}

export async function liftStay(actor: Actor, penaltyId: string, input: Omit<OrderDocs, "authority">) {
  const { today, settings: s, cal } = await getRuleContext();
  const p = await prisma.penalty.findUniqueOrThrow({ where: { id: penaltyId } });
  const stay = await prisma.stay.findFirst({ where: { penaltyId, liftedOn: null }, orderBy: { startOn: "desc" } });
  if (!stay) throw new DomainError("There is no stay in force on this penalty.");
  // A stay before confirmation resumes the 30-day clock with the days that were left.
  const restartsClock = stay.daysRemaining !== null;
  const back = (restartsClock ? "RAISED" : stay.priorStatus) as PenaltyStatus;
  const to = await userMove(actor, p, "liftStay", { orderRef: input.orderRef, documentName: input.documentName, priorStatus: back }, today);
  const dueOn = restartsClock ? nextWorkingDayOnOrAfter(addDays(today, stay.daysRemaining!), cal) : p.dueOn;
  await prisma.$transaction(async (tx) => {
    await tx.penalty.update({ where: { id: p.id }, data: { status: to, priorStatus: null, dueOn, qrActive: restartsClock } });
    await tx.stay.update({ where: { id: stay.id }, data: { liftedOn: today } });
    for (const l of await tx.ticketLine.findMany({ where: { penaltyId, status: "ON_HOLD" } })) {
      await tx.ticketLine.update({ where: { id: l.id }, data: { status: "ACTIVE", note: `Stay lifted ${formatDate(today)}` } });
      await replanTicket(tx, l.ticketId, today, s, cal);
      const t = await tx.ticket.findUniqueOrThrow({ where: { id: l.ticketId } });
      await notifyMany(tx, today, [t.assigneeId], `The stay on penalty ${p.ref} (${p.officerName}) has been lifted. Deductions on ticket ${t.ticketNo} may resume.`, { channels: ["DASHBOARD", "EMAIL"], entityType: "penalty", entityId: p.id, caseRef: p.uin });
    }
    await audit(tx, today, { actor, action: "penalty.liftStay", entityType: "penalty", entityId: p.id, caseRef: p.uin, before: p.status, after: to, details: { ...input, dueOn, daysRemaining: stay.daysRemaining } });
    await notifyUser(tx, today, p.officerId, restartsClock
      ? `The stay on penalty ${p.ref} has been lifted. The last date to pay through eGRAS is now ${formatDate(dueOn, true)}.`
      : `The stay on penalty ${p.ref} has been lifted. Recovery from your salary will resume.`,
      { entityType: "penalty", entityId: p.id, caseRef: p.uin });
  });
}

// ---------- Reduction and set-aside (E6) ----------

export type Adjustment = OrderDocs & { kind: "REDUCED" | "SET_ASIDE"; newAmount: number };

/** The imposing authority, or a higher appellate authority (SAA over an FAA order), may record a review. */
function isReviewingAuthority(actor: Actor, p: { imposedById: string; imposedByLevel: string }) {
  if (actor.id === p.imposedById) return true;
  return actor.role === "SAA" && p.imposedByLevel === "FAA";
}

export async function adjustPenalty(actor: Actor, penaltyId: string, input: Adjustment) {
  const { today, settings: s, cal } = await getRuleContext();
  const p = await prisma.penalty.findUniqueOrThrow({ where: { id: penaltyId } });
  const newAmount = input.kind === "SET_ASIDE" ? 0 : input.newAmount;
  const to = await userMove(actor, p, input.kind === "SET_ASIDE" ? "setAside" : "reduce",
    { orderRef: input.orderRef, documentName: input.documentName, newAmount, currentAmount: p.amount, isReviewingAuthority: isReviewingAuthority(actor, p) }, today);
  await prisma.$transaction(async (tx) => {
    await tx.penalty.update({ where: { id: p.id }, data: { status: to, amount: newAmount, priorStatus: p.status } });
    await tx.adjustment.create({ data: { penaltyId: p.id, kind: input.kind, fromAmount: p.amount, toAmount: newAmount, byAuthority: input.authority, orderRef: input.orderRef.trim(), documentName: input.documentName.trim(), recordedById: actor.id, recordedOn: today } });
    await audit(tx, today, { actor, action: input.kind === "SET_ASIDE" ? "penalty.setAside" : "penalty.reduce", entityType: "penalty", entityId: p.id, caseRef: p.uin, before: p.status, after: to, details: { from: p.amount, to: newAmount, ...input } });
    await notifyMany(tx, today, [p.officerId, p.imposedById],
      input.kind === "SET_ASIDE" ? `Penalty ${p.ref} (UIN ${p.uin}) has been set aside by order ${input.orderRef}.` : `Penalty ${p.ref} (UIN ${p.uin}) has been reduced from ${rupees(p.amount)} to ${rupees(newAmount)} by order ${input.orderRef}.`,
      { entityType: "penalty", entityId: p.id, caseRef: p.uin });

    const a = await amountsOf(tx, { id: p.id, amount: newAmount });
    if (a.excess > 0) {
      const due = await systemMove(tx, { ...p, status: to }, "refundDue", { excess: a.excess }, today, { qrActive: false }, { excess: a.excess });
      if (due) {
        await stopRecovery(tx, p, today, input.kind === "SET_ASIDE" ? "penalty set aside" : "penalty reduced below what was collected", s, cal);
        const nodal = await activeNodal(tx);
        await tx.refund.create({ data: { penaltyId: p.id, reason: input.kind, amount: a.excess, status: "DUE", assigneeId: nodal.officer?.id, createdOn: today } });
        await notifyMany(tx, today, [nodal.officer?.id, p.officerId], `Refund due: ${rupees(a.excess)} to ${p.officerName} on penalty ${p.ref}, already collected above the revised amount.`, { channels: ["DASHBOARD", "EMAIL"], entityType: "penalty", entityId: p.id, caseRef: p.uin });
      }
      return;
    }
    if (input.kind === "SET_ASIDE") {
      // Nothing collected: the penalty simply ends here.
      await tx.penalty.update({ where: { id: p.id }, data: { qrActive: false, closedOn: today } });
      await stopRecovery(tx, p, today, "penalty set aside", s, cal);
      return;
    }
    // Reduced: carry on from where it was, for the lower amount.
    const resumeTo = (a.outstanding === 0 ? (a.deducted > 0 ? "DEDUCTED" : "PAID_EGRAS") : p.status) as PenaltyStatus;
    await systemMove(tx, { ...p, status: to }, "resume", { nextStatus: resumeTo }, today, {}, { amount: newAmount });
    for (const l of await tx.ticketLine.findMany({ where: { penaltyId: p.id, status: "ACTIVE" } })) await replanTicket(tx, l.ticketId, today, s, cal);
    if (a.outstanding === 0) await settle(tx, p.id, today);
  });
}

// ---------- Refunds (E3, E4, E6) ----------

export async function recordRefund(actor: Actor, refundId: string, reference: string) {
  const { today } = await getRuleContext();
  const r = await prisma.refund.findUniqueOrThrow({ where: { id: refundId }, include: { penalty: true } });
  if (r.status !== "DUE") throw new DomainError("This refund has already been recorded.");
  const p = r.penalty;
  const to = await userMove(actor, p, "recordRefund", { reference }, today);
  await prisma.$transaction(async (tx) => {
    await tx.refund.update({ where: { id: r.id }, data: { status: "REFUNDED", reference: reference.trim(), refundedOn: today } });
    await tx.penalty.update({ where: { id: p.id }, data: { status: to } });
    await audit(tx, today, { actor, action: "penalty.recordRefund", entityType: "penalty", entityId: p.id, caseRef: p.uin, before: p.status, after: to, details: { refundId: r.id, amount: r.amount, reference, reason: r.reason } });
    await notifyUser(tx, today, p.officerId, `${rupees(r.amount)} has been refunded to you on penalty ${p.ref} (reference ${reference}).`, { entityType: "penalty", entityId: p.id, caseRef: p.uin });
    const a = await amountsOf(tx, p);
    const next: PenaltyStatus = p.amount === 0 ? "SET_ASIDE" : a.outstanding > 0 ? "IN_RECOVERY" : "CLOSED";
    await systemMove(tx, { ...p, status: to }, "afterRefund", { nextStatus: next }, today, next === "IN_RECOVERY" ? {} : { closedOn: today });
  });
}

// ---------- The exceptions queue (E8, E10, E11, E16) ----------

export type ManualRecovery = { letterRef: string; letterOn: string; replyRef: string; replyOn: string; proofFile: string; voucherNo: string; amount: number };

/** E8: recovered through the paying authority (deputation, local body, PSU, contractual) and recorded by hand. */
export async function recordManualRecovery(actor: Actor, exceptionId: string, input: ManualRecovery) {
  const { today, settings: s } = await getRuleContext();
  const e = await prisma.exceptionCase.findUniqueOrThrow({ where: { id: exceptionId }, include: { penalty: true } });
  if (!e.penalty || e.status !== "OPEN") throw new DomainError("This case is not open.");
  const p = e.penalty;
  const a = await amountsOf(prisma, p);
  const manualRecoveryError =
    input.letterRef.trim().length < 3 ? "Enter the reference of the letter to the paying authority." :
    input.replyRef.trim().length < 3 ? "Enter the reference of the paying authority's reply." :
    !input.proofFile.trim() ? "Attach the proof of recovery." :
    input.voucherNo.trim().length < 3 ? "Enter the treasury voucher crediting the head of account." :
    input.amount !== a.outstanding ? `The amount recovered must be the ${rupees(a.outstanding)} outstanding.` : null;
  const to = await userMove(actor, p, "recordManualRecovery", { manualRecoveryError }, today);
  await prisma.$transaction(async (tx) => {
    await tx.deduction.create({
      data: {
        penaltyId: p.id, kind: "MANUAL", payrollRef: input.replyRef.trim(), salaryMonth: today.slice(0, 7), amount: input.amount, voucherNo: input.voucherNo.trim(), proofFile: input.proofFile.trim(),
        recordedById: actor.id, recordedOn: today, verification: "VERIFIED", verifiedById: actor.id, verifiedOn: today,
      },
    });
    await tx.creditFeedEntry.create({ data: { voucherNo: input.voucherNo.trim(), amount: input.amount, headOfAccount: p.headOfAccount, expectedOn: addDays(today, s.treasuryCreditLagDays) } });
    await tx.exceptionCase.update({ where: { id: e.id }, data: { status: "RESOLVED", letterRef: input.letterRef, letterOn: input.letterOn || null, replyRef: input.replyRef, replyOn: input.replyOn || null, proofFile: input.proofFile, resolution: "Recovered through the paying authority", resolvedOn: today } });
    await tx.penalty.update({ where: { id: p.id }, data: { status: to } });
    await audit(tx, today, { actor, action: "penalty.recordManualRecovery", entityType: "penalty", entityId: p.id, caseRef: p.uin, before: p.status, after: to, details: input });
    await notifyUser(tx, today, p.officerId, `Penalty ${p.ref} (UIN ${p.uin}): ${rupees(input.amount)} has been recovered through your paying authority.`, { entityType: "penalty", entityId: p.id, caseRef: p.uin });
  });
}

/** E11 (open point) and E16: resume normal recovery once decided, or once the employee ID has been corrected. */
export async function resumeException(actor: Actor, exceptionId: string, input: { note: string; correctEmployeeId?: string }) {
  const { today, settings: s, cal } = await getRuleContext();
  const e = await prisma.exceptionCase.findUniqueOrThrow({ where: { id: exceptionId }, include: { penalty: true } });
  if (!e.penalty || e.status !== "OPEN") throw new DomainError("This case is not open.");
  let p = e.penalty;
  const to = await userMove(actor, p, "resolveAndResume", { reason: input.note }, today);
  const newId = input.correctEmployeeId?.trim();
  if (newId && !(await staffRecords.find(prisma, newId))) throw new DomainError(`Employee ID ${newId} is not in the staff records.`);
  await prisma.$transaction(async (tx) => {
    if (newId && newId !== p.employeeId) {
      await tx.penalty.update({ where: { id: p.id }, data: { employeeId: newId } });
      await tx.user.update({ where: { id: p.officerId }, data: { employeeId: newId } }).catch(() => undefined);
      await audit(tx, today, { actor, action: "penalty.correctEmployeeId", entityType: "penalty", entityId: p.id, caseRef: p.uin, details: { from: p.employeeId, to: newId } });
    }
    await tx.penalty.update({ where: { id: p.id }, data: { status: to } });
    await tx.exceptionCase.update({ where: { id: e.id }, data: { status: "RESOLVED", resolution: input.note, resolvedOn: today } });
    await audit(tx, today, { actor, action: "penalty.resolveAndResume", entityType: "penalty", entityId: p.id, caseRef: p.uin, before: p.status, after: to, details: { kind: e.kind, note: input.note } });
    p = await tx.penalty.findUniqueOrThrow({ where: { id: p.id } });
    await addToTicket(tx, p, today, s, cal, { allowSuspended: e.kind === "SUSPENDED" });
  });
}

// ---------- Write-off (E10, E18) ----------

export async function requestWriteOff(actor: Actor, penaltyId: string, reason: string) {
  const { today } = await getRuleContext();
  const p = await prisma.penalty.findUniqueOrThrow({ where: { id: penaltyId } });
  const a = await amountsOf(prisma, p);
  const to = await userMove(actor, p, "requestWriteOff", { reason, outstanding: a.outstanding }, today);
  await prisma.$transaction(async (tx) => {
    const w = await tx.writeOff.create({ data: { penaltyId: p.id, amount: a.outstanding, reason: reason.trim(), requestedById: actor.id, requestedOn: today, status: "REQUESTED" } });
    await tx.penalty.update({ where: { id: p.id }, data: { status: to, priorStatus: p.status } });
    await audit(tx, today, { actor, action: "penalty.requestWriteOff", entityType: "penalty", entityId: p.id, caseRef: p.uin, before: p.status, after: to, details: { writeOffId: w.id, amount: a.outstanding, reason } });
    await notifyMany(tx, today, [p.competentAuthorityId], `Write-off requested: ${rupees(a.outstanding)} on penalty ${p.ref} (${p.officerName}). Reason: ${reason}. Your approval is needed.`,
      { channels: ["DASHBOARD", "EMAIL"], entityType: "penalty", entityId: p.id, caseRef: p.uin });
  });
}

export async function decideWriteOff(actor: Actor, writeOffId: string, approve: boolean, note: string) {
  const { today, settings: s, cal } = await getRuleContext();
  const w = await prisma.writeOff.findUniqueOrThrow({ where: { id: writeOffId }, include: { penalty: true } });
  if (w.status !== "REQUESTED") throw new DomainError("This write-off has already been decided.");
  const p = w.penalty;
  const to = await userMove(actor, p, approve ? "approveWriteOff" : "rejectWriteOff", { isCompetentAuthority: actor.id === p.competentAuthorityId, reason: note }, today);
  const esignRef = approve ? eSign.sign(`WO|${p.ref}|${w.amount}`, actor.id, today).ref : null;
  await prisma.$transaction(async (tx) => {
    await tx.writeOff.update({ where: { id: w.id }, data: { status: approve ? "APPROVED" : "REJECTED", decidedById: actor.id, decidedOn: today, decisionNote: note || null, esignRef } });
    await tx.penalty.update({ where: { id: p.id }, data: { status: to, ...(approve ? { closedOn: today, qrActive: false } : {}) } });
    if (approve) {
      await stopRecovery(tx, p, today, "written off", s, cal);
      await tx.exceptionCase.updateMany({ where: { penaltyId: p.id, status: "OPEN" }, data: { status: "RESOLVED", resolution: `Written off (${esignRef})`, resolvedOn: today } });
    }
    await audit(tx, today, { actor, action: approve ? "penalty.approveWriteOff" : "penalty.rejectWriteOff", entityType: "penalty", entityId: p.id, caseRef: p.uin, before: p.status, after: to, details: { amount: w.amount, note, esignRef } });
    await notifyMany(tx, today, [...(await ddoIds(tx)), w.requestedById],
      approve ? `Write-off of ${rupees(w.amount)} on penalty ${p.ref} approved by the Competent Authority (${esignRef}).` : `Write-off on penalty ${p.ref} was not approved: ${note}`,
      { channels: ["DASHBOARD", "EMAIL"], entityType: "penalty", entityId: p.id, caseRef: p.uin });
  });
}

// ---------- Changes in staff records (E7, E9, E10, E11) ----------

/**
 * Daily: officers retiring soon go to the front of the queue (E9); a change in staff records (retirement without
 * pension recovery, resignation, dismissal, death, suspension, leaving the State payroll) moves their open lines to
 * the exceptions queue.
 */
export async function staffStatusJob({ today, settings: s, cal }: RuleContext): Promise<number> {
  let n = 0;
  const open = await prisma.ticket.findMany({ where: { status: "OPEN" }, include: { lines: { include: { penalty: true } } } });
  for (const t of open) {
    const staff = await staffRecords.find(prisma, t.employeeId);
    if (t.priority !== "RETIREMENT" && retiringSoon(staff?.retirementOn ?? null, today, s.retirementAlertMonths)) {
      await prisma.ticket.update({ where: { id: t.id }, data: { priority: "RETIREMENT" } });
      await notifyMany(prisma, today, [...(await ddoIds(prisma)), t.assigneeId], `${staff?.name} (employee ID ${t.employeeId}) retires on ${formatDate(staff?.retirementOn)}. Ticket ${t.ticketNo} moves to the front of the queue.`, { channels: ["DASHBOARD"], entityType: "ticket", entityId: t.id });
      n++;
    }
    for (const l of t.lines.filter((x) => x.status === "ACTIVE" && ACTIVE_LINE.includes(x.penalty.status))) {
      const kind = routingProblem(staff, l.penalty.officerName, today, s);
      // A suspended officer whose recovery was resumed on purpose (E11) stays on the ticket.
      if (!kind || (kind === "SUSPENDED" && (await prisma.exceptionCase.count({ where: { penaltyId: l.penaltyId, kind: "SUSPENDED", status: "RESOLVED" } })) > 0)) continue;
      await prisma.$transaction(async (tx) => {
        const to = await systemMove(tx, l.penalty, "officerStatusChanged", { routingProblem: EXCEPTION_LABELS[kind] }, today, {}, { kind });
        if (!to) return;
        await stopRecovery(tx, l.penalty, today, EXCEPTION_LABELS[kind], s, cal);
        await tx.exceptionCase.create({ data: { penaltyId: l.penaltyId, kind, status: "OPEN", note: EXCEPTION_LABELS[kind], openedOn: today } });
        await notifyMany(tx, today, await ddoIds(tx), `Penalty ${l.penalty.ref} (${l.penalty.officerName}) has moved to the exceptions queue: ${EXCEPTION_LABELS[kind]}.`, { channels: ["DASHBOARD"], entityType: "penalty", entityId: l.penaltyId, caseRef: l.penalty.uin });
      });
      n++;
    }
  }
  return n;
}

export type StaffEdit = { designation: string; office: string; monthlyPay: number; payrollType: string; retirementOn: string; status: string; name: string };

/** Admin edits the mock staff records: transfers (E7), status changes (E10, E11), payroll type (E8), corrections (E16). */
export async function updateStaffRecord(actor: Actor, employeeId: string, input: StaffEdit) {
  if (actor.role !== "ADMIN") throw new DomainError("Only the administrator can change the staff records (demo).");
  const { today } = await getRuleContext();
  const before = await prisma.staffRecord.findUniqueOrThrow({ where: { employeeId } });
  if (!input.name.trim() || !input.designation.trim()) throw new DomainError("Name and designation cannot be empty.");
  if (!Number.isInteger(input.monthlyPay) || input.monthlyPay < 0) throw new DomainError("Enter the monthly pay in whole rupees.");
  const after = await prisma.staffRecord.update({
    where: { employeeId },
    data: { name: input.name.trim(), designation: input.designation.trim(), office: input.office.trim(), monthlyPay: input.monthlyPay, payrollType: input.payrollType, retirementOn: input.retirementOn || null, status: input.status },
  });
  await audit(prisma, today, { actor, action: "staff.update", entityType: "staff", entityId: employeeId, details: { before, after } });
  return after;
}

// ---------- Payment with an unknown reference (P-A23) ----------

/** Demo control: a challan quoting a reference that matches no penalty. It goes to the exceptions queue when it settles. */
export async function simulateUnmatchedPayment(actor: Actor, reference: string, amount: number) {
  if (actor.role !== "ADMIN") throw new DomainError("Only the administrator can use this demo control.");
  const { today, settings: s, cal } = await getRuleContext();
  if (!Number.isInteger(amount) || amount <= 0) throw new DomainError("Enter the amount in whole rupees.");
  if (await prisma.penalty.findUnique({ where: { ref: reference } })) throw new DomainError("That reference belongs to a penalty; use one that does not.");
  const grn = egras.newGrn(reference, await nextSeq(prisma, "grn"));
  await prisma.paymentGRN.create({ data: { grn, scannedRef: reference, amount, channel: "CHALLAN", paidOn: today, paidAt: new Date().toISOString(), settlesOn: addWorkingDays(today, s.egrasSettlementLagDays, cal), status: "PENDING" } });
  await audit(prisma, today, { actor, action: "treasury.demoUnmatchedPayment", entityType: "grn", entityId: grn, details: { reference, amount } });
  return grn;
}

export async function closeUnmatchedPayment(actor: Actor, exceptionId: string, note: string) {
  const { today } = await getRuleContext();
  const e = await prisma.exceptionCase.findUniqueOrThrow({ where: { id: exceptionId } });
  if (e.kind !== "UNMATCHED_PAYMENT" || e.status !== "OPEN") throw new DomainError("This case is not an open unmatched payment.");
  if (note.trim().length < 5) throw new DomainError("Please record what was done (for example, refunded to the payer, or matched by hand with the reason).");
  await prisma.exceptionCase.update({ where: { id: e.id }, data: { status: "RESOLVED", resolution: note.trim(), resolvedOn: today } });
  await audit(prisma, today, { actor, action: "exception.resolveUnmatched", entityType: "grn", entityId: e.grn ?? e.id, details: { note } });
}


/** The nodal officer confirms a "stop deduction" instruction has been carried out. */
export async function acknowledgeTask(actor: Actor, taskId: string) {
  const { today } = await getRuleContext();
  const t = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  if (t.assigneeId !== actor.id) throw new DomainError("This task is not assigned to you.");
  if (t.kind !== "STOP_DEDUCTION" || t.status !== "OPEN") throw new DomainError("This task cannot be closed here.");
  await prisma.task.update({ where: { id: taskId }, data: { status: "DONE", doneOn: today } });
  await audit(prisma, today, { actor, action: "finance.stopDeductionDone", entityType: "penalty", entityId: t.penaltyId ?? taskId, details: { text: t.text } });
}
