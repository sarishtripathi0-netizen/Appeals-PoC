// Recovery from salary (PLAN.md Part 2, steps 3–7): the day-30 flag, "Confirm unpaid", the Recovery Direction,
// one ticket per officer with instalments, deduction entry with proof, verification and the deduction message,
// and the Finance nodal officer's leave. Recovery is central: Sewa Setu DDO and Finance nodal officer (P-A1).

import type { Penalty } from "@prisma/client";
import { eSign, payroll } from "@/adapters";
import { staffRecords } from "@/adapters/staff-records";
import { addDays, formatDate } from "@/domain/dates";
import type { PenaltyStatus } from "@/domain/penalty-machine";
import { EXCEPTION_LABELS, monthName, retiringSoon, routingProblem, type Instalment } from "@/domain/recovery";
import type { Settings } from "@/domain/settings";
import { workingDaysBetween, type Calendar } from "@/domain/calendar";
import { audit, SYSTEM_ACTOR, type Actor } from "@/lib/audit";
import { getRuleContext, type RuleContext } from "@/lib/context";
import { type Db, nextSeq, parseJson, prisma } from "@/lib/db";
import { notifyMany, notifyUser } from "@/lib/notify";
import { rupees } from "@/lib/view";
import { DomainError } from "./errors";
import { activeNodal, amountsOf, closeTicketIfDone, replanTicket, systemMove, userMove } from "./penalties";
import { reconcileCredits } from "./reconciliation";

async function ssDdoIds(db: Db) {
  return (await db.user.findMany({ where: { role: "SEWA_SETU_DDO" }, select: { id: true } })).map((u) => u.id);
}

// ---------- Day 30 (step 3) ----------

/** After the last date, an unpaid penalty becomes OVERDUE and goes to the Sewa Setu DDO (once any pending receipt has settled). */
export async function overdueJob({ today }: RuleContext): Promise<number> {
  const due = await prisma.penalty.findMany({ where: { status: "RAISED", dueOn: { lt: today } } });
  let n = 0;
  for (const p of due) {
    const a = await amountsOf(prisma, p);
    const pending = await prisma.paymentGRN.count({ where: { penaltyId: p.id, status: "PENDING" } });
    const to = await systemMove(prisma, p, "dueDatePassed", { outstanding: a.outstanding }, today, { overdueOn: today }, { outstanding: a.outstanding, pendingReceipts: pending });
    if (!to) continue;
    n++;
    await notifyMany(prisma, today, await ssDdoIds(prisma),
      `Penalty ${p.ref} (${p.officerName}, UIN ${p.uin}) was not paid by ${formatDate(p.dueOn)}. ${rupees(a.outstanding)} is outstanding.${pending ? " A payment is still being confirmed by eGRAS; please wait before confirming it unpaid." : " Please confirm it unpaid."}`,
      { channels: ["DASHBOARD"], entityType: "penalty", entityId: p.id, caseRef: p.uin });
  }
  return n;
}

/** The Sewa Setu DDO confirms non-payment: the QR is switched off and the officer is told recovery will follow. */
export async function confirmUnpaid(actor: Actor, penaltyId: string) {
  const { today, settings: s, cal } = await getRuleContext();
  const p = await prisma.penalty.findUniqueOrThrow({ where: { id: penaltyId } });
  const a = await amountsOf(prisma, p);
  const grnPending = (await prisma.paymentGRN.count({ where: { penaltyId, status: "PENDING" } })) > 0;
  const to = await userMove(actor, p, "confirmUnpaid", { grnPending, outstanding: a.outstanding }, today);
  await prisma.$transaction(async (tx) => {
    await tx.penalty.update({ where: { id: p.id }, data: { status: to, qrActive: false, unpaidConfirmedOn: today } });
    await audit(tx, today, { actor, action: "penalty.confirmUnpaid", entityType: "penalty", entityId: p.id, caseRef: p.uin, before: p.status, after: to, details: { ref: p.ref, outstanding: a.outstanding } });
    await notifyUser(tx, today, p.officerId,
      `Penalty ${p.ref} (UIN ${p.uin}) of ${rupees(a.outstanding)} was not paid by the last date. Penalty not yet paid; recovery from your salary will follow. The QR code has been switched off.`,
      { entityType: "penalty", entityId: p.id, caseRef: p.uin });
    await attachDirection(tx, { ...p, status: to }, today, s, cal);
  });
}

// ---------- Recovery Direction (step 4) ----------

