import Link from "next/link";
import { Card, Empty, FeatureRef, Flash, PageHeader, Stat, type SP } from "@/components/ui";
import { addDays, formatDate } from "@/domain/dates";
import { getRuleContext } from "@/lib/context";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

const PENDING = ["FILED_LATE", "UNDER_REVIEW", "HEARING_SCHEDULED", "ORDER_DRAFTED"];

export default async function AuthorityDashboard({ searchParams }: { searchParams: SP }) {
  const u = await requireUser(["FAA", "SAA"]);
  const { today } = await getRuleContext();
  const [pending, hearings, messages, apps, missed] = await Promise.all([
    prisma.appeal.findMany({ where: { authorityId: u.id, status: { in: PENDING } } }),
    prisma.hearing.findMany({ where: { status: "SCHEDULED", appeal: { authorityId: u.id }, scheduledOn: { gte: today, lte: addDays(today, 14) } }, include: { appeal: true }, orderBy: { scheduledOn: "asc" } }),
    prisma.notification.findMany({ where: { recipientId: u.id, channel: "DASHBOARD" }, orderBy: { seq: "desc" }, take: 6 }),
    prisma.application.findMany({ where: { [u.role === "SAA" ? "saaId" : "faaId"]: u.id, status: { in: ["IN_PROGRESS", "AWAITING_CITIZEN", "HELD"] } }, select: { dpsId: true, status: true } }),
    prisma.missedDeadline.count({ where: { authorityId: u.id } }),
  ]);
  const overdue = pending.filter((a) => (a.extendedDeadlineOn ?? a.deadlineOn ?? "9999") < today);
  const dpsIds = [...new Set(apps.map((a) => a.dpsId))];
  const dpsNames = new Map((await prisma.user.findMany({ where: { id: { in: dpsIds } } })).map((x) => [x.id, x.name]));

  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-114", "AMS-115", "AMS-33", "AMS-42"]} />
      <PageHeader title="Appellate authority dashboard" subtitle="Appeals assigned to you, split by ground and by how they arrived."
        actions={<Link href="/authority/worklist" className="btn-primary">Open worklist</Link>} />
      <Flash searchParams={searchParams} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="To decide" value={pending.length} href="/authority/worklist" />
        <Stat label="Delay appeals" value={pending.filter((a) => a.ground === "DELAY").length} href="/authority/worklist?ground=DELAY" />
        <Stat label="Rejection appeals" value={pending.filter((a) => a.ground === "REJECTION").length} href="/authority/worklist?ground=REJECTION" />
        <Stat label="Past the deadline" value={overdue.length} tone="red" />
        <Stat label="Filed by citizens" value={pending.filter((a) => a.origin !== "AUTO_ESCALATED").length} />
        <Stat label="Moved up after a missed deadline" value={pending.filter((a) => a.origin === "AUTO_ESCALATED").length} href="/authority/worklist?tab=escalated" />
        <Stat label="Late filings to decide" value={pending.filter((a) => a.status === "FILED_LATE").length} tone="amber" />
        <Stat label="Hearings in the next 14 days" value={hearings.length} href="/authority/hearings" />
        <Stat label="Deadlines you missed (on record)" value={missed} tone={missed ? "red" : undefined} href="/authority/worklist?tab=escalated" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Coming hearings">
          {hearings.length === 0 ? <Empty>No hearings in the next 14 days.</Empty> : (
            <ul className="space-y-1 text-sm">
              {hearings.map((h) => <li key={h.id}><Link className="text-brand-700 hover:underline" href={`/authority/appeals/${h.appealId}`}>{formatDate(h.scheduledOn, true)} {h.timeSlot}</Link> · {h.appeal.appealNo}</li>)}
            </ul>
          )}
        </Card>
        <Card title="Pending applications per DPS (under you)">
          {dpsIds.length === 0 ? <Empty>None.</Empty> : (
            <ul className="space-y-1 text-sm">
              {dpsIds.map((id) => {
                const mine = apps.filter((a) => a.dpsId === id);
                return <li key={id} className="flex justify-between"><span>{dpsNames.get(id)}</span><span>{mine.length} pending, {mine.filter((a) => a.status === "HELD").length} on hold</span></li>;
              })}
            </ul>
          )}
        </Card>
      </div>
      <Card title="Recent alerts">
        {messages.length === 0 ? <Empty>No alerts.</Empty> : <ul className="space-y-1 text-sm">{messages.map((m) => <li key={m.id}><span className="text-slate-500">{formatDate(m.sentOn)} · </span>{m.text}</li>)}</ul>}
      </Card>
    </div>
  );
}
