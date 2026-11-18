// Reconciliation with the treasury (PLAN.md Part 2, step 8): the mock credit feed, credit missing and escalation (E15),
// and the monthly statement that closes penalties whose credit is confirmed.

import { addDays } from "@/domain/dates";
import { penaltyMachine, type PenaltyStatus } from "@/domain/penalty-machine";
import { isFirstWorkingDayOfMonth, monthName, monthOf, addMonths } from "@/domain/recovery";
import { statementRow, statementTotals, type StatementRow } from "@/domain/statement";
import { audit, SYSTEM_ACTOR, type Actor } from "@/lib/audit";
import { getRuleContext, type RuleContext } from "@/lib/context";
import { type Db, prisma } from "@/lib/db";
import { notifyMany } from "@/lib/notify";
import { rupees } from "@/lib/view";
import { DomainError } from "./errors";
import { activeNodal, systemMove } from "./penalties";

async function idsOf(db: Db, roles: string[]) {
  return (await db.user.findMany({ where: { role: { in: roles } }, select: { id: true } })).map((u) => u.id);
}

/** Once every deduction on a recovered penalty is credited, the credit is confirmed (it closes with the next statement). */
export async function reconcileCredits(db: Db, penaltyId: string, today: string) {
  const p = await db.penalty.findUniqueOrThrow({ where: { id: penaltyId }, include: { deductions: true } });
  if (!["RECOVERED", "CREDIT_MISSING", "ESCALATED"].includes(p.status)) return null;
  const live = p.deductions.filter((d) => d.verification !== "RETURNED");
  if (live.length === 0 || live.some((d) => d.credit !== "CREDITED")) return null;
  const to = await systemMove(db, p, "creditsMatched", {}, today, {}, { vouchers: live.map((d) => d.voucherNo) });
  if (to) await db.task.updateMany({ where: { penaltyId, kind: "CREDIT_FOLLOW_UP", status: "OPEN" }, data: { status: "DONE", doneOn: today } });
  return to;
}

/** Credits arrive from the mock treasury feed and are matched to deduction vouchers by number and amount. */
export async function treasuryFeedJob({ today }: RuleContext): Promise<number> {
  const arriving = await prisma.creditFeedEntry.findMany({ where: { arrivedOn: null, dropped: false, expectedOn: { lte: today } } });
  for (const c of arriving) {
    await prisma.$transaction(async (tx) => {
      const d = await tx.deduction.findFirst({ where: { voucherNo: c.voucherNo, amount: c.amount, verification: { not: "RETURNED" }, credit: { not: "CREDITED" } } });
      await tx.creditFeedEntry.update({ where: { id: c.id }, data: { arrivedOn: today, deductionId: d?.id ?? null } });
      if (!d) return;
      await tx.deduction.update({ where: { id: d.id }, data: { credit: "CREDITED", creditedOn: today } });
      const p = await tx.penalty.findUniqueOrThrow({ where: { id: d.penaltyId } });
      await audit(tx, today, { actor: SYSTEM_ACTOR, action: "penalty.creditReceived", entityType: "penalty", entityId: p.id, caseRef: p.uin, details: { voucherNo: c.voucherNo, amount: c.amount, headOfAccount: c.headOfAccount } });
      await reconcileCredits(tx, p.id, today);
    });
  }
  return arriving.length;
}

/**
 * E15: a deduction with no credit after the credit window is marked missing (follow-up task for the nodal officer);
 * still missing after the escalation period, it is escalated to the Finance senior officer and the Commission.
 */