async function attachDirection(db: Db, p: Penalty, today: string, s: Settings, cal: Calendar) {
  if (s.recoveryDirectionMode === "STANDING") {
    await db.recoveryDirection.create({ data: { penaltyId: p.id, mode: "STANDING", reference: s.standingOrderRef, status: "IN_PLACE", sentOn: today, signedOn: today } });
    await audit(db, today, { actor: SYSTEM_ACTOR, action: "penalty.directionAttached", entityType: "penalty", entityId: p.id, caseRef: p.uin, details: { mode: "STANDING", reference: s.standingOrderRef } });
    await addToTicket(db, p, today, s, cal);
    return;
  }
  const d = await db.recoveryDirection.create({ data: { penaltyId: p.id, mode: "PER_CASE", status: "AWAITING_SIGNATURE", competentAuthorityId: p.competentAuthorityId, sentOn: today } });
  await audit(db, today, { actor: SYSTEM_ACTOR, action: "penalty.directionSent", entityType: "penalty", entityId: p.id, caseRef: p.uin, details: { mode: "PER_CASE", directionId: d.id, competentAuthorityId: p.competentAuthorityId } });
  await notifyMany(db, today, [p.competentAuthorityId],
    `Please sign the Recovery Direction for penalty ${p.ref} on ${p.officerName} (${rupees(p.amount)}, UIN ${p.uin}). Recovery from salary cannot start until it is signed.`,
    { channels: ["DASHBOARD", "EMAIL"], entityType: "penalty", entityId: p.id, caseRef: p.uin });
}

/** The Competent Authority e-signs a per-case Recovery Direction; recovery can then start. */
export async function signDirection(actor: Actor, directionId: string) {
  const { today, settings: s, cal } = await getRuleContext();
  const d = await prisma.recoveryDirection.findUniqueOrThrow({ where: { id: directionId }, include: { penalty: true } });
  if (d.status !== "AWAITING_SIGNATURE") throw new DomainError("This Recovery Direction is already in place.");
  if (actor.role !== "COMPETENT_AUTHORITY" || d.competentAuthorityId !== actor.id) {
    await audit(prisma, today, { actor, action: "penalty.signDirection", entityType: "penalty", entityId: d.penaltyId, caseRef: d.penalty.uin, outcome: "REFUSED", details: { reason: "not the Competent Authority" } });
    throw new DomainError("Only the officer's Competent Authority can sign this Recovery Direction.");
  }
  const esignRef = eSign.sign(`RD|${d.penalty.ref}|${d.penalty.amount}`, actor.id, today).ref;
  await prisma.$transaction(async (tx) => {
    await tx.recoveryDirection.update({ where: { id: d.id }, data: { status: "IN_PLACE", signedOn: today, esignRef, reference: `Recovery Direction ${esignRef}` } });
    await audit(tx, today, { actor, action: "penalty.directionSigned", entityType: "penalty", entityId: d.penaltyId, caseRef: d.penalty.uin, details: { esignRef } });
    await addToTicket(tx, d.penalty, today, s, cal);
  });
}

/** Reminds the Competent Authority every 3 working days while a per-case direction waits for signature. */
export async function directionRemindersJob({ today, cal }: RuleContext): Promise<number> {
  const waiting = await prisma.recoveryDirection.findMany({ where: { status: "AWAITING_SIGNATURE" }, include: { penalty: true } });
  let n = 0;
  for (const d of waiting) {
    const days = workingDaysBetween(d.sentOn, today, cal);
    if (days === 0 || days % 3 !== 0 || days / 3 <= d.remindersSent) continue;
    await prisma.recoveryDirection.update({ where: { id: d.id }, data: { remindersSent: { increment: 1 } } });
    await notifyMany(prisma, today, [d.competentAuthorityId],
      `Reminder: the Recovery Direction for penalty ${d.penalty.ref} (${d.penalty.officerName}) has been waiting for your signature since ${formatDate(d.sentOn)}.`,
      { channels: ["DASHBOARD", "EMAIL"], entityType: "penalty", entityId: d.penaltyId, caseRef: d.penalty.uin });
    n++;
  }
  return n;
}

// ---------- Ticket (step 5) ----------

