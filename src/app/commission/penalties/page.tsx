import Link from "next/link";
import { PenaltyTable } from "@/components/PenaltyTable";
import { StatementList, StatementTable } from "@/components/StatementView";
import { Badge, Card, Empty, FeatureRef, PageHeader, Stat } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { statementRow, statementTotals } from "@/domain/statement";
import { getToday } from "@/lib/context";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { rupees } from "@/lib/view";

/** The Commission's monitoring view of penalties (AMS-99): ledger, overdue recoveries, missing credits, double recoveries, write-offs. */
export default async function PenaltyLedger() {
  await requireUser(["REGISTRAR", "COMMISSIONER", "CHIEF_COMMISSIONER"]);
  const today = await getToday();
  const [penalties, overdue, credits, doubles, writeOffs] = await Promise.all([
    prisma.penalty.findMany({ include: { grns: true, deductions: true, refunds: true, writeOffs: true }, orderBy: { ref: "asc" } }),
    prisma.ticket.findMany({ where: { status: "OPEN", escalatedOn: { not: null } }, include: { lines: { include: { penalty: true } } } }),
    prisma.deduction.findMany({ where: { credit: { in: ["MISSING", "ESCALATED"] } }, include: { penalty: true } }),
    prisma.penalty.findMany({ where: { doubleRecovery: true }, include: { refunds: true } }),
    prisma.writeOff.findMany({ include: { penalty: true }, orderBy: { requestedOn: "desc" } }),
  ]);
  const rows = penalties.map((p) => statementRow(p, today));
  const t = statementTotals(rows);

  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-99", "AMS-95", "E3", "E14", "E15", "E18"]} />
      <PageHeader title="Penalty ledger" subtitle={`Penalties under the Assam Right to Public Services (ARTPS) Act as on ${formatDate(today, true)}. Penalties go to a Government head of account, never to the citizen.`} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Imposed" value={rupees(t.imposed)} />
        <Stat label="Paid through eGRAS" value={rupees(t.egras)} />
        <Stat label="Recovered from salary" value={rupees(t.deducted)} />
        <Stat label="Credited to the head of account" value={rupees(t.credited)} />
        <Stat label="Outstanding" value={rupees(t.outstanding)} tone={t.outstanding ? "amber" : undefined} />
        <Stat label="Refunded" value={rupees(t.refunded)} />
        <Stat label="Written off" value={rupees(t.writtenOff)} />
        <Stat label="Collected, not yet credited" value={rupees(t.difference)} tone={t.difference ? "red" : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Overdue recoveries (${overdue.length})`}>
          {overdue.length === 0 ? <Empty>None.</Empty> : (
            <ul className="space-y-1 text-sm">{overdue.map((x) => <li key={x.id}><Badge tone="red">escalated {formatDate(x.escalatedOn)}</Badge> {x.ticketNo} · {x.lines[0]?.penalty.officerName} ({x.employeeId}){x.bothOnLeave ? " · both nodal officers on leave" : ""}</li>)}</ul>
          )}
        </Card>
        <Card title={`Missing credits (${credits.length})`}>
          {credits.length === 0 ? <Empty>None.</Empty> : (
            <ul className="space-y-1 text-sm">{credits.map((d) => <li key={d.id}><Badge tone="red">{d.credit === "ESCALATED" ? "escalated" : "missing"}</Badge> <Link className="text-brand-700 hover:underline" href={`/penalties/${d.penaltyId}`}>{d.penalty.ref}</Link> · voucher {d.voucherNo} · {rupees(d.amount)}</li>)}</ul>
          )}
        </Card>
        <Card title={`Double recoveries (${doubles.length})`}>
          {doubles.length === 0 ? <Empty>None.</Empty> : (
            <ul className="space-y-1 text-sm">{doubles.map((p) => <li key={p.id}><Link className="text-brand-700 hover:underline" href={`/penalties/${p.id}`}>{p.ref}</Link> · {p.officerName} · {p.refunds.map((r) => `${rupees(r.amount)} ${r.status === "REFUNDED" ? `refunded (${r.reference})` : "refund due"}`).join(", ")}</li>)}</ul>
          )}
        </Card>
        <Card title={`Write-offs (${writeOffs.length})`}>
          {writeOffs.length === 0 ? <Empty>None.</Empty> : (
            <ul className="space-y-1 text-sm">{writeOffs.map((w) => <li key={w.id}><Badge tone={w.status === "APPROVED" ? "grey" : w.status === "REJECTED" ? "red" : "amber"}>{w.status === "APPROVED" ? "approved" : w.status === "REJECTED" ? "not approved" : "awaiting approval"}</Badge> <Link className="text-brand-700 hover:underline" href={`/penalties/${w.penaltyId}`}>{w.penalty.ref}</Link> · {w.penalty.officerName} · {rupees(w.amount)} · {w.reason}</li>)}</ul>
          )}
        </Card>
      </div>
      <Card title="Ledger by penalty"><StatementTable rows={rows} /></Card>
      <StatementList />
      <Card title="All penalties"><PenaltyTable penalties={penalties} /></Card>
    </div>
  );
}