export async function creditMissingJob({ today, settings: s }: RuleContext): Promise<number> {
  let n = 0;
  const late = await prisma.deduction.findMany({ where: { credit: "AWAITED", verification: { not: "RETURNED" }, recordedOn: { lt: addDays(today, -s.creditWindowDays) } }, include: { penalty: true } });
  for (const d of late) {
    await prisma.$transaction(async (tx) => {
      await tx.deduction.update({ where: { id: d.id }, data: { credit: "MISSING", creditMissingOn: today } });
      const line = d.ticketLineId ? await tx.ticketLine.findUnique({ where: { id: d.ticketLineId }, include: { ticket: true } }) : null;
      const assigneeId = line?.ticket.assigneeId ?? (await activeNodal(tx)).officer?.id;
      if (assigneeId) {
        await tx.task.create({
          data: {
            kind: "CREDIT_FOLLOW_UP", assigneeId, penaltyId: d.penaltyId, dueOn: addDays(today, s.creditEscalationDays), status: "OPEN", createdOn: today,
            text: `No credit to the head of account has been seen for voucher ${d.voucherNo} (${rupees(d.amount)}, ${monthName(d.salaryMonth)} salary, penalty ${d.penalty.ref}). Please follow up with the treasury.`,
          },
        });
      }
      await audit(tx, today, { actor: SYSTEM_ACTOR, action: "penalty.creditMissing", entityType: "penalty", entityId: d.penaltyId, caseRef: d.penalty.uin, details: { deductionId: d.id, voucherNo: d.voucherNo, recordedOn: d.recordedOn } });
      await notifyMany(tx, today, [assigneeId, ...(await idsOf(tx, ["SEWA_SETU_DDO"]))],
        `Credit missing: voucher ${d.voucherNo} for ${rupees(d.amount)} on penalty ${d.penalty.ref} has not reached the head of account ${s.creditWindowDays} days after the deduction.`,
        { channels: ["DASHBOARD", "EMAIL"], entityType: "penalty", entityId: d.penaltyId, caseRef: d.penalty.uin });
    });
    n++;
  }
  const stale = await prisma.deduction.findMany({ where: { credit: "MISSING", creditMissingOn: { lt: addDays(today, -s.creditEscalationDays) } }, include: { penalty: true } });
  for (const d of stale) {
    await prisma.$transaction(async (tx) => {
      await tx.deduction.update({ where: { id: d.id }, data: { credit: "ESCALATED", escalatedOn: today } });
      await audit(tx, today, { actor: SYSTEM_ACTOR, action: "penalty.creditEscalated", entityType: "penalty", entityId: d.penaltyId, caseRef: d.penalty.uin, details: { deductionId: d.id, voucherNo: d.voucherNo } });
      await notifyMany(tx, today, await idsOf(tx, ["FINANCE_SENIOR", "REGISTRAR", "SEWA_SETU_DDO"]),
        `Escalated: the deduction of ${rupees(d.amount)} on penalty ${d.penalty.ref} (${d.penalty.officerName}, voucher ${d.voucherNo}) has still not been credited to the head of account.`,
        { channels: ["DASHBOARD", "EMAIL"], entityType: "penalty", entityId: d.penaltyId, caseRef: d.penalty.uin });
    });
    n++;
  }
  // Penalty status follows its deductions once the proof has been verified.
  for (const p of await prisma.penalty.findMany({ where: { status: { in: ["RECOVERED", "CREDIT_MISSING"] } }, include: { deductions: true } })) {
    const credits = p.deductions.filter((d) => d.verification !== "RETURNED").map((d) => d.credit);
    if (p.status === "RECOVERED" && credits.some((c) => c === "MISSING" || c === "ESCALATED")) {
      const to = await systemMove(prisma, p, "creditWindowPassed", {}, today);
      if (to && credits.includes("ESCALATED")) await systemMove(prisma, { ...p, status: to }, "escalationPeriodPassed", {}, today);
    } else if (p.status === "CREDIT_MISSING" && credits.includes("ESCALATED")) {
      await systemMove(prisma, p, "escalationPeriodPassed", {}, today);
    }
  }
  return n;
}

/** Demo control: the treasury never reports this credit (E15). */
export async function dropCredit(actor: Actor, entryId: string) {
  if (!["ADMIN", "SEWA_SETU_DDO"].includes(actor.role)) throw new DomainError("Only the Sewa Setu DDO or the administrator can use this demo control.");
  const { today } = await getRuleContext();
  const c = await prisma.creditFeedEntry.findUniqueOrThrow({ where: { id: entryId } });
  if (c.arrivedOn) throw new DomainError("This credit has already arrived.");
  await prisma.creditFeedEntry.update({ where: { id: entryId }, data: { dropped: true } });
  await audit(prisma, today, { actor, action: "treasury.demoDropCredit", entityType: "creditFeed", entityId: entryId, details: { voucherNo: c.voucherNo, amount: c.amount } });
}