/** Puts a confirmed penalty on its officer's open ticket, or routes it to the exceptions queue (E8–E11, E16). */
export async function addToTicket(db: Db, p: Penalty, today: string, s: Settings, cal: Calendar, opts: { allowSuspended?: boolean } = {}) {
  const direction = await db.recoveryDirection.findFirst({ where: { penaltyId: p.id, status: "IN_PLACE" } });
  const staff = await staffRecords.find(db, p.employeeId);
  const found = routingProblem(staff, p.officerName, today, s);
  const kind = found === "SUSPENDED" && opts.allowSuspended ? null : found;
  if (kind) {
    const to = await systemMove(db, p, "routeToException", { routingProblem: EXCEPTION_LABELS[kind] }, today, {}, { kind });
    if (!to) return null;
    await db.exceptionCase.create({ data: { penaltyId: p.id, kind, status: "OPEN", note: EXCEPTION_LABELS[kind], openedOn: today } });
    await notifyMany(db, today, await ssDdoIds(db), `Penalty ${p.ref} (${p.officerName}) needs handling in the exceptions queue: ${EXCEPTION_LABELS[kind]}.`,
      { channels: ["DASHBOARD"], entityType: "penalty", entityId: p.id, caseRef: p.uin });
    return null;
  }
  const to = await systemMove(db, p, "addToTicket", { directionInPlace: !!direction, routingProblem: null }, today);
  if (!to) return null;

  const a = await amountsOf(db, p);
  let ticket = await db.ticket.findFirst({ where: { employeeId: p.employeeId, status: "OPEN" } });
  const retiring = retiringSoon(staff?.retirementOn ?? null, today, s.retirementAlertMonths);
  if (!ticket) {
    const nodal = await activeNodal(db);
    ticket = await db.ticket.create({
      data: {
        ticketNo: `TKT-${today.slice(0, 4)}-${String(await nextSeq(db, `ticket:${today.slice(0, 4)}`)).padStart(4, "0")}`,
        employeeId: p.employeeId, officerId: p.officerId, status: "OPEN", assigneeId: nodal.officer!.id, bothOnLeave: nodal.bothOnLeave,
        priority: retiring ? "RETIREMENT" : "NORMAL", createdOn: today, plan: "[]",
      },
    });
    await audit(db, today, { actor: SYSTEM_ACTOR, action: "ticket.create", entityType: "ticket", entityId: ticket.id, caseRef: p.uin, details: { ticketNo: ticket.ticketNo, employeeId: p.employeeId, assigneeId: ticket.assigneeId, bothOnLeave: nodal.bothOnLeave } });
  } else if (retiring && ticket.priority !== "RETIREMENT") {
    ticket = await db.ticket.update({ where: { id: ticket.id }, data: { priority: "RETIREMENT" } });
  }
  await db.ticketLine.create({ data: { ticketId: ticket.id, penaltyId: p.id, amount: a.outstanding, status: "ACTIVE", addedOn: today } });
  const plan = await replanTicket(db, ticket.id, today, s, cal);
  await audit(db, today, { actor: SYSTEM_ACTOR, action: "penalty.ticketLine", entityType: "penalty", entityId: p.id, caseRef: p.uin, details: { ticketNo: ticket.ticketNo, amount: a.outstanding, plan } });
  await notifyUser(db, today, ticket.assigneeId,
    `Recovery ticket ${ticket.ticketNo} for ${p.officerName} (employee ID ${p.employeeId}): penalty ${p.ref}, UIN ${p.uin}, ${rupees(a.outstanding)} added. ${plan.length > 1 ? `${plan.length} monthly instalments` : "To be deducted"} from ${monthName(plan[0]?.month ?? "")} salary; first due by ${formatDate(plan[0]?.dueOn)}.`,
    { channels: ["DASHBOARD", "EMAIL"], entityType: "penalty", entityId: p.id, caseRef: p.uin });
  if (retiring) {
    await notifyMany(db, today, [...(await ssDdoIds(db)), ticket.assigneeId],
      `${p.officerName} (employee ID ${p.employeeId}) retires on ${formatDate(staff?.retirementOn)}. Ticket ${ticket.ticketNo} has been moved to the front of the queue.`,
      { channels: ["DASHBOARD"], entityType: "penalty", entityId: p.id, caseRef: p.uin });
    await db.penalty.update({ where: { id: p.id }, data: { retirementAlertOn: today } });
  }
  return ticket;
}

/**
 * E14: an instalment whose deadline (pay date + grace) passes with nothing recorded escalates the ticket to the Finance
 * senior officer and shows as an overdue recovery for the Commission; the missed amount carries to the coming months.
 */
