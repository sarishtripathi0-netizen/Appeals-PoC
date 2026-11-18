// Case-view tools shared by the FAA/SAA and Commission screens: hearings, the order builder, delay split, missed deadlines.

import Link from "next/link";
import { hearing, hearingRecord, orderSave } from "@/app/actions/appeals";
import { nextWorkingDayOnOrAfter, type Calendar } from "@/domain/calendar";
import { formatDate } from "@/domain/dates";
import type { Attribution } from "@/domain/ledger";
import { LEVEL_NAMES } from "@/domain/numbering";
import { penaltyKey, templateFor, templatesFor, type PenaltyLine, type Position } from "@/domain/orders";
import { earliestHearingDate } from "@/domain/rules";
import type { Level, Settings } from "@/domain/settings";
import { parseJson } from "@/lib/db";
import { appealStatusLabel, appealStatusTone, rupees } from "@/lib/view";
import { IN_PERSON_REASONS } from "@/services/appeals";
import type { PenaltyCandidate } from "@/services/orders";
import type { LoadedAppeal } from "./AppealPanels";
import { Badge, Card, Empty, HiddenBack } from "./ui";

export const CAPACITY: Record<string, string> = { DPS: "DPS", LINK_OFFICER: "Link Officer", SUCCESSOR: "Successor", FAA: "First Appellate Authority", SAA: "Second Appellate Authority" };

