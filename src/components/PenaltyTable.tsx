import Link from "next/link";
import { formatDate } from "@/domain/dates";
import { prisma } from "@/lib/db";
import { rupees } from "@/lib/view";
import { amountsOf } from "@/services/penalties";
import { penaltyStatusLabel, penaltyTone } from "./PenaltyPanels";
import { Badge, Empty } from "./ui";

/** A list of penalties for the oversight roles (Sewa Setu DDO, Finance, Commission). */
export async function PenaltyTable({ penalties }: { penalties: { id: string; ref: string; uin: string; officerName: string; employeeId: string; amount: number; dueOn: string; status: string }[] }) {
  if (penalties.length === 0) return <Empty>No penalties.</Empty>;
  const due = await Promise.all(penalties.map((p) => amountsOf(prisma, p)));
  return (
    <div className="table-wrap">
      <table className="data">
        <thead><tr><th>Penalty</th><th>Officer</th><th>UIN</th><th>Amount</th><th>Still due</th><th>Last date</th><th>Status</th></tr></thead>
        <tbody>
          {penalties.map((p, i) => (
            <tr key={p.id}>
              <td><Link className="font-medium text-brand-700 hover:underline" href={`/penalties/${p.id}`}>{p.ref}</Link></td>
              <td>{p.officerName}<div className="text-xs text-slate-500">{p.employeeId}</div></td>
              <td className="text-xs">{p.uin}</td>
              <td>{rupees(p.amount)}</td>
              <td>{rupees(due[i].outstanding)}</td>
              <td>{formatDate(p.dueOn)}</td>
              <td><Badge tone={penaltyTone(p.status)}>{penaltyStatusLabel(p.status)}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
