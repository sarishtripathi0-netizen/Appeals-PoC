import Link from "next/link";
import { Badge, Card, Empty, FeatureRef, Flash, one, PageHeader, type SP } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { getRuleContext } from "@/lib/context";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { appealDeadlineView, appealStatusLabel, appealStatusTone, GROUND_LABELS } from "@/lib/view";

const PENDING = ["FILED_LATE", "UNDER_REVIEW", "HEARING_SCHEDULED", "ORDER_DRAFTED"];
const AFTER_ORDER = ["COMPLIANCE", "AWAITING_CONFIRMATION"];
const TABS = [
  { key: "pending", label: "To decide", statuses: PENDING },
  { key: "orders", label: "Order issued, waiting for delivery", statuses: AFTER_ORDER },
  { key: "escalated", label: "Escalated", statuses: [] as string[] },
  { key: "closed", label: "Closed", statuses: ["CLOSED"] },
];

export default async function AuthorityWorklist({ searchParams }: { searchParams: SP }) {
  const u = await requireUser(["FAA", "SAA"]);
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === one(sp.tab)) ?? TABS[0];
  const ground = one(sp.ground);
  const { today, cal } = await getRuleContext();
  const appeals = await prisma.appeal.findMany({
    // AMS-73: escalated appeals are listed apart: those that moved away from you, and those that moved up to you.
    where: tab.key === "escalated"
      ? { authorityId: u.id, OR: [{ status: "ESCALATED" }, { origin: "AUTO_ESCALATED" }] }
      : { authorityId: u.id, status: { in: tab.statuses }, ...(ground === "DELAY" || ground === "REJECTION" ? { ground } : {}) },
    include: { application: { include: { service: true } } },
    orderBy: [{ deadlineOn: "asc" }],
  });

  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-32", "AMS-33", "AMS-73", "AMS-75"]} />
      <PageHeader title="Appeals worklist" subtitle="Appeals come straight to you, with no dealing assistant in between. Oldest deadline first." />
      <Flash searchParams={searchParams} />
      <nav className="flex flex-wrap gap-2 text-sm">
        {TABS.map((t) => (
          <Link key={t.key} href={`/authority/worklist?tab=${t.key}`} className={`rounded-full border px-3 py-1 ${t.key === tab.key ? "border-brand-600 bg-brand-50 font-medium text-brand-800" : "border-slate-300 bg-white"}`}>{t.label}</Link>
        ))}
      </nav>
      <Card>
        {appeals.length === 0 ? <Empty>No appeals here.</Empty> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Appeal</th><th>Service</th><th>Ground</th><th>Filed</th><th>Deadline</th><th>Status</th></tr></thead>
              <tbody>
                {appeals.map((a) => {
                  const dv = appealDeadlineView(a.extendedDeadlineOn ?? a.deadlineOn, today, cal, !PENDING.includes(a.status));
                  return (
                    <tr key={a.id}>
                      <td><Link href={`/authority/appeals/${a.id}`} className="font-medium text-brand-700 hover:underline">{a.appealNo}</Link></td>
                      <td>{a.application.service.name}</td>
                      <td>{GROUND_LABELS[a.ground]}{a.origin === "AUTO_ESCALATED" ? <> <Badge tone="red">moved up to you</Badge></> : null}{a.status === "ESCALATED" ? <> <Badge tone="red">deadline missed</Badge></> : null}</td>
                      <td>{formatDate(a.filedOn)}{a.isLate ? <> <Badge tone="amber">late</Badge></> : null}</td>
                      <td><Badge tone={dv.tone}>{dv.text}</Badge></td>
                      <td><Badge tone={appealStatusTone(a.status)}>{appealStatusLabel(a.status)}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
