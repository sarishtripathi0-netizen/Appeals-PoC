import Link from "next/link";
import { release } from "@/app/actions/appeals";
import { Badge, Card, Empty, FeatureRef, Flash, HiddenBack, PageHeader, Stat, type SP } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { getRuleContext } from "@/lib/context";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { currentUrl } from "@/lib/url";
import { applicationTimer, timeLimitOf } from "@/lib/view";
import { appealPossibleOrOpen } from "@/services/appeals";

export default async function HooDashboard({ searchParams }: { searchParams: SP }) {
  const u = await requireUser(["HEAD_OF_OFFICE"]);
  const [{ today, cal, settings }, back] = await Promise.all([getRuleContext(), currentUrl()]);
  const office = u.officeId ? await prisma.office.findUnique({ where: { id: u.officeId }, include: { district: true } }) : null;
  const apps = await prisma.application.findMany({
    where: { officeId: u.officeId ?? "", status: { in: ["IN_PROGRESS", "AWAITING_CITIZEN", "HELD"] } },
    include: { service: true, appeals: true },
    orderBy: { dueOn: "asc" },
  });
  const officers = await prisma.user.findMany({ where: { officeId: u.officeId ?? "", role: { in: ["DPS", "LINK_OFFICER"] } }, orderBy: { name: "asc" } });
  const flags = new Map((await prisma.delayFlag.findMany({ where: { officerId: { in: officers.map((o) => o.id) } } })).map((f) => [f.officerId, f]));
  const held = apps.filter((a) => a.status === "HELD");
  const perDps = officers.filter((o) => o.role === "DPS").map((o) => {
    const mine = apps.filter((a) => a.dpsId === o.id);
    return { o, total: mine.length, held: mine.filter((a) => a.status === "HELD").length, overdueSoon: mine.filter((a) => applicationTimer(a, timeLimitOf(a), today, cal).tone === "amber").length };
  });

  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-13", "AMS-23", "AMS-115", "AMS-116", "AMS-118"]} />
      <PageHeader title="Head of Office dashboard" subtitle={office ? `${office.name}, ${office.district.name}` : undefined}
        actions={<Link href="/hoo/handover" className="btn-primary">Record a Link Officer handover</Link>} />
      <Flash searchParams={searchParams} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Pending applications" value={apps.length} />
        <Stat label="On hold (time limit passed)" value={held.length} tone="red" />
        <Stat label="Flagged to you after decline or lapse" value={held.filter((a) => a.flaggedToHoO).length} tone="amber" />
      </div>
      <Card title="Pending applications per Designated Public Servant (DPS)">
        {perDps.length === 0 ? <Empty>No DPS in this office.</Empty> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Officer</th><th>Pending</th><th>Due in 2 days or less</th><th>On hold</th><th>Repeated delay (6 months)</th></tr></thead>
              <tbody>
                {perDps.map(({ o, total, held, overdueSoon }) => {
                  const f = flags.get(o.id);
                  return (
                    <tr key={o.id}>
                      <td>{o.name}<div className="text-xs text-slate-500">{o.designation}</div></td>
                      <td>{total}</td>
                      <td>{overdueSoon}</td>
                      <td>{held}</td>
                      <td>{f ? <Badge tone={f.isFlagged ? "red" : "grey"}>{`${f.delayed} of ${f.total} delayed (${Math.round(f.ratio * 100)}%)${f.isFlagged ? " · flagged" : ""}`}</Badge> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Applications on hold">
        {held.length === 0 ? <Empty>No application in this office is on hold.</Empty> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {held.map((a) => {
              const blocked = appealPossibleOrOpen(a, a.appeals, today, settings, cal);
              return (
                <li key={a.id} className="py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{a.uin} · {a.service.name} · held since {formatDate(a.heldOn)}</span>
                    {blocked ? <Badge tone="red">Appeal possible or open</Badge> : <Badge tone="amber">{a.flaggedToHoO ? "Flagged to you: " : ""}can be released</Badge>}
                  </div>
                  {!blocked ? (
                    <form action={release} className="mt-2 flex flex-wrap gap-2">
                      <HiddenBack value={back} />
                      <input type="hidden" name="applicationId" value={a.id} />
                      <input name="reason" className="input max-w-md" placeholder="Reason for releasing it to the DPS" aria-label={`Reason for releasing ${a.uin}`} required />
                      <button className="btn-secondary">Release to DPS</button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
