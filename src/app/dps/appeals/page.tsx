import Link from "next/link";
import { reply } from "@/app/actions/appeals";
import { Badge, Card, Empty, FeatureRef, Flash, HiddenBack, PageHeader, Planned, type SP } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { currentUrl } from "@/lib/url";
import { appealStatusLabel, appealStatusTone, GROUND_LABELS } from "@/lib/view";
import { FILED_LIVE } from "@/services/appeals";

export default async function DpsAppeals({ searchParams }: { searchParams: SP }) {
  const u = await requireUser(["DPS", "LINK_OFFICER"]);
  const back = await currentUrl();
  const [appeals, directions] = await Promise.all([
    prisma.appeal.findMany({
      where: { status: { in: FILED_LIVE }, application: { OR: [{ dpsId: u.id }, { linkOfficerId: u.id }] } },
      include: { application: { include: { service: true } }, replies: true },
      orderBy: { filedOn: "asc" },
    }),
    prisma.direction.findMany({ where: { assigneeId: u.id }, include: { appeal: { include: { application: true } } }, orderBy: { dueOn: "asc" } }),
  ]);
  const open = directions.filter((d) => d.status === "OPEN");

  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-39", "AMS-40", "AMS-41", "AMS-101", "AMS-102"]} />
      <PageHeader title="Appeals and directions" subtitle="Appeals on your applications, where you are the respondent, and orders directing you to deliver." />
      <Flash searchParams={searchParams} />
      <Card title="Directions to deliver">
        {open.length === 0 ? <Empty>No open directions.</Empty> : (
          <ul className="space-y-2 text-sm">
            {open.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-200 bg-sky-50 p-2">
                <span>Order in {d.appeal.appealNo}: deliver by <strong>{formatDate(d.dueOn, true)}</strong></span>
                <Link href={`/dps/applications/${d.applicationId}`} className="btn-primary btn-sm">Record delivery</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Appeals where you are the respondent">
        {appeals.length === 0 ? <Empty>No open appeals on your applications.</Empty> : (
          <ul className="space-y-3">
            {appeals.map((a) => {
              const r = a.replies.find((x) => !x.submittedOn);
              const given = a.replies.find((x) => x.submittedOn);
              return (
                <li key={a.id} className="rounded-md border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><strong>{a.appealNo}</strong> · {a.application.service.name} · {GROUND_LABELS[a.ground]}</span>
                    <Badge tone={appealStatusTone(a.status)}>{appealStatusLabel(a.status)}</Badge>
                  </div>
                  <p className="mt-1 text-slate-600">Grounds: {a.groundsText}</p>
                  {r ? (
                    <form action={reply} className="mt-2 space-y-2">
                      <HiddenBack value={back} />
                      <input type="hidden" name="appealId" value={a.id} />
                      <label className="label" htmlFor={`reply-${a.id}`}>Your reply (due {formatDate(r.dueOn)})</label>
                      <textarea id={`reply-${a.id}`} name="text" rows={3} className="input" required placeholder="Explain the reason for the delay or the rejection, and when the service will be delivered." />
                      <button className="btn-primary btn-sm">Send reply</button>
                    </form>
                  ) : given ? <p className="mt-1 text-emerald-700">Reply given on {formatDate(given.submittedOn)}.</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Planned milestone="M4">missed directions reopening the appeal, and the closure certificate.</Planned>
    </div>
  );
}