export async function ticketDeadlineJob({ today, settings: s, cal }: RuleContext): Promise<number> {
  const open = await prisma.ticket.findMany({ where: { status: "OPEN" }, include: { lines: { include: { penalty: true } } } });
  let n = 0;
  for (const t of open) {
    const missed = parseJson<Instalment[]>(t.plan, []).filter((p) => p.dueOn < today);
    if (missed.length === 0) continue;
    await prisma.$transaction(async (tx) => {
      const plan = await replanTicket(tx, t.id, today, s, cal, true);
      await tx.ticket.update({ where: { id: t.id }, data: { escalatedOn: today } });
      await audit(tx, today, { actor: SYSTEM_ACTOR, action: "ticket.escalate", entityType: "ticket", entityId: t.id, details: { ticketNo: t.ticketNo, missed, plan, bothOnLeave: t.bothOnLeave } });
      for (const l of t.lines.filter((x) => x.status === "ACTIVE")) {
        await audit(tx, today, { actor: SYSTEM_ACTOR, action: "penalty.ticketEscalated", entityType: "penalty", entityId: l.penaltyId, caseRef: l.penalty.uin, details: { ticketNo: t.ticketNo, missedMonths: missed.map((m) => m.month) } });
      }
      const who = (await tx.user.findMany({ where: { role: { in: ["FINANCE_SENIOR", "REGISTRAR", "SEWA_SETU_DDO"] } }, select: { id: true } })).map((u) => u.id);
      await notifyMany(tx, today, [...who, t.assigneeId],
        `Recovery overdue: ticket ${t.ticketNo} (employee ID ${t.employeeId}) had nothing deducted for ${missed.map((m) => monthName(m.month)).join(", ")} by ${formatDate(missed[missed.length - 1].dueOn)}${t.bothOnLeave ? " (both nodal officers are on leave)" : ""}. Escalated to the Finance senior officer. The amount moves to ${plan[0] ? monthName(plan[0].month) : "the next"} salary.`,
        { channels: ["DASHBOARD", "EMAIL"], entityType: "ticket", entityId: t.id });
    });
    n++;
  }
  return n;
}

// ---------- Deduction (step 6) ----------

export type DeductionInput = { lineId: string; payrollRef: string; salaryMonth: string; amount: number; voucherNo: string; proofFile: string };

export async function recordDeduction(actor: Actor, input: DeductionInput) {
  const { today, settings: s, cal } = await getRuleContext();
  const line = await prisma.ticketLine.findUniqueOrThrow({ where: { id: input.lineId }, include: { ticket: true, penalty: true } });
  const p = line.penalty;
  const a = await amountsOf(prisma, p);
  const deductionError =
    line.status !== "ACTIVE" ? (line.status === "ON_HOLD" ? "This line is on hold (stay order). Do not deduct." : "This line is no longer on the ticket. Do not deduct.") :
    !/^\d{4}-\d{2}$/.test(input.salaryMonth) ? "Choose the salary month." :
    !Number.isInteger(input.amount) || input.amount <= 0 ? "Enter the amount deducted in whole rupees." :
    input.amount > a.outstanding ? `The deduction is more than the ${rupees(a.outstanding)} outstanding on this penalty.` :
    input.voucherNo.trim().length < 3 ? "Enter the treasury voucher number crediting the head of account." :
    !input.proofFile.trim() ? "Upload the proof of deduction." : null;
  // A held or removed line is refused with its own reason (and audited), whatever the penalty's status.
  if (line.status !== "ACTIVE") {
    await audit(prisma, today, { actor, action: "penalty.recordDeduction", entityType: "penalty", entityId: p.id, caseRef: p.uin, before: p.status, after: p.status, outcome: "REFUSED", details: { reason: deductionError, lineStatus: line.status } });
    throw new DomainError(deductionError!);
  }
  const outstandingAfter = a.outstanding - (deductionError ? 0 : input.amount);
  const to = await userMove(actor, p, "recordDeduction", { isAssignee: line.ticket.assigneeId === actor.id, deductionError, outstandingAfter }, today);
  const staff = await staffRecords.find(prisma, p.employeeId);
  const payrollRef = input.payrollRef.trim() || payroll.postDeduction(p.employeeId, input.salaryMonth, input.amount).treasuryRef;
  await prisma.$transaction(async (tx) => {
    const d = await tx.deduction.create({
      data: {
        penaltyId: p.id, ticketLineId: line.id, kind: staff?.status === "RETIRED" || (staff?.retirementOn ?? "9999") < today ? "PENSION" : "SALARY",
        payrollRef, salaryMonth: input.salaryMonth, amount: input.amount, voucherNo: input.voucherNo.trim(), proofFile: input.proofFile.trim(), recordedById: actor.id, recordedOn: today,
      },
    });
    // The mock treasury feed will report the credit a few days later (step 8 reconciles it).
    await tx.creditFeedEntry.create({ data: { voucherNo: d.voucherNo, amount: d.amount, headOfAccount: p.headOfAccount, expectedOn: addDays(today, s.treasuryCreditLagDays) } });
    await tx.penalty.update({ where: { id: p.id }, data: { status: to } });
    await audit(tx, today, { actor, action: "penalty.recordDeduction", entityType: "penalty", entityId: p.id, caseRef: p.uin, before: p.status, after: to, details: { ref: p.ref, deductionId: d.id, payrollRef, month: input.salaryMonth, amount: input.amount, voucherNo: d.voucherNo, proofFile: d.proofFile } });
    if (outstandingAfter === 0) await tx.ticketLine.update({ where: { id: line.id }, data: { status: "DONE" } });
    await replanTicket(tx, line.ticketId, today, s, cal);
    await closeTicketIfDone(tx, line.ticket, today);
    await notifyMany(tx, today, await ssDdoIds(tx), `Deduction of ${rupees(input.amount)} for ${input.salaryMonth} on penalty ${p.ref} (UIN ${p.uin}) has been recorded by Finance. Please verify the proof.`,
      { channels: ["DASHBOARD"], entityType: "penalty", entityId: p.id, caseRef: p.uin });
  });
}

