import { notFound } from "next/navigation";
import { officerQuery, stepDone } from "@/app/actions/applications";
import { ApplicationSummary, DocumentsPanel, HistoryPanel, loadApplication, QueriesPanel, SystemCheckPanel } from "@/components/ApplicationPanels";
import { Back, Card, FeatureRef, Flash, HiddenBack, type SP } from "@/components/ui";
import { getRuleContext } from "@/lib/context";
import { requireUser } from "@/lib/session";
import { currentUrl } from "@/lib/url";

export default async function DocumentCheck({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const u = await requireUser(["DEALING_ASSISTANT"]);
  const { id } = await params;
  const app = await loadApplication(id);
  if (!app || app.daId !== u.id) notFound();
  const [{ today, cal }, back] = await Promise.all([getRuleContext(), currentUrl()]);
  const atCheck = app.stage === "DA_VERIFY" && ["IN_PROGRESS", "HELD"].includes(app.status);
  const max = app.service.maxReverts;

  return (
    <div className="space-y-4">
      <Back href="/verify">Document checks</Back>
      <FeatureRef ids={["AMS-11", "COM-10"]} />
      <Flash searchParams={searchParams} />
      <ApplicationSummary app={app} today={today} cal={cal} />
      {atCheck ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Documents in order">
            <form action={stepDone} className="space-y-2">
              <HiddenBack value={back} />
              <input type="hidden" name="applicationId" value={app.id} />
              <label className="label" htmlFor="note">What you checked</label>
              <textarea id="note" name="note" rows={3} className="input" required placeholder="For example: Father's SC certificate SC/KMM/2016/001877 matches the e-District format; DOB proof checked." />
              <button className="btn-primary" data-testid="step-done">Send to the DPS for decision</button>
            </form>
          </Card>
          {app.status === "IN_PROGRESS" ? (
            <Card title="Revert to the applicant">
              <form action={officerQuery} className="space-y-2">
                <HiddenBack value={back} />
                <input type="hidden" name="applicationId" value={app.id} />
                <label className="label" htmlFor="items">What is deficient, one item per line (the applicant sees this)</label>
                <textarea id="items" name="items" rows={3} className="input" required />
                <p className="muted">The time limit pauses until the applicant replies.{max != null ? ` Reverted ${app.queryCount} of at most ${max} times.` : ""}</p>
                <button className="btn-secondary">Revert with reasons</button>
              </form>
            </Card>
          ) : null}
        </div>
      ) : (
        <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">{app.status === "AWAITING_CITIZEN" ? "Reverted to the applicant; waiting for the reply." : "The document check is done."}</p>
      )}
      <DocumentsPanel app={app} />
      <SystemCheckPanel app={app} />
      <QueriesPanel app={app} cal={cal} today={today} />
      <HistoryPanel caseRef={app.uin} entityIds={[app.id]} />
    </div>
  );
}
