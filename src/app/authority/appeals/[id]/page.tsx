import { notFound } from "next/navigation";
import { extend, lateDecision } from "@/app/actions/appeals";
import { ApplicationSummary, DocumentsPanel, HistoryPanel, LedgerPanel, QueriesPanel } from "@/components/ApplicationPanels";
import { AppealSummary, HearingsPanel, loadAppeal, OrdersPanel, RepliesPanel } from "@/components/AppealPanels";
import { AppealChain, DelayPanel, HearingTools, MissedDeadlinesPanel, OrderBuilder } from "@/components/CaseTools";
import { Back, Card, FeatureRef, Flash, HiddenBack, type SP } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import type { Level } from "@/domain/settings";
import { getRuleContext } from "@/lib/context";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { currentUrl } from "@/lib/url";
import { delayAttribution, missedDeadlinesFor, penaltyCandidates } from "@/services/orders";

export default async function AuthorityAppeal({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const u = await requireUser(["FAA", "SAA"]);
  const { id } = await params;
  const appeal = await loadAppeal(id);
  if (!appeal || appeal.authorityId !== u.id) notFound();
  const [{ today, cal, settings: s }, back] = await Promise.all([getRuleContext(), currentUrl()]);
  const app = appeal.application;
  const level = appeal.level as Level;
  const missed = await missedDeadlinesFor(prisma, app.id);
  const candidates = penaltyCandidates(app.ledger, missed, level);
  const attribution = delayAttribution(app, app.ledger, today, cal);
  const people = await prisma.user.findMany({ where: { id: { in: [app.citizenId, ...candidates.map((c) => c.officerId), ...missed.map((m) => m.authorityId)] } } });
  const names = new Map(people.map((x) => [x.id, x.name]));
  const citizen = people.find((x) => x.id === app.citizenId);
  const canOrder = ["UNDER_REVIEW", "HEARING_SCHEDULED", "ORDER_DRAFTED"].includes(appeal.status);
  const canExtend = level === "SAA" && !appeal.extendedDeadlineOn && ["UNDER_REVIEW", "HEARING_SCHEDULED"].includes(appeal.status);

  return (
    <div className="space-y-4">
      <Back href="/authority/worklist">Appeals worklist</Back>
      <FeatureRef ids={["AMS-32", "AMS-35", "AMS-36", "AMS-37", "AMS-38", "AMS-43", "AMS-53", "AMS-59", "AMS-61", "AMS-70", "AMS-75", "AMS-76"]} />
      <Flash searchParams={searchParams} />
      {appeal.status === "ESCALATED" ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          This appeal was not decided by its deadline and has moved to the next level. The missed deadline is recorded against you; the Commission may impose a penalty for it.
        </p>
      ) : null}
      {appeal.remandCycle > 0 && appeal.remandDueOn ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">The Commission sent this appeal back to you (remand). Decide it again by <strong>{formatDate(appeal.remandDueOn, true)}</strong>, or it returns to the Commission.</p>
      ) : null}
      <AppealSummary appeal={appeal} today={today} cal={cal} />

      {appeal.status === "FILED_LATE" ? (
        <Card title="Filed late: accept the reason?" className="border-amber-300">
          <p className="text-sm">Reason given by the citizen: <em>{appeal.lateReason}</em></p>
          <form action={lateDecision} className="mt-3 space-y-2">
            <HiddenBack value={back} />
            <input type="hidden" name="appealId" value={appeal.id} />
            <label className="label" htmlFor="lateReasons">Your reasons (required if you do not accept)</label>
            <textarea id="lateReasons" name="reasons" rows={2} className="input" />
            <div className="flex flex-wrap gap-2">
              <button name="decision" value="accept" className="btn-primary">Accept and hear the appeal</button>
              <button name="decision" value="refuse" className="btn-danger">Do not accept</button>
            </div>
          </form>
        </Card>
      ) : null}

      {canExtend ? (
        <Card title="Extend the time to decide (once only)">
          <form action={extend} className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
            <HiddenBack value={back} />
            <input type="hidden" name="appealId" value={appeal.id} />
            <div>
              <label className="label" htmlFor="totalDays">Total days</label>
              <input id="totalDays" name="totalDays" type="number" min={s.saaDecisionDays + 1} max={s.saaMaxExtendedDays} defaultValue={s.saaMaxExtendedDays} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="extReason">Reason (recorded and sent to the citizen)</label>
              <input id="extReason" name="reason" className="input" required />
            </div>
            <button className="btn-secondary">Extend</button>
          </form>
          <p className="muted mt-2">Now {s.saaDecisionDays} days from filing; at most {s.saaMaxExtendedDays}.</p>
        </Card>
      ) : null}

      <ApplicationSummary app={app} today={today} cal={cal} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <QueriesPanel app={app} cal={cal} today={today} />
          <DocumentsPanel app={app} />
          <RepliesPanel appeal={appeal} />
          <AppealChain appeals={app.appeals} currentId={appeal.id} hrefFor={() => null} />
        </div>
        <div className="space-y-4">
          <LedgerPanel app={app} />
          <DelayPanel attribution={attribution} names={names} ground={appeal.ground} />
          <MissedDeadlinesPanel missed={missed} names={names} appealNos={new Map(app.appeals.map((a) => [a.id, a.appealNo]))} />
        </div>
      </div>

      <HearingTools appeal={appeal} today={today} s={s} cal={cal} noDigitalAccess={citizen?.hasDigitalAccess === false} back={back} canSchedule canRecord />
      {canOrder ? <OrderBuilder appeal={appeal} s={s} candidates={candidates} attribution={attribution} names={names} back={back} /> : null}

      <HearingsPanel appeal={appeal} />
      <OrdersPanel appeal={appeal} includeDrafts />
      <HistoryPanel caseRef={app.uin} entityIds={[app.id, ...app.appeals.map((a) => a.id)]} />
    </div>
  );
}
