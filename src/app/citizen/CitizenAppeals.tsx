import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { getT } from "@/i18n";
import { prisma } from "@/lib/db";
import { appealStatusLabel, appealStatusTone, GROUND_LABELS } from "@/lib/view";

/** Appeals section of the citizen dashboard (AMS-112): drafts waiting for the citizen first, then the rest. */
export async function CitizenAppeals({ citizenId }: { citizenId: string }) {
  const { t } = await getT();
  const appeals = await prisma.appeal.findMany({ where: { application: { citizenId } }, include: { application: { include: { service: true } } }, orderBy: { appealNo: "asc" } });
  if (appeals.length === 0) return null;
  const drafts = appeals.filter((a) => a.status === "DRAFT");
  const rest = appeals.filter((a) => a.status !== "DRAFT");
  return (
    <>
      {drafts.length ? (
        <Card title={t("citizen.draftsWaiting")} className="border-amber-300 bg-amber-50/60">
          <ul className="space-y-2 text-sm">
            {drafts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{a.application.service.name}</strong> ({a.application.uin}): {a.ground === "DELAY" ? "not delivered on time" : "rejected"}. Link valid until {formatDate(a.linkExpiresOn)}.
                </span>
                <Link href={`/citizen/appeals/${a.id}`} className="btn-primary btn-sm" data-testid="open-draft">Review and file</Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {rest.length ? (
        <Card title={t("citizen.yourAppeals")}>
          <ul className="divide-y divide-slate-100">
            {rest.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <Link href={`/citizen/appeals/${a.id}`} className="font-medium text-brand-700 hover:underline">{a.appealNo}</Link>
                  <div className="text-xs text-slate-500">{a.application.service.name} · {GROUND_LABELS[a.ground]}{a.deadlineOn && !a.decidedOn ? ` · decide by ${formatDate(a.deadlineOn)}` : ""}</div>
                </div>
                <Badge tone={appealStatusTone(a.status)}>{appealStatusLabel(a.status)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
