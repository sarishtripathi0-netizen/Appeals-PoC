import Link from "next/link";
import { formatDate } from "@/domain/dates";
import { monthName } from "@/domain/recovery";
import { statementTotals, type StatementRow } from "@/domain/statement";
import { parseJson, prisma } from "@/lib/db";
import { rupees } from "@/lib/view";
import { penaltyStatusLabel } from "./PenaltyPanels";
import { Badge, Card, Empty } from "./ui";

/** List of monthly statements, newest first (shared by the Sewa Setu DDO, Finance and the Commission). */
export async function StatementList() {
  const statements = await prisma.monthlyStatement.findMany({ orderBy: { month: "desc" } });
  return (
    <Card title="Monthly statements">
      <p className="muted mb-2">Generated on the first working day of each month for the month before.</p>
      {statements.length === 0 ? <Empty>No statement yet. The first one is generated on the first working day of next month.</Empty> : (
        <ul className="space-y-1 text-sm">
          {statements.map((s) => {
            const t = parseJson<ReturnType<typeof statementTotals>>(s.totals, statementTotals([]));
            return (
              <li key={s.month} className="flex flex-wrap items-center justify-between gap-2">
                <Link className="font-medium text-brand-700 hover:underline" href={`/statements/${s.month}`}>{monthName(s.month)}</Link>
                <span className="text-slate-600">{t.penalties} penalties · {rupees(t.credited)} credited {t.difference ? <Badge tone="red">{rupees(t.difference)} not credited</Badge> : null} · generated {formatDate(s.generatedOn)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function StatementTable({ rows }: { rows: StatementRow[] }) {
  if (rows.length === 0) return <Empty>No penalties in this month.</Empty>;
  const t = statementTotals(rows);
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr><th>Penalty</th><th>Officer</th><th>Imposed</th><th>Through eGRAS</th><th>From salary</th><th>Credited</th><th>Refunded</th><th>Written off</th><th>Difference</th><th>Outstanding</th><th>Status</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ref} className={r.difference ? "bg-rose-50/60" : ""}>
              <td className="font-medium">{r.ref}<div className="text-xs text-slate-500">{r.uin}</div></td>
              <td>{r.officerName}<div className="text-xs text-slate-500">{r.employeeId}</div></td>
              <td>{rupees(r.imposed)}</td>
              <td>{rupees(r.egras)}{r.grns.length ? <div className="text-xs text-slate-500">{r.grns.join(", ")}</div> : null}</td>
              <td>{rupees(r.deducted)}{r.vouchers.length ? <div className="text-xs text-slate-500">{r.vouchers.join(", ")}</div> : null}</td>
              <td>{rupees(r.credited)}</td>
              <td>{rupees(r.refunded)}</td>
              <td>{rupees(r.writtenOff)}</td>
              <td>{r.difference ? <strong className="text-rose-700">{rupees(r.difference)}</strong> : rupees(0)}</td>
              <td>{rupees(r.outstanding)}</td>
              <td className="text-xs">{penaltyStatusLabel(r.status)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td colSpan={2}>Total ({t.penalties})</td>
            <td>{rupees(t.imposed)}</td><td>{rupees(t.egras)}</td><td>{rupees(t.deducted)}</td><td>{rupees(t.credited)}</td>
            <td>{rupees(t.refunded)}</td><td>{rupees(t.writtenOff)}</td><td>{rupees(t.difference)}</td><td>{rupees(t.outstanding)}</td><td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
