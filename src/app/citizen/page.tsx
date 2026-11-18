import Link from "next/link";
import { Badge, Card, Empty, FeatureRef, Flash, PageHeader, type SP } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { getT } from "@/i18n";
import { getRuleContext } from "@/lib/context";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { applicationTimer, timeLimitOf, appStatusLabel, appStatusTone } from "@/lib/view";
import { CitizenAppeals } from "./CitizenAppeals";

export default async function CitizenHome({ searchParams }: { searchParams: SP }) {
  const u = await requireUser(["CITIZEN"]);
  const { t } = await getT();
  const { today, cal } = await getRuleContext();
  const [apps, messages] = await Promise.all([
    prisma.application.findMany({ where: { citizenId: u.id }, include: { service: true }, orderBy: { createdOn: "desc" } }),
    prisma.notification.findMany({ where: { recipientId: u.id, channel: "DASHBOARD" }, orderBy: { seq: "desc" }, take: 8 }),
  ]);

  return (
    <div className="space-y-4">
      <FeatureRef ids={["COM-03", "AMS-112"]} />
      <PageHeader title={`${t("citizen.welcome")}, ${u.name}`} subtitle={t("citizen.intro")}
        actions={<Link href="/citizen/services" className="btn-primary">{t("nav.services")}</Link>} />
      <Flash searchParams={searchParams} />
      <CitizenAppeals citizenId={u.id} />
      <Card title={t("citizen.yourApplications")}>
        {apps.length === 0 ? <Empty>{t("citizen.noApplications")}</Empty> : (
          <ul className="divide-y divide-slate-100">
            {apps.map((a) => {
              const timer = applicationTimer(a, timeLimitOf(a), today, cal);
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/citizen/applications/${a.id}`} className="font-medium text-brand-700 hover:underline">{a.service.name}</Link>
                    <div className="text-xs text-slate-500">{a.uin ?? "Not submitted yet"}{a.dueOn ? ` · ${t("citizen.dueBy")} ${formatDate(a.dueOn)}` : ""}</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={appStatusTone(a.status)}>{appStatusLabel(a.status)}</Badge>
                    {a.submittedOn ? <Badge tone={timer.tone}>{timer.text}</Badge> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card title={t("citizen.messages")}>
        {messages.length === 0 ? <Empty>No messages yet.</Empty> : (
          <ul className="space-y-2 text-sm">
            {messages.map((m) => <li key={m.id}><span className="text-slate-500">{formatDate(m.sentOn)} · </span>{m.text}</li>)}
          </ul>
        )}
      </Card>
    </div>
  );
}