// ---------- Verification (step 7) ----------

/** What the Sewa Setu DDO checks against the line: proof present, employee ID, UIN and amount. */
export function proofCheck(d: { proofFile: string; amount: number; verification: string }, p: { employeeId: string; uin: string }, ticket: { employeeId: string } | null, lineAmount: number | null): string | null {
  if (d.verification !== "SUBMITTED") return "This deduction has already been checked.";
  if (!d.proofFile) return "There is no proof from the Finance nodal officer. A deduction cannot be marked recovered without it.";
  if (ticket && ticket.employeeId !== p.employeeId) return "The employee ID on the ticket does not match the penalty.";
  if (!p.uin) return "The deduction is not linked to a UIN.";
  if (lineAmount !== null && d.amount > lineAmount) return "The amount is more than the line on the ticket.";
  return null;
}

export async function verifyDeduction(actor: Actor, deductionId: string) {
  const { today } = await getRuleContext();
  const d = await prisma.deduction.findUniqueOrThrow({ where: { id: deductionId }, include: { penalty: true } });
  if (d.verification !== "SUBMITTED") throw new DomainError("This deduction has already been checked.");
  const line = d.ticketLineId ? await prisma.ticketLine.findUnique({ where: { id: d.ticketLineId }, include: { ticket: true } }) : null;
  const p = d.penalty;
  const others = await prisma.deduction.findMany({ where: { penaltyId: p.id, id: { not: d.id }, verification: { not: "RETURNED" } } });
  const a = await amountsOf(prisma, p);
  const verifiedAll = a.outstanding === 0 && others.every((o) => o.verification === "VERIFIED");
  const to = await userMove(actor, p, "verifyDeduction", { proofError: proofCheck(d, p, line?.ticket ?? null, line?.amount ?? null), verifiedAll, priorStatus: p.status as PenaltyStatus }, today);
  const message = `Deduction for UIN ${p.uin} has been processed. Rs. ${d.amount.toLocaleString("en-IN")} has been deducted from your salary for ${monthName(d.salaryMonth)}.`;
  await prisma.$transaction(async (tx) => {
    await tx.deduction.update({ where: { id: d.id }, data: { verification: "VERIFIED", verifiedById: actor.id, verifiedOn: today } });
    await tx.penalty.update({ where: { id: p.id }, data: { status: to } });
    await audit(tx, today, { actor, action: "penalty.verifyDeduction", entityType: "penalty", entityId: p.id, caseRef: p.uin, before: p.status, after: to, details: { ref: p.ref, deductionId: d.id, amount: d.amount, month: d.salaryMonth } });
    // The deduction message goes to the officer by SMS, email and dashboard, copied to the imposing and Competent Authorities (P-A9).
    await notifyUser(tx, today, p.officerId, message, { entityType: "penalty", entityId: p.id, caseRef: p.uin });
    await notifyMany(tx, today, [p.imposedById, p.competentAuthorityId], `Copy: ${message} (${p.officerName}, penalty ${p.ref})`, { channels: ["DASHBOARD", "EMAIL"], entityType: "penalty", entityId: p.id, caseRef: p.uin });
    // The treasury credit may already have arrived before the proof was checked.
    if (to === "RECOVERED") await reconcileCredits(tx, p.id, today);
  });
  return { to, message };
}

