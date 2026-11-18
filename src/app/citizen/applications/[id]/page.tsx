import { notFound } from "next/navigation";
import { addDocument, citizenConfirm, replyToQuery, submit } from "@/app/actions/applications";
import { ApplicationSummary, DocumentsPanel, HistoryPanel, loadApplication, QueriesPanel, SystemCheckPanel } from "@/components/ApplicationPanels";
import { Back, Badge, Card, FeatureRef, Flash, HiddenBack, type SP, type Tone } from "@/components/ui";
import { checklistStatus, totalFee, type DocStatus, type SystemCheck } from "@/domain/service-config";
import { getT } from "@/i18n";
import { getRuleContext } from "@/lib/context";
import { parseJson } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { currentUrl } from "@/lib/url";
import { rupees } from "@/lib/view";
import { configOf } from "@/services/applications";
import { CitizenApplicationAppeals } from "./CitizenApplicationAppeals";

const DOC_BADGE: Record<DocStatus, [Tone, string]> = {
  FETCHED: ["green", "Fetched from Government records: no upload needed"],
  ATTACHED: ["green", "Attached"],
  NOT_NEEDED: ["grey", "Not needed (alternative provided)"],
  MISSING: ["amber", "Required"],
  OPTIONAL: ["grey", "Optional"],
};

export default async function CitizenApplication({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const u = await requireUser(["CITIZEN", "CALL_CENTRE"]);
  const { t } = await getT();
  const { id } = await params;
  const app = await loadApplication(id);
  if (!app || (u.role === "CITIZEN" && app.citizenId !== u.id)) notFound();
  const [{ today, cal }, back] = await Promise.all([getRuleContext(), currentUrl()]);
  const cfg = configOf(app.service);
  const sysCheck = parseJson<SystemCheck | null>(app.systemCheck, null);
  const attached = new Map(app.documents.map((d) => [d.name, d]));
  const { rows, complete } = checklistStatus(cfg.docs, sysCheck, new Set(attached.keys()));
  const fee = totalFee(cfg.fees);
  const openQuery = app.infoRequests.find((r) => !r.respondedOn);

  return (
    <div className="space-y-4">
      <Back href={u.role === "CITIZEN" ? "/citizen" : "/callcentre"}>{t("nav.home")}</Back>
      <FeatureRef ids={["AMS-04", "AMS-05", "AMS-09", "AMS-11", "AMS-104", "COM-10"]} />
      <Flash searchParams={searchParams} />
      <ApplicationSummary app={app} today={today} cal={cal} />

      {app.status === "DRAFT" ? (
        <Card title={t("docs.title")}>
          {sysCheck ? <p className="muted mb-2">Sewa Setu has checked Government records (Aadhaar, PAN, the e-District certificate repository). Upload only what could not be fetched.</p> : null}
          <ul className="divide-y divide-slate-100">
            {rows.map(({ item, status }) => {
              const d = attached.get(item.name);
              const [tone, label] = DOC_BADGE[status];
              const canAdd = status !== "FETCHED";
              return (
                <li key={item.name} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div className="max-w-xl">
                    <span className="font-medium">{item.name}</span> <Badge tone={tone}>{label}</Badge>
                    {status === "FETCHED" && item.fetch ? <div className="text-xs text-emerald-700">From {sysCheck?.sources[item.fetch]}</div> : null}
                    {d ? <div className="text-xs text-emerald-700">{d.source === "LIVE_CAPTURE" ? "Captured" : t("docs.attached")}: {d.fileName}</div> : null}
                    {item.help ? <div className="text-xs text-slate-500">{item.help}</div> : null}
                  </div>
                  {canAdd ? (
                    item.live ? (
                      <form action={addDocument}>
                        <HiddenBack value={back} />
                        <input type="hidden" name="applicationId" value={app.id} />
                        <input type="hidden" name="name" value={item.name} />
                        <input type="hidden" name="source" value="LIVE_CAPTURE" />
                        <button className="btn-secondary btn-sm" data-testid="capture-photo">{d ? "Capture again" : "Capture live photo (demo camera)"}</button>
                      </form>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <form action={addDocument} className="flex items-center gap-1">
                          <HiddenBack value={back} />
                          <input type="hidden" name="applicationId" value={app.id} />
                          <input type="hidden" name="name" value={item.name} />
                          <input type="hidden" name="source" value="UPLOAD" />
                          <input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" className="max-w-[12rem] text-xs" aria-label={`File for ${item.name}`} />
                          <button className="btn-secondary btn-sm">{t("docs.upload")}</button>
                        </form>
                        <form action={addDocument}>
                          <HiddenBack value={back} />
                          <input type="hidden" name="applicationId" value={app.id} />
                          <input type="hidden" name="name" value={item.name} />
                          <input type="hidden" name="source" value="DIGILOCKER_MOCK" />
                          <button className="btn-secondary btn-sm">{t("docs.digilocker")}</button>
                        </form>
                      </div>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
          <form action={submit} className="mt-4 flex flex-wrap items-center gap-3">
            <HiddenBack value={back} />
            <input type="hidden" name="applicationId" value={app.id} />
            <button className="btn-primary" data-testid="submit-application">{fee ? `Pay ${rupees(fee)} (eGRAS, demo) and submit` : t("docs.submit")}</button>
            {!complete ? <span className="muted">{t("docs.incomplete")}</span> : null}
          </form>
          {fee ? <p className="muted mt-2">{cfg.fees.map((f) => `${f.label} ${rupees(f.amount)}`).join(" + ")}.</p> : null}
        </Card>
      ) : (
        <DocumentsPanel app={app} />
      )}

      {openQuery && app.status === "AWAITING_CITIZEN" ? (
        <Card title={t("query.title")} className="border-sky-300">
          <ul className="ml-5 list-disc text-sm">{parseJson<string[]>(openQuery.items, []).map((x, i) => <li key={i}>{x}</li>)}</ul>
          <p className="muted mt-2">{t("query.paused")}</p>
          <form action={replyToQuery} className="mt-3 space-y-2">
            <HiddenBack value={back} />
            <input type="hidden" name="applicationId" value={app.id} />
            <label className="label" htmlFor="response">Your reply</label>
            <textarea id="response" name="response" rows={3} className="input" required placeholder="For example: I have uploaded a clear copy." />
            <button className="btn-primary">{t("query.reply")}</button>
          </form>
        </Card>
      ) : null}

      {app.status === "DELIVERED" ? (
        <Card title={t("confirm.title")} className="border-emerald-300">
          <p className="text-sm">The office says the service was delivered on the date shown above (reference {app.deliveryRef}).</p>
          <form action={citizenConfirm} className="mt-3">
            <HiddenBack value={back} />
            <input type="hidden" name="applicationId" value={app.id} />
            <button className="btn-primary">{t("confirm.yes")}</button>
          </form>
        </Card>
      ) : null}

      <SystemCheckPanel app={app} />
      <CitizenApplicationAppeals applicationId={app.id} />
      <QueriesPanel app={app} cal={cal} today={today} />
      <HistoryPanel caseRef={app.uin} entityIds={[app.id]} />
    </div>
  );
}
