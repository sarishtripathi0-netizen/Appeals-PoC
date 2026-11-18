import { describeAction, describeAttempt } from "@/components/ApplicationPanels";
import { Badge, Card, Empty, FeatureRef, one, PageHeader, type SP } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { prisma } from "@/lib/db";
import { requireUser, ROLE_LABELS } from "@/lib/session";

const PAGE = 200;

export default async function AuditLog({ searchParams }: { searchParams: SP }) {
  await requireUser();
  const sp = await searchParams;
  const caseRef = one(sp.case)?.trim() ?? "";
  const actor = one(sp.actor)?.trim() ?? "";
  const refusedOnly = one(sp.refused) === "1";
  const events = await prisma.auditEvent.findMany({
    where: {
      ...(caseRef ? { caseRef: { contains: caseRef } } : {}),
      ...(actor ? { actorName: { contains: actor } } : {}),
      ...(refusedOnly ? { outcome: "REFUSED" } : {}),
    },
    orderBy: { id: "desc" },
    take: PAGE,
  });

  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-126", "COM-09"]} note="append-only: the database refuses edits and deletions" />
      <PageHeader title="Audit log" subtitle="Every action and every refused attempt, with the simulated date and the real time it was recorded. Entries can never be changed or deleted." />
      <Card>
        <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="case">UIN or appeal number</label>
            <input id="case" name="case" className="input" defaultValue={caseRef} />
          </div>
          <div>
            <label className="label" htmlFor="actor">Who</label>
            <input id="actor" name="actor" className="input" defaultValue={actor} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="refused" value="1" defaultChecked={refusedOnly} /> Refused only</label>
          <button className="btn-secondary">Filter</button>
        </form>
      </Card>
      <Card title={`Latest ${events.length} entries`}>
        {events.length === 0 ? <Empty>No matching entries.</Empty> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>#</th><th>Date (simulated)</th><th>Who</th><th>What</th><th>Case</th><th>Status</th></tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className={e.outcome === "REFUSED" ? "bg-rose-50/60" : ""}>
                    <td className="text-slate-500">{e.id}</td>
                    <td>{formatDate(e.simDate)}<div className="text-xs text-slate-400" title="Real time recorded">{e.realTs.slice(0, 19).replace("T", " ")}</div></td>
                    <td>{e.actorName}<div className="text-xs text-slate-500">{ROLE_LABELS[e.actorRole] ?? e.actorRole}</div></td>
                    <td>
                      {e.outcome === "REFUSED" ? <Badge tone="red">Refused</Badge> : null} {e.outcome === "REFUSED" ? describeAttempt(e.action) : describeAction(e.action)}
                      {e.details ? <details className="text-xs text-slate-500"><summary className="cursor-pointer">details</summary><pre className="whitespace-pre-wrap break-all">{e.details}</pre></details> : null}
                    </td>
                    <td className="text-xs">{e.caseRef ?? "—"}</td>
                    <td className="text-xs">{e.beforeStatus && e.afterStatus && e.beforeStatus !== e.afterStatus ? `${e.beforeStatus} → ${e.afterStatus}` : e.afterStatus ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
