import Link from "next/link";
import { workingDaysBetween, type Calendar } from "@/domain/calendar";
import { formatDate } from "@/domain/dates";
import { STEPS, type FactKey, type FormField, type StepCode, type SystemCheck } from "@/domain/service-config";
import { prisma, parseJson } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/session";
import { applicationTimer, appStatusLabel, appStatusTone, timeLimitOf } from "@/lib/view";
import { Badge, Card, Empty, KV } from "./ui";

export async function loadApplication(id: string) {
  return prisma.application.findUnique({
    where: { id },
    include: { service: true, office: { include: { district: true } }, documents: true, infoRequests: { orderBy: { raisedOn: "asc" } }, ledger: { orderBy: { fromOn: "asc" } } },
  });
}
export type LoadedApplication = NonNullable<Awaited<ReturnType<typeof loadApplication>>>;

async function names(ids: (string | null | undefined)[]) {
  const users = await prisma.user.findMany({ where: { id: { in: ids.filter((x): x is string => !!x) } } });
  return new Map(users.map((u) => [u.id, u]));
}

export async function ApplicationSummary({ app, today, cal }: { app: LoadedApplication; today: string; cal: Calendar }) {
  const people = await names([app.citizenId, app.dpsId, app.faaId, app.saaId, app.daId]);
  const form = parseJson<Record<string, string>>(app.formData, {});
  const extra = parseJson<FormField[]>(app.service.formFields, []).filter((f) => form[f.key]);
  const timer = applicationTimer(app, timeLimitOf(app), today, cal);
  const step = app.stage ? STEPS[app.stage as StepCode] : null;
  const who = (id: string) => {
    const u = people.get(id);
    return u ? `${u.name}, ${u.designation ?? ""}` : "—";
  };
  return (
    <Card title={<span>{app.service.name} <span className="text-sm font-normal text-slate-500">{app.uin ?? "(not yet submitted)"}</span></span>}
      actions={<div className="flex flex-wrap gap-1"><Badge tone={appStatusTone(app.status)}>{appStatusLabel(app.status)}</Badge>{step && ["IN_PROGRESS", "HELD"].includes(app.status) ? <Badge tone="blue">{step.waitingText}</Badge> : null}<Badge tone={timer.tone}>{timer.text}</Badge></div>}>
      {app.status === "HELD" ? (
        <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-900">
          This application is on hold because the time limit has passed and an appeal may be filed or is open. It cannot be closed or rejected now; the service can still be delivered.
        </p>
      ) : null}
      <KV items={[
        ["Applicant", `${form.applicantName ?? people.get(app.citizenId)?.name ?? ""}`],
        ...extra.map((f) => [f.label, form[f.key]] as [string, string]),
        ["Office", `${app.office.name}, ${app.office.district.name}`],
        ["Submitted on", formatDate(app.submittedOn)],
        ["Time limit", `${timeLimitOf(app)} working days${app.pausedWorkingDays ? ` (+${app.pausedWorkingDays} paused)` : ""}`],
        ["Due by", formatDate(app.dueOn, true)],
        ["Designated Public Servant (DPS)", who(app.dpsId)],
        ["First Appellate Authority (FAA)", who(app.faaId)],
        ["Second Appellate Authority (SAA)", who(app.saaId)],
        ...(app.daId ? [["Dealing Assistant", who(app.daId)] as [string, string]] : []),
        ...(app.feeRef ? [["Fee paid", `eGRAS ref. ${app.feeRef}`] as [string, string]] : []),
        ...(app.deliveredOn ? [["Delivered on", `${formatDate(app.deliveredOn)} · ref. ${app.deliveryRef}`] as [string, string]] : []),
        ...(app.rejectedOn ? [["Rejected on", `${formatDate(app.rejectedOn)} · ${app.rejectionReasons}`] as [string, string]] : []),
        ...(app.confirmedOn ? [["Receipt confirmed", `${formatDate(app.confirmedOn)} (${app.confirmedVia === "CALL_CENTRE" ? "through the call centre" : "on the portal"})`] as [string, string]] : []),
      ]} />
      {app.uin ? <p className="mt-3 text-sm"><Link className="text-brand-700 underline" href={`/ack/${app.id}`}>Acknowledgement (Form 1)</Link></p> : null}
    </Card>
  );
}