export function DelayPanel({ attribution, names, ground }: { attribution: Attribution[]; names: Map<string, string>; ground: string }) {
  const top = attribution[0];
  return (
    <Card title="Who held the case during the delay">
      {attribution.length === 0 ? <Empty>No delay days to attribute{ground === "REJECTION" ? " (appeal against rejection)" : ""}.</Empty> : (
        <ul className="space-y-1 text-sm">
          {attribution.map((a) => (
            <li key={a.officerId + a.capacity} className="flex justify-between gap-2">
              <span>{names.get(a.officerId)} ({CAPACITY[a.capacity]})</span>
              <span><strong>{a.delayDays}</strong> working day{a.delayDays === 1 ? "" : "s"} {a === top ? <Badge tone="amber">most delay</Badge> : null}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function MissedDeadlinesPanel({ missed, names, appealNos }: { missed: { id: string; level: string; authorityId: string; deadlineOn: string; detectedOn: string; appealId: string }[]; names: Map<string, string>; appealNos: Map<string, string> }) {
  if (missed.length === 0) return null;
  return (
    <Card title="Missed deadlines on record" className="border-rose-200">
      <ul className="space-y-1 text-sm">
        {missed.map((m) => (
          <li key={m.id}>
            <Badge tone="red">{m.level}</Badge> {names.get(m.authorityId)} did not decide {appealNos.get(m.appealId)} by {formatDate(m.deadlineOn)} (recorded {formatDate(m.detectedOn)}).
          </li>
        ))}
      </ul>
      <p className="muted mt-2">The Commission can penalise an appellate authority for a missed deadline.</p>
    </Card>
  );
}

/** Every appeal on the application, so an officer sees the whole chain. */
export function AppealChain({ appeals, currentId, hrefFor }: { appeals: { id: string; appealNo: string; level: string; status: string; origin: string }[]; currentId: string; hrefFor: (a: { id: string; level: string }) => string | null }) {
  if (appeals.length < 2) return null;
  return (
    <Card title="All appeals on this application">
      <ul className="space-y-1 text-sm">
        {appeals.map((a) => {
          const href = hrefFor(a);
          return (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{a.id === currentId ? <strong>{a.appealNo} (this appeal)</strong> : href ? <Link className="text-brand-700 hover:underline" href={href}>{a.appealNo}</Link> : a.appealNo} · {LEVEL_NAMES[a.level as Level]}</span>
              <span className="flex gap-1">{a.origin === "AUTO_ESCALATED" ? <Badge tone="red">moved up</Badge> : null}<Badge tone={appealStatusTone(a.status)}>{appealStatusLabel(a.status)}</Badge></span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function HearingTools({ appeal, today, s, cal, noDigitalAccess, back, canSchedule, canRecord }: {
  appeal: LoadedAppeal; today: string; s: Settings; cal: Calendar; noDigitalAccess: boolean; back: string; canSchedule: boolean; canRecord: boolean;
}) {
  const scheduled = appeal.hearings.find((h) => h.status === "SCHEDULED");
  if (!["UNDER_REVIEW", "HEARING_SCHEDULED"].includes(appeal.status) || (!canSchedule && !(canRecord && scheduled))) return null;
  const earliest = nextWorkingDayOnOrAfter(earliestHearingDate(today, s.hearingNoticeClearDays, cal), cal);
  return (
    <Card title={scheduled ? "Hearing" : "Fix a hearing"}>
      {scheduled && canRecord ? (
        scheduled.scheduledOn <= today ? (
          <form action={hearingRecord} className="mb-4 space-y-2 rounded-md border border-slate-200 p-3">
            <HiddenBack value={back} />
            <input type="hidden" name="hearingId" value={scheduled.id} />
            <div className="font-medium">Record the hearing of {formatDate(scheduled.scheduledOn)}</div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-1"><input type="checkbox" name="citizen" defaultChecked /> Citizen attended</label>
              <label className="flex items-center gap-1"><input type="checkbox" name="dps" defaultChecked /> DPS attended</label>
            </div>
            <textarea name="notes" rows={2} className="input" placeholder="Notes of the hearing" aria-label="Hearing notes" />
            <button className="btn-primary">Record hearing</button>
          </form>
        ) : <p className="muted mb-3">The hearing on {formatDate(scheduled.scheduledOn)} can be recorded on or after that date.</p>
      ) : null}
      {canSchedule ? (
        <form action={hearing} className="grid gap-3 sm:grid-cols-2">
          <HiddenBack value={back} />
          <input type="hidden" name="appealId" value={appeal.id} />
          <div>
            <label className="label" htmlFor="date">Date</label>
            <input id="date" name="date" type="date" min={today} defaultValue={earliest} className="input" required />
            <p className="muted mt-1">Earliest date with {s.hearingNoticeClearDays} clear working days&apos; notice: {formatDate(earliest, true)}.</p>
          </div>
          <div>
            <label className="label" htmlFor="timeSlot">Time</label>
            <select id="timeSlot" name="timeSlot" className="input">{["10:30", "11:00", "12:00", "14:30", "15:30"].map((t) => <option key={t}>{t}</option>)}</select>
          </div>
          <div>
            <span className="label">Mode</span>
            <label className="mr-4 text-sm"><input type="radio" name="mode" value="ONLINE" defaultChecked={!noDigitalAccess} /> Online (default)</label>
            <label className="text-sm"><input type="radio" name="mode" value="IN_PERSON" defaultChecked={noDigitalAccess} /> In person</label>
            {noDigitalAccess ? <p className="mt-1 text-xs text-amber-800">This citizen is recorded as having no digital access.</p> : null}
          </div>
          <div>
            <label className="label" htmlFor="inPersonReason">Reason for in person</label>
            <select id="inPersonReason" name="inPersonReason" className="input" defaultValue={noDigitalAccess ? IN_PERSON_REASONS[0] : ""}>
              <option value="">—</option>
              {IN_PERSON_REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="shortNoticeReason">Reason for shorter notice (only if the date is earlier)</label>
            <input id="shortNoticeReason" name="shortNoticeReason" className="input" />
          </div>
          <div><button className="btn-primary" data-testid="schedule-hearing">{scheduled ? "Adjourn to this date" : "Fix hearing and serve notice"}</button></div>
        </form>
      ) : null}
    </Card>
  );
}

export function OrderBuilder({ appeal, s, candidates, attribution, names, back, decided }: {
  appeal: LoadedAppeal; s: Settings; candidates: PenaltyCandidate[]; attribution: Attribution[]; names: Map<string, string>; back: string;
  /** The bench decision, for Commission orders. */
  decided?: Position | null;
}) {
  const level = appeal.level as Level;
  const draft = appeal.orders.find((o) => o.status === "DRAFT");
  const plan = parseJson<PenaltyLine[]>(draft?.penaltyPlan, []);
  const templates = templatesFor(level, appeal.ground).filter((t) => !decided || t.position === decided);
  const tpl = templateFor(draft?.templateCode ?? "") ?? templates[0];
  const lines = level === "TAA" ? 3 : 1;
  const suggested = attribution[0];
  const defaults = plan.length ? plan.map((p) => penaltyKey(p.officerId, p.capacity)) : suggested ? [penaltyKey(suggested.officerId, suggested.capacity)] : [];
  const rangeText = Object.entries(s.penaltyRanges[level] ?? {}).map(([k, r]) => `${k === "DPS" ? "DPS" : k} ${rupees(r![0])}–${rupees(r![1])}`).join("; ");

  return (
    <Card title={draft ? `Order builder: draft ${draft.orderNo}` : "Order builder"}>
      <div id="order" />
      <p className="muted mb-3">
        An order needs findings and reasons, and must decide on a penalty: impose one, or record why none is imposed.
        {decided ? ` The bench decided to ${decided.toLowerCase()}; only matching templates are offered.` : ""}
      </p>
      <form action={orderSave} className="space-y-3">
        <HiddenBack value={back} />
        <input type="hidden" name="appealId" value={appeal.id} />
        <div>
          <label className="label" htmlFor="templateCode">Template</label>
          <select id="templateCode" name="templateCode" className="input" defaultValue={tpl?.code}>{templates.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}</select>
        </div>
        <div>
          <label className="label" htmlFor="findings">Findings</label>
          <textarea id="findings" name="findings" rows={3} className="input" defaultValue={draft?.findings ?? tpl?.findings} required />
        </div>
        <div>
          <label className="label" htmlFor="reasons">Reasons (required)</label>
          <textarea id="reasons" name="reasons" rows={3} className="input" defaultValue={draft?.reasons ?? tpl?.reasons} required />
        </div>
        <div>
          <label className="label" htmlFor="directionDays">Time to deliver (working days, if the order directs delivery)</label>
          <input id="directionDays" name="directionDays" type="number" min={1} max={60} className="input max-w-[8rem]" defaultValue={draft?.directionDays ?? s.defaultDirectionDays} />
        </div>
        <fieldset className="rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-sm font-semibold">Penalty</legend>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="penaltyChoice" value="impose" defaultChecked={!draft || plan.length > 0} /> Impose a penalty</label>
          <p className="muted pl-6">Ranges at this level: {rangeText}.</p>
          {Array.from({ length: lines }, (_, i) => (
            <div key={i} className="mt-2 grid gap-2 pl-6 sm:grid-cols-[1fr_10rem]">
              <div>
                <label className="label" htmlFor={`penaltyOfficer_${i}`}>{i === 0 ? "On" : "And on"}</label>
                <select id={`penaltyOfficer_${i}`} name={`penaltyOfficer_${i}`} className="input" defaultValue={defaults[i] ?? ""}>
                  {i > 0 ? <option value="">—</option> : null}
                  {candidates.map((c) => {
                    const a = attribution.find((x) => x.officerId === c.officerId && x.capacity === c.capacity);
                    return <option key={penaltyKey(c.officerId, c.capacity)} value={penaltyKey(c.officerId, c.capacity)}>{names.get(c.officerId)} ({CAPACITY[c.capacity]}){a ? `, ${a.delayDays} delay days` : c.capacity === "FAA" || c.capacity === "SAA" ? ", missed deadline" : ""}</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="label" htmlFor={`amount_${i}`}>Amount (Rs.)</label>
                <input id={`amount_${i}`} name={`amount_${i}`} type="number" min={1} className="input" defaultValue={plan[i]?.amount ?? ""} />
              </div>
            </div>
          ))}
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="radio" name="penaltyChoice" value="none" defaultChecked={!!draft && plan.length === 0} /> No penalty</label>
          <div className="mt-2 pl-6">
            <label className="label" htmlFor="noPenaltyReason">Reason for not imposing a penalty</label>
            <input id="noPenaltyReason" name="noPenaltyReason" className="input" defaultValue={draft?.noPenaltyReason ?? ""} />
          </div>
        </fieldset>
        <div>
          <label className="label" htmlFor="disciplinary">Recommendation for disciplinary action (optional)</label>
          <input id="disciplinary" name="disciplinary" className="input" defaultValue={draft?.disciplinaryRecommendation ?? ""} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" data-testid="save-order">Save draft and preview</button>
          {draft ? <Link href={`/doc/order/${draft.id}`} className="btn-secondary">Open preview</Link> : null}
        </div>
      </form>
    </Card>
  );
}
