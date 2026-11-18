// Monthly statement rows (PLAN.md Part 2, step 8): per penalty, what was imposed, collected through eGRAS, deducted
// from salary, credited to the head of account, refunded and written off, up to the end of the month.

import type { ISODate } from "./dates";

export type StatementInput = {
  ref: string;
  officerName: string;
  employeeId: string;
  uin: string;
  amount: number;
  status: string;
  grns: { grn: string; amount: number; status: string; settledOn: string | null }[];
  deductions: { voucherNo: string; amount: number; recordedOn: string; verification: string; credit: string; creditedOn: string | null }[];
  refunds: { amount: number; status: string; refundedOn: string | null }[];
  writeOffs: { amount: number; status: string; decidedOn: string | null }[];
};

export type StatementRow = {
  ref: string;
  officerName: string;
  employeeId: string;
  uin: string;
  imposed: number;
  egras: number;
  grns: string[];
  deducted: number;
  vouchers: string[];
  credited: number;
  refunded: number;
  writtenOff: number;
  /** Collected (eGRAS and salary) but not yet seen in the head of account. */
  difference: number;
  outstanding: number;
  status: string;
};

const within = (d: string | null, end: ISODate) => !!d && d <= end;

export function statementRow(p: StatementInput, monthEnd: ISODate): StatementRow {
  const grns = p.grns.filter((g) => g.status === "SUCCESS" && within(g.settledOn, monthEnd));
  const deductions = p.deductions.filter((d) => d.verification !== "RETURNED" && within(d.recordedOn, monthEnd));
  const egras = grns.reduce((s, g) => s + g.amount, 0);
  const deducted = deductions.reduce((s, d) => s + d.amount, 0);
  // eGRAS receipts count as credited directly; salary deductions only once the treasury feed shows the credit.
  const credited = egras + deductions.filter((d) => d.credit === "CREDITED" && within(d.creditedOn, monthEnd)).reduce((s, d) => s + d.amount, 0);
  const refunded = p.refunds.filter((r) => r.status === "REFUNDED" && within(r.refundedOn, monthEnd)).reduce((s, r) => s + r.amount, 0);
  const writtenOff = p.writeOffs.filter((w) => w.status === "APPROVED" && within(w.decidedOn, monthEnd)).reduce((s, w) => s + w.amount, 0);
  return {
    ref: p.ref, officerName: p.officerName, employeeId: p.employeeId, uin: p.uin, imposed: p.amount,
    egras, grns: grns.map((g) => g.grn), deducted, vouchers: deductions.map((d) => d.voucherNo), credited, refunded, writtenOff,
    difference: egras + deducted - credited,
    outstanding: Math.max(0, p.amount - writtenOff - (egras + deducted - refunded)),
    status: p.status,
  };
}

export function statementTotals(rows: StatementRow[]) {
  const sum = (k: keyof StatementRow) => rows.reduce((s, r) => s + (r[k] as number), 0);
  return {
    penalties: rows.length, imposed: sum("imposed"), egras: sum("egras"), deducted: sum("deducted"), credited: sum("credited"),
    refunded: sum("refunded"), writtenOff: sum("writtenOff"), difference: sum("difference"), outstanding: sum("outstanding"),
  };
}

export const STATEMENT_COLUMNS: [keyof StatementRow, string][] = [
  ["ref", "Penalty"], ["officerName", "Officer"], ["employeeId", "Employee ID"], ["uin", "UIN"], ["imposed", "Imposed"],
  ["egras", "Collected through eGRAS"], ["grns", "eGRAS receipts (GRN)"], ["deducted", "Deducted from salary"], ["vouchers", "Treasury vouchers"],
  ["credited", "Credited to head of account"], ["refunded", "Refunded"], ["writtenOff", "Written off"], ["difference", "Difference (collected, not credited)"],
  ["outstanding", "Outstanding"], ["status", "Status"],
];

/** CSV with a header row; lists are joined with semicolons, and text is quoted. */
export function statementCsv(rows: StatementRow[], statusLabel: (s: string) => string): string {
  const cell = (v: unknown) => {
    const s = Array.isArray(v) ? v.join("; ") : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = [STATEMENT_COLUMNS.map(([, h]) => cell(h)).join(",")];
  for (const r of rows) lines.push(STATEMENT_COLUMNS.map(([k]) => cell(k === "status" ? statusLabel(r.status) : r[k])).join(","));
  return lines.join("\n") + "\n";
}
