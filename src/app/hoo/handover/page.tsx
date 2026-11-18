import { handover } from "@/app/actions/applications";
import { Back, Badge, Card, Empty, FeatureRef, Flash, HiddenBack, PageHeader, type SP } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { getToday } from "@/lib/context";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { currentUrl } from "@/lib/url";

export default async function HandoverPage({ searchParams }: { searchParams: SP }) {
  const u = await requireUser(["HEAD_OF_OFFICE"]);
  const [today, back] = await Promise.all([getToday(), currentUrl()]);
  const officers = await prisma.user.findMany({ where: { officeId: u.officeId ?? "", role: { in: ["DPS", "LINK_OFFICER"] } }, orderBy: { name: "asc" } });
  const handovers = await prisma.handover.findMany({ where: { officeId: u.officeId ?? "" }, orderBy: { startOn: "desc" } });
  const name = new Map((await prisma.user.findMany({ where: { id: { in: handovers.flatMap((h) => [h.fromDpsId, h.toLinkOfficerId]) } } })).map((x) => [x.id, x.name]));
  const dpsList = officers.filter((o) => o.role === "DPS");
  const linkList = officers.filter((o) => o.role === "LINK_OFFICER");

  return (
    <div className="space-y-4">
      <Back href="/hoo">Dashboard</Back>
      <FeatureRef ids={["AMS-13", "AMS-38"]} />
      <PageHeader title="Link Officer handover" subtitle="When a DPS is away, record who holds the worklist and for which dates. The responsibility ledger of every affected application is updated, so any later penalty falls on the right officer." />
      <Flash searchParams={searchParams} />
      <Card title="Record a handover">
        {dpsList.length === 0 || linkList.length === 0 ? <Empty>This office needs a DPS and a Link Officer to record a handover.</Empty> : (
          <form action={handover} className="grid gap-3 sm:grid-cols-2">
            <HiddenBack value={back} />
            <div>
              <label className="label" htmlFor="fromDpsId">Designated Public Servant (DPS) who is away</label>
              <select id="fromDpsId" name="fromDpsId" className="input">{dpsList.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
            </div>
            <div>
              <label className="label" htmlFor="toLinkOfficerId">Link Officer who takes over</label>
              <select id="toLinkOfficerId" name="toLinkOfficerId" className="input">{linkList.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
            </div>
            <div>
              <label className="label" htmlFor="startOn">From</label>
              <input id="startOn" name="startOn" type="date" className="input" defaultValue={today} required />
            </div>
            <div>
              <label className="label" htmlFor="endOn">To (inclusive)</label>
              <input id="endOn" name="endOn" type="date" className="input" required />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="reason">Reason</label>
              <input id="reason" name="reason" className="input" placeholder="For example: earned leave" required />
              <p className="muted mt-1">A handover recorded after its start date is allowed but listed in the Commission&apos;s register for review.</p>
            </div>
            <div><button className="btn-primary">Record handover</button></div>
          </form>
        )}
      </Card>
      <Card title="Handovers in this office">
        {handovers.length === 0 ? <Empty>No handovers recorded.</Empty> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>DPS</th><th>Link Officer</th><th>Dates</th><th>Reason</th><th>Recorded</th></tr></thead>
              <tbody>
                {handovers.map((h) => (
                  <tr key={h.id}>
                    <td>{name.get(h.fromDpsId)}</td>
                    <td>{name.get(h.toLinkOfficerId)}</td>
                    <td>{formatDate(h.startOn)} to {formatDate(h.endOn)}</td>
                    <td>{h.reason}</td>
                    <td>{formatDate(h.recordedOn)} {h.recordedOn > h.startOn ? <Badge tone="amber">after the fact</Badge> : null}</td>
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
