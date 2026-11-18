import { notFound } from "next/navigation";
import { officerAct, officerQuery } from "@/app/actions/applications";
import { ApplicationSummary, DocumentsPanel, HistoryPanel, LedgerPanel, loadApplication, QueriesPanel, SystemCheckPanel } from "@/components/ApplicationPanels";
import { Back, Card, FeatureRef, Flash, HiddenBack, type SP } from "@/components/ui";
import { getRuleContext } from "@/lib/context";
import { requireUser } from "@/lib/session";
import { currentUrl } from "@/lib/url";

export default async function DpsApplication({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const u = await requireUser(["DPS", "LINK_OFFICER"]);
  const { id } = await params;
  const app = await loadApplication(id);
  if (!app || !(app.dpsId === u.id || app.linkOfficerId === u.id || app.ledger.some((l) => l.officerId === u.id))) notFound();
  const [{ today, cal }, back] = await Promise.all([getRuleContext(), currentUrl()]);
  const active = ["IN_PROGRESS", "AWAITING_CITIZEN", "HELD"].includes(app.status);

  return (
    <div className="space-y-4">
      <Back href="/dps">Worklist</Back>
      <FeatureRef ids={["AMS-11", "AMS-12", "AMS-16", "AMS-38"]} />
      <Flash searchParams={searchParams} />
      <ApplicationSummary app={app} today={today} cal={cal} />
      {app.stage === "DA_VERIFY" && active ? (
        <p className="rounded-md border border-sky-200 bg-sky-50 p-2 text-sm text-sky-900">The Dealing Assistant is checking the documents. You can issue or reject once the check is done; the time limit keeps running and remains your responsibility.</p>
      ) : null}

      {active ? (
        <div className="grid gap-4 md:grid-cols-2">
          {app.status === "IN_PROGRESS" ? (
            <Card title="Ask the citizen for information">
              <form action={officerQuery} className="space-y-2">
                <HiddenBack value={back} />
                <input type="hidden" name="applicationId" value={app.id} />
                <label className="label" htmlFor="items">Everything you need, one item per line</label>
                <textarea id="items" name="items" rows={3} className="input" required />
                {app.service.maxReverts != null ? (
                  <p className="muted">Reverted {app.queryCount} of at most {app.service.maxReverts} times (as notified).</p>
                ) : null}
                {app.service.maxReverts == null && app.queryCount >= 1 ? (
                  <>
                    <label className="label" htmlFor="secondReason">Reason for a further request (required)</label>
                    <input id="secondReason" name="secondReason" className="input" />
                  </>
                ) : null}
                <p className="muted">The time limit pauses until the citizen replies. Put all questions in one request; a second request needs a reason.</p>
                <button className="btn-secondary">Send request</button>
              </form>
            </Card>
          ) : null}
          <Card title="Deliver the service">
            <form action={officerAct} className="space-y-2">
              <HiddenBack value={back} />
              <input type="hidden" name="applicationId" value={app.id} />
              <input type="hidden" name="event" value="deliver" />
              <label className="label" htmlFor="ref">Certificate or document reference</label>
              <input id="ref" name="text" className="input" required placeholder="For example: PRC/DPR/2026/4411" />
              <button className="btn-primary" data-testid="deliver">Record delivery</button>
            </form>
          </Card>
          <Card title="Reject or close">
            <form action={officerAct} className="space-y-2">
              <HiddenBack value={back} />
              <input type="hidden" name="applicationId" value={app.id} />
              <label className="label" htmlFor="reasons">Reasons (the citizen will see these)</label>
              <textarea id="reasons" name="text" rows={3} className="input" />
              <div className="flex flex-wrap gap-2">
                <button name="event" value="reject" className="btn-danger" data-testid="reject">Reject</button>
                <button name="event" value="close" className="btn-danger" data-testid="close">Close</button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}

      <DocumentsPanel app={app} />
      <SystemCheckPanel app={app} />
      <QueriesPanel app={app} cal={cal} today={today} />
      <LedgerPanel app={app} />
      <HistoryPanel caseRef={app.uin} entityIds={[app.id]} />
    </div>
  );
}
