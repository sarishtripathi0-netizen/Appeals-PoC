import Link from "next/link";
import { Badge, Card, Empty, FeatureRef, Flash, PageHeader, type SP } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { getRuleContext } from "@/lib/context";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { applicationTimer, appStatusLabel, appStatusTone, timeLimitOf } from "@/lib/view";

export default async function DocumentChecks({ searchParams }: { searchParams: SP }) {
  const u = await requireUser(["DEALING_ASSISTANT"]);
  const { today, cal } = await getRuleContext();
  const apps = await prisma.application.findMany({
    where: { daId: u.id, stage: "DA_VERIFY", status: { in: ["IN_PROGRESS", "HELD", "AWAITING_CITIZEN"] } },
    include: { service: true },
    orderBy: { dueOn: "asc" },
  });

  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-10", "COM-10"]} />
      <PageHeader title="Document checks" subtitle="Check the documents the applicant uploaded, then send the application to the DPS for decision, or revert it to the applicant. The time limit keeps running while it is with you." />
      <Flash searchParams={searchParams} />
      <Card>
        {apps.length === 0 ? <Empty>No applications waiting for a document check.</Empty> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>UIN</th><th>Service</th><th>Due by</th><th>Timer</th><th>Status</th></tr></thead>
              <tbody>
                {apps.map((a) => {
                  const t = applicationTimer(a, timeLimitOf(a), today, cal);
                  return (
                    <tr key={a.id}>
                      <td><Link href={`/verify/${a.id}`} className="font-medium text-brand-700 hover:underline">{a.uin}</Link></td>
                      <td>{a.service.name}</td>
                      <td>{formatDate(a.dueOn)}</td>
                      <td><Badge tone={t.tone}>{t.text}</Badge></td>
                      <td><Badge tone={appStatusTone(a.status)}>{appStatusLabel(a.status)}</Badge></td>
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