export async function returnDeduction(actor: Actor, deductionId: string, reason: string) {
  const { today, settings: s, cal } = await getRuleContext();
  const d = await prisma.deduction.findUniqueOrThrow({ where: { id: deductionId }, include: { penalty: true } });
  if (d.verification !== "SUBMITTED") throw new DomainError("This deduction has already been checked.");
  const p = d.penalty;
  const remainingValid = await prisma.deduction.count({ where: { penaltyId: p.id, id: { not: d.id }, verification: { not: "RETURNED" } } });
  const to = await userMove(actor, p, "returnDeduction", { reason, priorStatus: remainingValid ? "PARTLY_DEDUCTED" : "IN_RECOVERY" }, today);
  const line = d.ticketLineId ? await prisma.ticketLine.findUnique({ where: { id: d.ticketLineId }, include: { ticket: true } }) : null;
  await prisma.$transaction(async (tx) => {
    await tx.deduction.update({ where: { id: d.id }, data: { verification: "RETURNED", returnReason: reason, verifiedById: actor.id, verifiedOn: today } });
    await tx.penalty.update({ where: { id: p.id }, data: { status: to } });
    if (line) {
      if (line.status === "DONE") await tx.ticketLine.update({ where: { id: line.id }, data: { status: "ACTIVE" } });
      if (line.ticket.status === "CLOSED") await tx.ticket.update({ where: { id: line.ticketId }, data: { status: "OPEN", closedOn: null } });
      await replanTicket(tx, line.ticketId, today, s, cal);
    }
    await audit(tx, today, { actor, action: "penalty.returnDeduction", entityType: "penalty", entityId: p.id, caseRef: p.uin, before: p.status, after: to, details: { deductionId: d.id, reason } });
    await notifyMany(tx, today, [line?.ticket.assigneeId ?? d.recordedById],
      `The deduction of ${rupees(d.amount)} for ${d.salaryMonth} on penalty ${p.ref} was returned by the Sewa Setu DDO: ${reason}. Please correct and enter it again.`,
      { channels: ["DASHBOARD", "EMAIL"], entityType: "penalty", entityId: p.id, caseRef: p.uin });
  });
}

// ---------- Nodal officer leave (P-A12) ----------

/** A Finance nodal officer marks themselves on leave or back; open tickets move to whoever is available. */
export async function setLeave(actor: Actor, onLeave: boolean) {
  const { today } = await getRuleContext();
  if (actor.role !== "FINANCE_NODAL") throw new DomainError("Only a Finance nodal officer can do this.");
  await prisma.user.update({ where: { id: actor.id }, data: { onLeave } });
  await audit(prisma, today, { actor, action: onLeave ? "finance.leaveStart" : "finance.leaveEnd", entityType: "user", entityId: actor.id });
  const nodal = await activeNodal(prisma);
  const open = await prisma.ticket.findMany({ where: { status: "OPEN" } });
  let moved = 0;
  for (const t of open) {
    if (t.assigneeId === nodal.officer?.id && t.bothOnLeave === nodal.bothOnLeave) continue;
    await prisma.ticket.update({ where: { id: t.id }, data: { assigneeId: nodal.officer!.id, bothOnLeave: nodal.bothOnLeave } });
    await audit(prisma, today, { actor, action: "ticket.reassign", entityType: "ticket", entityId: t.id, details: { ticketNo: t.ticketNo, from: t.assigneeId, to: nodal.officer?.id, bothOnLeave: nodal.bothOnLeave } });
    moved++;
  }
  if (moved && nodal.officer) await notifyUser(prisma, today, nodal.officer.id, `${moved} recovery ticket(s) are now with you${nodal.bothOnLeave ? " (both nodal officers are marked on leave)" : ""}.`, { channels: ["DASHBOARD", "EMAIL"] });
  return { moved, bothOnLeave: nodal.bothOnLeave };
}

