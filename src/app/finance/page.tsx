import Link from "next/link";
import { refund, taskDone } from "@/app/actions/exceptions";
import { followUp } from "@/app/actions/reconciliation";
import { leave } from "@/app/actions/recovery";
import { Badge, Card, Empty, FeatureRef, Flash, HiddenBack, PageHeader, type SP } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { monthName, type Instalment } from "@/domain/recovery";
import { getToday } from "@/lib/context";
import { parseJson, prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { currentUrl } from "@/lib/url";
import { rupees } from "@/lib/view";

export default async function RecoveryTickets({ searchParams }: { searchParams: SP }) {
  const u = await requireUser(["FINANCE_NODAL"]);
  const [today, back] = await Promise.all([getToday(), currentUrl()]);
  // Officers retiring soon come first (E9), then the oldest tickets.
  const tickets = await prisma.ticket.findMany({ where: { status: "OPEN", assigneeId: u.id }, include: { lines: { include: { penalty: true } } }, orderBy: [{ priority: "desc" }, { createdOn: "asc" }] });
  const [refunds, tasks, other] = await Promise.all([
    prisma.refund.findMany({ where: { status: "DUE" }, include: { penalty: true } }),
    prisma.task.findMany({ where: { status: "OPEN", assigneeId: u.id }, orderBy: { createdOn: "asc" } }),
    prisma.user.findFirst({ where: { role: "FINANCE_NODAL", id: { not: u.id } } }),
  ]);

  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-92", "AMS-93"]} />
      <PageHeader title="Recovery tickets" subtitle={`${u.designation}. One ticket per officer, with one line for each UIN. Record each deduction with the payroll reference, salary month, amount, treasury voucher and proof. You cannot close a penalty or change its amount.`} />
      <Flash searchParams={searchParams} />
      <Card title={u.isBackup ? "Backup nodal officer" : "Primary nodal officer"} actions={<Badge tone={u.onLeave ? "amber" : "green"}>{u.onLeave ? "You are marked on leave" : "At work"}</Badge>}>
        <form action={leave} className="flex flex-wrap items-center gap-2 text-sm">
          <HiddenBack value={back} />
          <input type="hidden" name="onLeave" value={u.onLeave ? "0" : "1"} />
          <button className="btn-secondary btn-sm">{u.onLeave ? "I am back at work" : "Mark me on leave"}</button>
          <span className="muted">While the primary is on leave, tickets go to the backup. {other ? `${other.name} is ${other.onLeave ? "on leave" : "at work"}.` : ""}</span>
        </form>
      </Card>
      <Card title={`Your open tickets (${tickets.length})`}>
        {tickets.length === 0 ? <Empty>No tickets with you.</Empty> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Ticket</th><th>Officer</th><th>Items</th><th>Next deduction</th></tr></thead>
              <tbody>
                {tickets.map((t) => {
                  const next = parseJson<Instalment[]>(t.plan, [])[0];
                  return (
                    <tr key={t.id}>
                      <td><Link className="font-medium text-brand-700 hover:underline" href={`/finance/tickets/${t.id}`}>{t.ticketNo}</Link>{t.priority === "RETIREMENT" ? <> <Badge tone="red">retiring soon</Badge></> : null}</td>
                      <td>{t.lines[0]?.penalty.officerName}<div className="text-xs text-slate-500">{t.employeeId}</div></td>
                      <td>{t.lines.filter((l) => l.status === "ACTIVE").length} to deduct{t.lines.some((l) => l.status === "ON_HOLD") ? <> <Badge tone="amber">on hold</Badge></> : null}</td>
                      <td>{next ? <>{rupees(next.amount)} from {monthName(next.month)} salary <Badge tone={next.dueOn < today ? "red" : "grey"}>{next.dueOn < today ? "overdue" : `by ${formatDate(next.dueOn)}`}</Badge></> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Refunds to make">
        {refunds.length === 0 ? <Empty>No refunds due.</Empty> : (
          <ul className="space-y-2 text-sm">
            {refunds.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                <span><Link className="text-brand-700 hover:underline" href={`/penalties/${r.penaltyId}`}>{r.penalty.ref}</Link> · {r.penalty.officerName} ({r.penalty.employeeId}) · <strong>{rupees(r.amount)}</strong> · {r.reason === "DOUBLE_RECOVERY" ? "paid through eGRAS and also deducted" : r.reason === "EXCESS_PAYMENT" ? "paid more than due" : r.reason === "SET_ASIDE" ? "penalty set aside" : "penalty reduced"}</span>
                <form action={refund} className="flex gap-1">
                  <HiddenBack value={back} /><input type="hidden" name="refundId" value={r.id} />
                  <input name="reference" className="input max-w-[12rem]" placeholder="Refund reference" aria-label="Refund reference" required />
                  <button className="btn-primary btn-sm" data-testid="record-refund">Record refund</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {tasks.length ? (
        <Card title="Follow-up tasks">
          <ul className="space-y-3 text-sm">
            {tasks.map((t) => (
              <li key={t.id} className="rounded-md border border-slate-200 p-2">
                <div>{formatDate(t.createdOn)} · {t.text}{t.dueOn ? <> <Badge tone={t.dueOn < today ? "red" : "amber"}>{t.dueOn < today ? "escalated" : `by ${formatDate(t.dueOn)}`}</Badge></> : null}</div>
                {t.kind === "STOP_DEDUCTION" ? (
                  <form action={taskDone} className="mt-2">
                    <HiddenBack value={back} /><input type="hidden" name="taskId" value={t.id} />
                    <button className="btn-secondary btn-sm" data-testid="stop-done">Deduction stopped</button>
                  </form>
                ) : null}
                {t.kind === "CREDIT_FOLLOW_UP" ? (
                  <form action={followUp} className="mt-2 flex flex-wrap gap-2">
                    <HiddenBack value={back} />
                    <input type="hidden" name="taskId" value={t.id} />
                    <input name="note" className="input max-w-md" placeholder="What the treasury said" aria-label="Follow-up note" required />
                    <button className="btn-secondary btn-sm" data-testid="follow-up">Record follow-up</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
