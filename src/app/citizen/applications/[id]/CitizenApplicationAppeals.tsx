import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { checkFilingWindow } from "@/domain/rules";
import { getRuleContext } from "@/lib/context";
import { prisma } from "@/lib/db";
import { currentUrl } from "@/lib/url";
import { appealStatusLabel, appealStatusTone } from "@/lib/view";
import { FileAppealForm } from "../../FileAppealForm";

/** Appeals on one application, and the "start an appeal" form when the citizen may appeal and no appeal exists (AMS-24, 25). */
export async function CitizenApplicationAppeals({ applicationId }: { applicationId: string }) {
  const app = await prisma.application.findUnique({ where: { id: applicationId }, include: { appeals: { orderBy: { appealNo: "asc" } }, service: true } });
  if (!app) return null;
  const [{ today, cal, settings }, back] = await Promise.all([getRuleContext(), currentUrl()]);
  const ground = app.status === "REJECTED" ? "REJECTION" : app.heldOn ? "DELAY" : null;
  const canStart = ground && !app.appeals.some((a) => a.level === "FAA");
  const w = canStart ? checkFilingWindow("FAA", (ground === "DELAY" ? app.heldOn : app.rejectedOn)!, today, settings, cal) : null;
  if (!app.appeals.length && !canStart) return null;

  return (
    <Card title="Appeals">
      {app.appeals.length ? (
        <ul className="mb-3 space-y-1 text-sm">
          {app.appeals.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/citizen/appeals/${a.id}`} className="font-medium text-brand-700 hover:underline">{a.appealNo}</Link>
              <Badge tone={appealStatusTone(a.status)}>{appealStatusLabel(a.status)}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
      {canStart && w && w.status !== "NOT_ALLOWED" ? (
        <>
          <p className="mb-2 text-sm">
            {ground === "REJECTION" ? "Your application was rejected. You can appeal to the First Appellate Authority" : "The time limit has passed. You can appeal to the First Appellate Authority"}
            {w.status === "IN_TIME" ? ` until ${formatDate(w.windowEndsOn)}.` : "; the filing window has closed, so give a reason for the delay."}
          </p>
          <FileAppealForm
            applicationId={app.id}
            ground={ground}
            groundsText={ground === "REJECTION" ? `My application for ${app.service.name} (UIN ${app.uin}) was rejected on ${formatDate(app.rejectedOn)} with the reasons: "${app.rejectionReasons}". I believe the rejection is not correct because ` : ""}
            reliefSought={ground === "REJECTION" ? "Set the rejection aside and direct the office to deliver the service." : "Direct the office to deliver the service."}
            lateSince={w.status === "LATE_NEEDS_REASON" ? w.windowEndsOn : null}
            back={back}
            label="File a first appeal"
          />
        </>
      ) : null}
    </Card>
  );
}