export function DocumentsPanel({ app }: { app: LoadedApplication }) {
  return (
    <Card title="Documents">
      {app.documents.length === 0 ? <Empty>No documents attached.</Empty> : (
        <ul className="space-y-1 text-sm">
          {app.documents.map((d) => (
            <li key={d.id} className="flex flex-wrap justify-between gap-2"><span>{d.name}</span><span className="text-slate-500">{d.fileName} {d.source === "DIGILOCKER_MOCK" ? <Badge tone="blue">DigiLocker</Badge> : d.source === "LIVE_CAPTURE" ? <Badge tone="blue">Live capture</Badge> : null}</span></li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const FACT_LABELS: Record<FactKey, string> = {
  DOB: "Date of birth",
  RESIDENCE: "Residence in Assam",
  FATHER_SC_CERT: "Father's Scheduled Caste certificate",
  RELATIONSHIP: "Relationship to the father",
};

/** What the system confirmed from Government records before the application reached an officer. */
export function SystemCheckPanel({ app }: { app: LoadedApplication }) {
  const c = parseJson<SystemCheck | null>(app.systemCheck, null);
  if (!c) return null;
  return (
    <Card title="System check against Government records">
      <ul className="space-y-1 text-sm">
        {(Object.keys(FACT_LABELS) as FactKey[]).map((k) => (
          <li key={k} className="flex flex-wrap justify-between gap-2">
            <span>{FACT_LABELS[k]}</span>
            {c.sources[k] ? <Badge tone="green">Confirmed: {c.sources[k]}</Badge> : <Badge tone="amber">Not confirmed from records</Badge>}
          </li>
        ))}
      </ul>
      {c.notes.length ? <ul className="muted mt-2 ml-5 list-disc">{c.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
    </Card>
  );
}

export function QueriesPanel({ app, cal, today }: { app: LoadedApplication; cal: Calendar; today: string }) {
  if (app.infoRequests.length === 0) return null;
  return (
    <Card title="Requests for information (timer pauses)">
      <ol className="space-y-3 text-sm">
        {app.infoRequests.map((r, i) => (
          <li key={r.id} className="rounded-md border border-slate-200 p-2">
            <div className="font-medium">Request {i + 1} · raised {formatDate(r.raisedOn)}</div>
            <ul className="ml-5 list-disc">{parseJson<string[]>(r.items, []).map((x, j) => <li key={j}>{x}</li>)}</ul>
            {r.secondRequestReason ? <p className="mt-1 text-slate-600">Reason for a further request: {r.secondRequestReason}</p> : null}
            <p className="mt-1 text-slate-600">
              {r.respondedOn
                ? `Citizen replied ${formatDate(r.respondedOn)}: “${r.response}”. Timer paused for ${workingDaysBetween(r.raisedOn, r.respondedOn, cal)} working days.`
                : `Waiting for the citizen. Paused so far: ${workingDaysBetween(r.raisedOn, today, cal)} working days.`}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export async function LedgerPanel({ app }: { app: LoadedApplication }) {
  const people = await names(app.ledger.map((l) => l.officerId));
  return (
    <Card title="Responsibility ledger (who held this case)">
      {app.ledger.length === 0 ? <Empty>Starts when the application is submitted.</Empty> : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Officer</th><th>Capacity</th><th>From</th><th>To</th><th>Basis</th></tr></thead>
            <tbody>
              {app.ledger.map((l) => (
                <tr key={l.id}>
                  <td>{people.get(l.officerId)?.name}</td>
                  <td>{l.capacity === "LINK_OFFICER" ? "Link Officer" : l.capacity === "SUCCESSOR" ? "Successor" : "DPS"}</td>
                  <td>{formatDate(l.fromOn)}</td>
                  <td>{l.toOn ? formatDate(l.toOn) : "still holding"}</td>
                  <td>{l.source === "HANDOVER" ? "Handover by Head of Office" : l.source === "TRANSFER" ? "Transfer" : "Assignment"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export async function HistoryPanel({ caseRef, entityIds = [] }: { caseRef: string | null; entityIds?: string[] }) {
  const events = await prisma.auditEvent.findMany({
    where: { OR: [...(caseRef ? [{ caseRef }] : []), { entityId: { in: entityIds } }] },
    orderBy: { id: "asc" },
  });
  return (
    <Card title="History" actions={caseRef ? <Link href={`/audit?case=${encodeURIComponent(caseRef)}`} className="text-sm text-brand-700 underline">Full audit log</Link> : null}>
      {events.length === 0 ? <Empty>No events yet.</Empty> : (
        <ol className="space-y-1 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-2">
              <span className="w-24 shrink-0 text-slate-500">{formatDate(e.simDate)}</span>
              <span className={e.outcome === "REFUSED" ? "text-rose-700" : ""}>
                {e.outcome === "REFUSED" ? `Refused: ${describeAttempt(e.action)}` : describeAction(e.action)}
              </span>
              <span className="text-slate-500">by {e.actorName} ({ROLE_LABELS[e.actorRole] ?? e.actorRole})</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

const ACTION_TEXT: Record<string, string> = {
  "application.createDraft": "Application started",
  "application.submit": "Application submitted; UIN issued and timer started",
  "application.raiseQuery": "Request for information sent; timer paused",
  "application.respondQuery": "Citizen replied; timer resumed",
  "application.deliver": "Service delivered",
  "application.reject": "Application rejected",
  "application.close": "Application closed",
  "application.breach": "Time limit passed; application put on hold",
  "application.release": "Application released from hold",
  "application.confirm": "Citizen confirmed receipt",
  "application.flagToHoO": "Kept on hold and flagged to the Head of Office",
  "application.setAside": "Rejection set aside by order; application back on hold for delivery",
  "handover.record": "Link Officer handover recorded",
  "application.step": "Internal step completed",
  "appeal.draft": "First appeal drafted and link sent to the citizen",
  "appeal.file": "Appeal filed",
  "appeal.decline": "Citizen declined the draft appeal",
  "appeal.lapse": "Draft appeal link expired",
  "appeal.acceptLate": "Late filing accepted",
  "appeal.refuseLate": "Late filing not accepted; appeal closed",
  "appeal.reply": "DPS replied to the appeal",
  "appeal.scheduleHearing": "Hearing fixed and notice served",
  "appeal.adjournHearing": "Hearing adjourned to a new date",
  "appeal.recordHearing": "Hearing held and recorded",
  "appeal.draftOrder": "Order drafted",
  "appeal.editOrder": "Draft order changed",
  "appeal.sign": "Order signed with e-Sign and issued",
  "appeal.deliveryRecorded": "Delivery recorded under the order",
  "appeal.confirm": "Citizen confirmed receipt; appeal closed",
  "appeal.escalate": "Deadline missed; moved to the next level (missed deadline recorded)",
  "appeal.escalatedIn": "Arrived from the lower authority after a missed deadline",
  "appeal.extend": "Time to decide extended once, with reasons",
  "appeal.admit": "Admitted by the Registrar; bench constituted",
  "appeal.return": "Returned to the citizen for correction",
  "appeal.rejectScrutiny": "Not admitted by the Registrar",
  "appeal.refile": "Corrected and filed again",
  "appeal.vote": "Bench member voted",
  "appeal.castingVote": "Chief Commissioner gave the casting vote",
  "appeal.authenticate": "Order authenticated by the Registrar and issued",
  "appeal.remand": "Sent back by the Commission (remand) with a new deadline",
  "appeal.remandMissed": "Remand deadline missed; case back with the Commission",
  "appeal.reopen": "Reopened before the Commission",
};

export function describeAttempt(a: string): string {
  const [entity, verb] = a.split(".");
  return `attempt to ${verb.replace(/([A-Z])/g, " $1").toLowerCase()} the ${entity}`;
}

export function describeAction(a: string): string {
  return ACTION_TEXT[a] ?? a.replace(/^[a-z]+\./, "").replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}
