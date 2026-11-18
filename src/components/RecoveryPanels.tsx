// Recovery screens shared by the Sewa Setu DDO, Finance and the penalty page (PLAN.md Part 2, §P6).

import Link from "next/link";
import { PAYROLL_LABELS, staffRecords } from "@/adapters/staff-records";
import { formatDate } from "@/domain/dates";
import { monthName, type Instalment } from "@/domain/recovery";
import { parseJson, prisma } from "@/lib/db";
import { rupees } from "@/lib/view";
import { amountsOf } from "@/services/penalties";
import { penaltyStatusLabel, penaltyTone, type LoadedPenalty } from "./PenaltyPanels";
import { Badge, Card, Empty, KV, type Tone } from "./ui";

export async function loadTicket(id: string) {
  return prisma.ticket.findUnique({ where: { id }, include: { lines: { include: { penalty: true }, orderBy: { addedOn: "asc" } } } });
}
export type LoadedTicket = NonNullable<Awaited<ReturnType<typeof loadTicket>>>;

export const LINE_LABELS: Record<string, [Tone, string]> = {
  ACTIVE: ["blue", "To deduct"],
  ON_HOLD: ["amber", "On hold (stay)"],
  REMOVED: ["grey", "Removed"],
  DONE: ["green", "Fully deducted"],
};

/** Ticket header: the officer from the staff records, the items, the total and the instalment plan (step 5). */
export async function TicketSummary({ t, today }: { t: LoadedTicket; today: string }) {
  const staff = await staffRecords.find(prisma, t.employeeId);
  const assignee = await prisma.user.findUnique({ where: { id: t.assigneeId } });
  const plan = parseJson<Instalment[]>(t.plan, []);
  const outstanding = await Promise.all(t.lines.map((l) => amountsOf(prisma, l.penalty)));
  const total = t.lines.reduce((s, l, i) => s + (l.status === "ACTIVE" || l.status === "ON_HOLD" ? outstanding[i].outstanding : 0), 0);
  const next = plan[0];
  return (
    <Card
      title={<span>Recovery ticket {t.ticketNo}</span>}
      actions={<div className="flex flex-wrap gap-1">
        {t.priority === "RETIREMENT" ? <Badge tone="red">Retiring soon: first in queue</Badge> : null}
        {t.escalatedOn && t.status === "OPEN" ? <Badge tone="red">Escalated {formatDate(t.escalatedOn)}</Badge> : null}
        {t.status === "CLOSED" ? <Badge tone="green">Closed {formatDate(t.closedOn)}</Badge> : next && next.dueOn < today ? <Badge tone="red">Deduction overdue</Badge> : <Badge tone="blue">Open</Badge>}
      </div>}
    >
      <KV items={[
        ["Employee ID", t.employeeId],
        ["Name", staff?.name ?? "Not found in staff records"],
        ["Designation", staff?.designation ?? "—"],
        ["Office", staff?.office ?? "—"],
        ["Monthly pay", staff ? rupees(staff.monthlyPay) : "—"],
        ["Payroll type", staff ? PAYROLL_LABELS[staff.payrollType] ?? staff.payrollType : "—"],
        ["Retirement date", formatDate(staff?.retirementOn)],
        ["With", `${assignee?.name ?? ""}${t.bothOnLeave ? " (both nodal officers on leave)" : ""}`],
        ["Total to recover", rupees(total)],
      ]} />
      <div className="mt-3 table-wrap">
        <table className="data">
          <thead><tr><th>Penalty</th><th>UIN</th><th>On the ticket</th><th>Still due</th><th>Line</th></tr></thead>
          <tbody>
            {t.lines.map((l, i) => (
              <tr key={l.id}>
                <td><Link className="text-brand-700 hover:underline" href={`/penalties/${l.penaltyId}`}>{l.penalty.ref}</Link></td>
                <td className="text-xs">{l.penalty.uin}</td>
                <td>{rupees(l.amount)}</td>
                <td>{rupees(outstanding[i].outstanding)}</td>
                <td><Badge tone={LINE_LABELS[l.status][0]}>{LINE_LABELS[l.status][1]}</Badge>{l.note ? <div className="text-xs text-slate-500">{l.note}</div> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {plan.length ? (
        <div className="mt-3 text-sm">
          <div className="font-medium">Instalment plan</div>
          <ul className="ml-5 list-disc">{plan.map((p) => <li key={p.month}>{monthName(p.month)} salary: {rupees(p.amount)}, to be recorded by {formatDate(p.dueOn)}</li>)}</ul>
        </div>
      ) : null}
    </Card>
  );
}

const VERIFY: Record<string, [Tone, string]> = { SUBMITTED: ["amber", "Awaiting verification"], VERIFIED: ["green", "Verified"], RETURNED: ["red", "Returned to Finance"] };
const CREDIT: Record<string, [Tone, string]> = { AWAITED: ["grey", "Credit awaited"], CREDITED: ["green", "Credited"], MISSING: ["red", "Credit missing"], ESCALATED: ["red", "Escalated"] };

export function DeductionsPanel({ p }: { p: LoadedPenalty }) {
  return (
    <Card title="Recovery from salary">
      {p.directions.length ? (
        <p className="mb-2 text-sm">Recovery Direction: {p.directions.map((d) => d.status === "IN_PLACE" ? `${d.mode === "STANDING" ? "standing order" : "signed by the Competent Authority"}, ${d.reference}` : `sent to the Competent Authority on ${formatDate(d.sentOn)}, awaiting signature`).join("; ")}</p>
      ) : null}
      {p.lines.length ? <p className="mb-2 text-sm">Ticket: {p.lines.map((l) => <Link key={l.id} className="text-brand-700 underline" href={`/finance/tickets/${l.ticketId}`}>{l.ticket.ticketNo}</Link>)}</p> : null}
      {p.deductions.length === 0 ? <Empty>No deductions yet.</Empty> : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Salary month</th><th>Amount</th><th>Payroll reference</th><th>Treasury voucher</th><th>Proof</th><th>Check</th><th>Credit</th></tr></thead>
            <tbody>
              {p.deductions.map((d) => (
                <tr key={d.id}>
                  <td>{monthName(d.salaryMonth)}{d.kind === "PENSION" ? " (pension)" : ""}</td>
                  <td>{rupees(d.amount)}</td>
                  <td className="text-xs">{d.payrollRef}</td>
                  <td className="text-xs">{d.voucherNo}</td>
                  <td className="text-xs">{d.proofFile}</td>
                  <td><Badge tone={VERIFY[d.verification][0]}>{VERIFY[d.verification][1]}</Badge>{d.returnReason ? <div className="text-xs text-rose-700">{d.returnReason}</div> : null}</td>
                  <td><Badge tone={CREDIT[d.credit][0]}>{CREDIT[d.credit][1]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={penaltyTone(status)}>{penaltyStatusLabel(status)}</Badge>;
}
