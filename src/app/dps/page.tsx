import Link from "next/link";
import { Badge, Card, Empty, FeatureRef, Flash, PageHeader, Stat, type SP } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { STEPS, type StepCode } from "@/domain/service-config";
import { getRuleContext } from "@/lib/context";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { applicationTimer, timeLimitOf, appStatusLabel, appStatusTone } from "@/lib/view";

const ACTIVE = ["IN_PROGRESS", "AWAITING_CITIZEN", "HELD"];

export default async function DpsWorklist({ searchParams }: { searchParams: SP }) {
  const u = await requireUser(["DPS", "LINK_OFFICER"]);
  const { today, cal } = await getRuleContext();
  // The worklist is whatever the ledger says this officer holds today (a Link Officer sees cases only during a handover).
  const held = await prisma.ledgerEntry.findMany({
    where: { officerId: u.id, fromOn: { lte: today }, OR: [{ toOn: null }, { toOn: { gte: today } }], application: { status: { in: ACTIVE } } },
    include: { application: { include: { service: true } } },
  });
  const apps = held.map((h) => h.application).sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""));
  const recent = await prisma.application.findMany({
    where: { OR: [{ dpsId: u.id }, { ledger: { some: { officerId: u.id } } }], status: { notIn: [...ACTIVE, "DRAFT"] } },
    include: { service: true },
    orderBy: { submittedOn: "desc" },
    take: 10,
  });
  const timers = new Map(apps.map((a) => [a.id, applicationTimer(a, timeLimitOf(a), today, cal)]));

  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-10", "AMS-13", "AMS-113"]} />
      <PageHeader title="Your worklist" subtitle="Applications you hold today, with the time left on each. A request for information pauses the timer." />
      <Flash searchParams={searchParams} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="In your worklist" value={apps.length} />
        <Stat label="Due in 2 working days or less" value={apps.filter((a) => timers.get(a.id)?.tone === "amber").length} tone="amber" />
        <Stat label="Waiting for the citizen" value={apps.filter((a) => a.status === "AWAITING_CITIZEN").length} />
        <Stat label="On hold (time limit passed)" value={apps.filter((a) => a.status === "HELD").length} tone="red" />
      </div>
      <Card title="Applications">
        {apps.length === 0 ? <Empty>Nothing in your worklist today.</Empty> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>UIN</th><th>Service</th><th>Due by</th><th>Timer</th><th>Status</th></tr></thead>
              <tbody>
                {apps.map((a) => (
                  <tr key={a.id}>
                    <td><Link href={`/dps/applications/${a.id}`} className="font-medium text-brand-700 hover:underline">{a.uin}</Link></td>
                    <td>{a.service.name}</td>
                    <td>{formatDate(a.dueOn)}</td>
                    <td><Badge tone={timers.get(a.id)!.tone}>{timers.get(a.id)!.text}</Badge></td>
                    <td><Badge tone={appStatusTone(a.status)}>{appStatusLabel(a.status)}</Badge>{a.stage && a.stage !== "DPS_DECISION" ? <> <Badge tone="blue">{STEPS[a.stage as StepCode].waitingText}</Badge></> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Recently finished">
        {recent.length === 0 ? <Empty>None yet.</Empty> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {recent.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/dps/applications/${a.id}`} className="text-brand-700 hover:underline">{a.uin} · {a.service.name}</Link>
                <Badge tone={appStatusTone(a.status)}>{appStatusLabel(a.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