/** The nodal officer records the follow-up; the mock treasury then re-sends the credit the next day. */
export async function followUpCredit(actor: Actor, taskId: string, note: string) {
  const { today } = await getRuleContext();
  const t = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  if (t.assigneeId !== actor.id) throw new DomainError("This task is not assigned to you.");
  if (t.status !== "OPEN") throw new DomainError("This task is already done.");
  if (note.trim().length < 5) throw new DomainError("Please record what the treasury said.");
  const missing = await prisma.deduction.findMany({ where: { penaltyId: t.penaltyId ?? "", credit: { in: ["MISSING", "ESCALATED"] } } });
  await prisma.$transaction(async (tx) => {
    for (const d of missing) {
      const p = await tx.penalty.findUniqueOrThrow({ where: { id: d.penaltyId } });
      await tx.creditFeedEntry.create({ data: { voucherNo: d.voucherNo, amount: d.amount, headOfAccount: p.headOfAccount, expectedOn: addDays(today, 1) } });
    }
    await tx.task.update({ where: { id: taskId }, data: { status: "DONE", doneOn: today } });
    await audit(tx, today, { actor, action: "penalty.creditFollowUp", entityType: "penalty", entityId: t.penaltyId ?? taskId, details: { note, vouchers: missing.map((d) => d.voucherNo) } });
  });
}

// ---------- Monthly statement ----------

export async function generateStatement(db: Db, month: string, today: string) {
  const monthEnd = addDays(`${addMonths(month, 1)}-01`, -1);
  const monthStart = `${month}-01`;
  const penalties = await db.penalty.findMany({
    where: { orderDate: { lte: monthEnd }, OR: [{ closedOn: null }, { closedOn: { gte: monthStart } }] },
    include: { grns: true, deductions: true, refunds: true, writeOffs: true },
    orderBy: { ref: "asc" },
  });
  const rows: StatementRow[] = penalties.map((p) => statementRow(p, monthEnd));
  const totals = statementTotals(rows);
  await db.monthlyStatement.upsert({
    where: { month },
    create: { month, generatedOn: today, rows: JSON.stringify(rows), totals: JSON.stringify(totals) },
    update: { generatedOn: today, rows: JSON.stringify(rows), totals: JSON.stringify(totals) },
  });
  await audit(db, today, { actor: SYSTEM_ACTOR, action: "statement.generate", entityType: "statement", entityId: month, details: totals });
  return { rows, totals };
}

/** On the first working day of each month: last month's statement, and penalties with confirmed credit are closed. */
export async function monthlyStatementJob({ today, cal }: RuleContext): Promise<number> {
  if (!isFirstWorkingDayOfMonth(today, cal)) return 0;
  const month = addMonths(monthOf(today), -1);
  if (await prisma.monthlyStatement.findUnique({ where: { month } })) return 0;
  const { totals } = await generateStatement(prisma, month, today);
  const confirmed = await prisma.penalty.findMany({ where: { status: "CREDIT_CONFIRMED" } });
  for (const p of confirmed) {
    const to = await systemMove(prisma, p, "close", { excess: 0 }, today, { closedOn: today }, { route: "salary", statement: month });
    if (to) {
      await notifyMany(prisma, today, [p.officerId], `Penalty ${p.ref} (UIN ${p.uin}) has been fully recovered and credited to the Government account. It is now closed.`,
        { channels: ["DASHBOARD"], entityType: "penalty", entityId: p.id, caseRef: p.uin });
    }
  }
  await notifyMany(prisma, today, await idsOf(prisma, ["SEWA_SETU_DDO", "FINANCE_SENIOR", "REGISTRAR"]),
    `The penalty statement for ${monthName(month)} is ready: ${totals.penalties} penalties, ${rupees(totals.egras)} collected through eGRAS, ${rupees(totals.deducted)} deducted from salary, ${rupees(totals.credited)} credited${totals.difference ? `, ${rupees(totals.difference)} not yet credited` : ""}. ${confirmed.length} penalties closed.`,
    { channels: ["DASHBOARD", "EMAIL"], entityType: "statement", entityId: month });
  return 1 + confirmed.length;
}

export const STATEMENT_VIEWERS = ["SEWA_SETU_DDO", "FINANCE_NODAL", "FINANCE_SENIOR", "REGISTRAR", "COMMISSIONER", "CHIEF_COMMISSIONER"];

export function penaltyStatusText(s: string) {
  return penaltyMachine.statusLabels[s as PenaltyStatus] ?? s;
}
