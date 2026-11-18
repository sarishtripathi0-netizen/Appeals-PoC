import Link from "next/link";
import { notFound } from "next/navigation";
import { decline, file, refile } from "@/app/actions/appeals";
import { HistoryPanel } from "@/components/ApplicationPanels";
import { AppealSummary, HearingsPanel, loadAppeal, OrdersPanel } from "@/components/AppealPanels";
import { Back, Card, FeatureRef, Flash, HiddenBack, type SP } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { checkFilingWindow } from "@/domain/rules";
import type { Level } from "@/domain/settings";
import { AUTHORITY_NAME, LEVEL_SHORT, NEXT_LEVEL } from "@/services/appeals";
import { getRuleContext } from "@/lib/context";
import { requireUser } from "@/lib/session";
import { currentUrl } from "@/lib/url";
import { FileAppealForm } from "../../FileAppealForm";

export default async function CitizenAppeal({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const u = await requireUser(["CITIZEN", "CALL_CENTRE"]);
  const { id } = await params;
  const appeal = await loadAppeal(id);
  if (!appeal || (u.role === "CITIZEN" && appeal.application.citizenId !== u.id)) notFound();
  const [{ today, cal, settings }, back] = await Promise.all([getRuleContext(), currentUrl()]);
  const level = appeal.level as Level;
  const w = appeal.windowStartOn ? checkFilingWindow(level, appeal.windowStartOn, today, settings, cal) : null;
  const canRefile = (appeal.status === "LAPSED" || appeal.status === "DECLINED") && w && w.status !== "NOT_ALLOWED";
  // AMS-74, 77: after a decision that left the service undelivered, the citizen can go to the next level.
  const next = NEXT_LEVEL[level];
  const child = next ? appeal.application.appeals.find((a) => a.level === next) : undefined;
  const delivered = ["DELIVERED", "DELIVERED_CONFIRMED"].includes(appeal.application.status);
  const nextWindow = next && !child && !delivered && appeal.status === "CLOSED" && appeal.decidedOn ? checkFilingWindow(next, appeal.decidedOn, today, settings, cal) : null;

  return (
    <div className="space-y-4">
      <Back href="/citizen">Home</Back>
      <FeatureRef ids={["AMS-18", "AMS-20", "AMS-21", "AMS-22", "AMS-27", "AMS-30", "AMS-47", "AMS-68", "AMS-74", "AMS-77"]} />
      <Flash searchParams={searchParams} />

      {appeal.status === "DRAFT" ? (
        <Card title="Your draft appeal is ready" className="border-amber-300">
          <p className="text-sm">Sewa Setu prepared this appeal because {appeal.ground === "DELAY" ? "your service was not delivered within its time limit" : "your application was rejected"}. Nothing is filed until you choose. You can file it as it is, change the wording first, or decline it.</p>
          <form action={file} className="mt-3">
            <HiddenBack value={back} />
            <input type="hidden" name="applicationId" value={appeal.applicationId} />
            <input type="hidden" name="level" value={appeal.level} />
            <button className="btn-primary" data-testid="file-one-click">File this appeal now</button>
          </form>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-brand-700">Edit draft appeal and file</summary>
            <div className="mt-2"><FileAppealForm applicationId={appeal.applicationId} level={level} groundsText={appeal.groundsText ?? ""} reliefSought={appeal.reliefSought ?? ""} back={back} label="File with my changes" /></div>
          </details>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-rose-700">I do not want to appeal</summary>
            <form action={decline} className="mt-2 space-y-2">
              <HiddenBack value={back} />
              <input type="hidden" name="appealId" value={appeal.id} />
              <label className="label" htmlFor="reason">Reason (optional)</label>
              <input id="reason" name="reason" className="input" placeholder="For example: I no longer need the certificate" />
              <button className="btn-danger">Decline the draft</button>
            </form>
          </details>
        </Card>
      ) : null}

      {canRefile ? (
        <Card title="You can still file this appeal">
          <FileAppealForm applicationId={appeal.applicationId} level={level} groundsText={appeal.groundsText ?? ""} reliefSought={appeal.reliefSought ?? ""} back={back}
            lateSince={w!.status === "LATE_NEEDS_REASON" ? w!.windowEndsOn : null} />
        </Card>
      ) : null}

      {appeal.status === "RETURNED" ? (
        <Card title="The Commission returned your appeal for correction" className="border-amber-300">
          <p className="text-sm">What to correct: <em>{appeal.scrutinyNote}</em></p>
          <form action={refile} className="mt-3 space-y-2">
            <HiddenBack value={back} />
            <input type="hidden" name="appealId" value={appeal.id} />
            <label className="label" htmlFor="refileGrounds">Corrected grounds</label>
            <textarea id="refileGrounds" name="groundsText" rows={4} className="input" defaultValue={appeal.groundsText ?? ""} required />
            <button className="btn-primary">File again</button>
          </form>
        </Card>
      ) : null}

      {child && next ? (
        <Card title={`Your ${LEVEL_SHORT[next]}`}>
          <p className="text-sm">This case continues as <Link className="text-brand-700 underline" href={`/citizen/appeals/${child.id}`}>{child.appealNo}</Link>{child.origin === "AUTO_ESCALATED" ? `, moved up automatically because the ${AUTHORITY_NAME[level]} missed its deadline` : ""}.</p>
        </Card>
      ) : null}

      {next && nextWindow && nextWindow.status !== "NOT_ALLOWED" ? (
        <Card title={`File a ${LEVEL_SHORT[next]} with the ${AUTHORITY_NAME[next]}`}>
          <p className="mb-2 text-sm">This appeal was decided but the service has not been delivered. {nextWindow.status === "IN_TIME" ? `You can appeal until ${formatDate(nextWindow.windowEndsOn)}.` : "The filing window has closed, so give a reason for the delay."}</p>
          <FileAppealForm applicationId={appeal.applicationId} level={next} groundsText={`${appeal.groundsText ?? ""} The ${AUTHORITY_NAME[level]} decided appeal ${appeal.appealNo}, but the service has still not been delivered.`}
            reliefSought={appeal.reliefSought ?? ""} back={back} lateSince={nextWindow.status === "LATE_NEEDS_REASON" ? nextWindow.windowEndsOn : null} label={`File the ${LEVEL_SHORT[next]}`} />
        </Card>
      ) : null}

      {appeal.status === "AWAITING_CONFIRMATION" ? (
        <Card title="Have you received the service?" className="border-emerald-300">
          <p className="text-sm">The office has recorded delivery. Please confirm on your <Link className="underline" href={`/citizen/applications/${appeal.applicationId}`}>application page</Link>. The appeal closes once you confirm.</p>
        </Card>
      ) : null}

      <AppealSummary appeal={appeal} today={today} cal={cal} />
      <HearingsPanel appeal={appeal} showJoin />
      <OrdersPanel appeal={appeal} />
      <HistoryPanel caseRef={appeal.appealNo} entityIds={[appeal.id]} />
    </div>
  );
}
