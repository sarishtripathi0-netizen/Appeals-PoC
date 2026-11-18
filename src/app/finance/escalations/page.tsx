import Link from "next/link";
import { StatementList } from "@/components/StatementView";
import { Badge, Card, Empty, FeatureRef, PageHeader } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { monthName, type Instalment } from "@/domain/recovery";
import { parseJson, prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { rupees } from "@/lib/view";

export default async function FinanceEscalations() {
  const u = await requireUser(["FINANCE_SENIOR"]);
  const [tickets, credits, nodal] = await Promise.all([
    prisma.ticket.findMany({ where: { status: "OPEN", escalatedOn: { not: null } }, include: { lines: { include: { penalty: true } } }, orderBy: { escalatedOn: "asc" } }),
    prisma.deduction.findMany({ where: { credit: { in: ["MISSING", "ESCALATED"] } }, include: { penalty: true }, orderBy: { recordedOn: "asc" } }),
    prisma.user.findMany({ where: { role: "FINANCE_NODAL" } }),
  ]);
  const name = new Map(nodal.map((x) => [x.id, x]));

  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-96", "E14", "E15"]} />
      <PageHeader title="Escalations" subtitle={`${u.designation}. Recovery tickets whose deduction was not recorded in time, and deductions not credited to the head of account.`} />
      <Card title={`Overdue recovery tickets (${tickets.length})`}>
        {tickets.length === 0 ? <Empty>No overdue tickets.</Empty> : (
          <ul className="space-y-2 text-sm">
            {tickets.map((t) => {
              const next = parseJson<Instalment[]>(t.plan, [])[0];
              const who = name.get(t.assigneeId);
              return (
                <li key={t.id} className="rounded-md border border-rose-200 bg-rose-50/50 p-2">
                  <Link className="font-medium text-brand-700 hover:underline" href={`/finance/tickets/${t.id}`}>{t.ticketNo}</Link> · {t.lines[0]?.penalty.officerName} ({t.employeeId}) · escalated {formatDate(t.escalatedOn)}
                  <div className="text-slate-600">With {who?.name}{who?.onLeave ? " (on leave)" : ""}{t.bothOnLeave ? <> <Badge tone="red">both nodal officers on leave</Badge></> : null}{next ? ` · now due: ${rupees(next.amount)} from ${monthName(next.month)} salary by ${formatDate(next.dueOn)}` : ""}</div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card title={`Credits not seen in the head of account (${credits.length})`}>
        {credits.length === 0 ? <Empty>None.</Empty> : (
          <ul className="space-y-1 text-sm">
            {credits.map((d) => (
              <li key={d.id}>
                <Badge tone="red">{d.credit === "ESCALATED" ? "Escalated" : "Missing"}</Badge> <Link className="text-brand-700 hover:underline" href={`/penalties/${d.penaltyId}`}>{d.penalty.ref}</Link> · {d.penalty.officerName} · voucher {d.voucherNo} · {rupees(d.amount)} · deducted {formatDate(d.recordedOn)}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <StatementList />
    </div>
  );
}
