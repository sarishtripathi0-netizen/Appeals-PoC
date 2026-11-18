import Link from "next/link";
import { notFound } from "next/navigation";
import { authenticate, scrutiny, vote } from "@/app/actions/appeals";
import { ApplicationSummary, DocumentsPanel, HistoryPanel, LedgerPanel, QueriesPanel } from "@/components/ApplicationPanels";
import { AppealSummary, HearingsPanel, loadAppeal, OrdersPanel, RepliesPanel } from "@/components/AppealPanels";
import { AppealChain, DelayPanel, HearingTools, MissedDeadlinesPanel, OrderBuilder } from "@/components/CaseTools";
import { Back, Badge, Card, Empty, FeatureRef, Flash, HiddenBack, type SP } from "@/components/ui";
import { POSITIONS, tallyVotes } from "@/domain/commission";
import { formatDate } from "@/domain/dates";
import { getRuleContext } from "@/lib/context";
import { parseJson, prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { currentUrl } from "@/lib/url";
import { delayAttribution, missedDeadlinesFor, penaltyCandidates } from "@/services/orders";

const POSITION_TEXT: Record<string, string> = { ALLOW: "Allow", DISMISS: "Dismiss", REMAND: "Remand" };

export default async function CommissionAppeal({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const u = await requireUser(["REGISTRAR", "COMMISSIONER", "CHIEF_COMMISSIONER"]);
  const { id } = await params;
  const appeal = await loadAppeal(id);
  if (!appeal || appeal.level !== "TAA") notFound();
  const [{ today, cal, settings: s }, back] = await Promise.all([getRuleContext(), currentUrl()]);
  const app = appeal.application;
  const members = parseJson<string[]>(appeal.bench?.memberIds, []);
  const isRegistrar = u.role === "REGISTRAR";
  const isMember = members.includes(u.id);
  const isPresiding = appeal.bench?.presidingId === u.id;
  const tally = tallyVotes(members, appeal.votes);
  const voting = ["UNDER_REVIEW", "HEARING_SCHEDULED"].includes(appeal.status);

  const missed = await missedDeadlinesFor(prisma, app.id);
  const candidates = penaltyCandidates(app.ledger, missed, "TAA");
  const attribution = delayAttribution(app, app.ledger, today, cal);
  const commissioners = await prisma.user.findMany({ where: { role: { in: ["CHIEF_COMMISSIONER", "COMMISSIONER"] } }, orderBy: [{ role: "asc" }, { name: "asc" }] });
  const people = await prisma.user.findMany({ where: { id: { in: [app.citizenId, ...candidates.map((c) => c.officerId), ...missed.map((m) => m.authorityId), ...commissioners.map((c) => c.id)] } } });
  const names = new Map(people.map((x) => [x.id, x.name]));
  const citizen = people.find((x) => x.id === app.citizenId);
  const mine = appeal.votes.find((v) => v.memberId === u.id && !v.isCasting);
  const awaiting = appeal.orders.find((o) => o.status === "SIGNED");

  return (
    <div className="space-y-4">
      <Back href="/commission/cases">Commission cases</Back>
      <FeatureRef ids={["AMS-78", "AMS-79", "AMS-80", "AMS-81", "AMS-82", "AMS-83", "AMS-84", "AMS-85"]} />
      <Flash searchParams={searchParams} />
      <AppealSummary appeal={appeal} today={today} cal={cal} />

      {appeal.status === "SCRUTINY" && isRegistrar ? (
        <Card title="Scrutiny" className="border-amber-300">
          {appeal.isLate ? <p className="mb-2 text-sm">Filed after the 90-day window. Reason: <em>{appeal.lateReason}</em>. Admitting the appeal accepts the reason.</p> : null}
          <form action={scrutiny} className="space-y-3">
            <HiddenBack value={back} />
            <input type="hidden" name="appealId" value={appeal.id} />
            <fieldset>
              <legend className="label">Bench (one or three Commissioners)</legend>
              <div className="flex flex-wrap gap-4 text-sm">
                {commissioners.map((c, i) => <label key={c.id} className="flex items-center gap-1"><input type="checkbox" name="members" value={c.id} defaultChecked={i < 3} /> {c.name}</label>)}
              </div>
            </fieldset>
            <div>
              <label className="label" htmlFor="presidingId">Presiding member</label>
              <select id="presidingId" name="presidingId" className="input max-w-sm">{commissioners.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </div>
            <div>
              <label className="label" htmlFor="reasons">Reasons (to return for correction or not to admit)</label>
              <input id="reasons" name="reasons" className="input" />
            </div>
            <div className="flex flex-wrap gap-2">
              <button name="decision" value="admit" className="btn-primary" data-testid="admit">Admit and assign bench</button>
              <button name="decision" value="return" className="btn-secondary">Return to the citizen</button>
              <button name="decision" value="reject" className="btn-danger">Do not admit</button>
            </div>
          </form>
        </Card>
      ) : null}
      {appeal.status === "RETURNED" ? <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">Returned to the citizen for correction: {appeal.scrutinyNote}</p> : null}

      {appeal.bench ? (
        <Card title="Bench and votes">
          <p className="text-sm">Constituted {formatDate(appeal.bench.constitutedOn)}: {members.map((m) => `${names.get(m)}${m === appeal.bench!.presidingId ? " (presiding)" : ""}`).join(", ")}.</p>
          {appeal.votes.length === 0 ? <div className="mt-2"><Empty>No votes yet.</Empty></div> : (
            <ul className="mt-2 space-y-1 text-sm">
              {appeal.votes.map((v) => (
                <li key={v.id}><strong>{names.get(v.memberId)}</strong>{v.isCasting ? " (casting vote)" : ""}: <Badge tone={v.position === "ALLOW" ? "green" : v.position === "DISMISS" ? "grey" : "amber"}>{POSITION_TEXT[v.position]}</Badge>{v.note ? ` · ${v.note}` : ""}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-sm">
            {tally.decided ? <>Decision: <strong>{POSITION_TEXT[tally.decided]}</strong>{tally.majority ? " by majority" : " by the Chief Commissioner's casting vote"}.</>
              : tally.needsCasting ? <>The bench is evenly divided ({tally.tie.map((p) => POSITION_TEXT[p]).join(" / ")}). The Chief Commissioner casts the deciding vote.</>
              : `${members.length - appeal.votes.filter((v) => !v.isCasting).length} of ${members.length} votes still to come.`}
          </p>
          {isMember && voting ? (
            <form action={vote} className="mt-3 grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
              <HiddenBack value={back} />
              <input type="hidden" name="appealId" value={appeal.id} />
              <div>
                <label className="label" htmlFor="position">{mine ? "Change your vote" : "Your vote"}</label>
                <select id="position" name="position" className="input" defaultValue={mine?.position ?? "ALLOW"}>{POSITIONS.map((p) => <option key={p} value={p}>{POSITION_TEXT[p]}</option>)}</select>
              </div>
              <div>
                <label className="label" htmlFor="note">Note (recorded as dissent if you are in the minority)</label>
                <input id="note" name="note" className="input" defaultValue={mine?.note ?? ""} />
              </div>
              <button className="btn-primary" data-testid="vote">Record vote</button>
            </form>
          ) : null}
          {u.role === "CHIEF_COMMISSIONER" && tally.needsCasting && voting ? (
            <form action={vote} className="mt-3 grid gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
              <HiddenBack value={back} />
              <input type="hidden" name="appealId" value={appeal.id} />
              <input type="hidden" name="casting" value="1" />
              <div>
                <label className="label" htmlFor="castPosition">Casting vote</label>
                <select id="castPosition" name="position" className="input">{tally.tie.map((p) => <option key={p} value={p}>{POSITION_TEXT[p]}</option>)}</select>
              </div>
              <div>
                <label className="label" htmlFor="castNote">Note</label>
                <input id="castNote" name="note" className="input" />
              </div>
              <button className="btn-primary">Cast deciding vote</button>
            </form>
          ) : null}
        </Card>
      ) : null}

      {awaiting && isRegistrar ? (
        <Card title="Order awaiting authentication" className="border-amber-300">
          <p className="text-sm">Order <Link className="text-brand-700 underline" href={`/doc/order/${awaiting.id}`}>{awaiting.orderNo}</Link> was signed on {formatDate(awaiting.signedOn)}. It takes effect when you authenticate it.</p>
          <form action={authenticate} className="mt-3">
            <HiddenBack value={back} />
            <input type="hidden" name="orderId" value={awaiting.id} />
            <button className="btn-primary" data-testid="authenticate">Authenticate order</button>
          </form>
        </Card>
      ) : null}

      <HearingTools appeal={appeal} today={today} s={s} cal={cal} noDigitalAccess={citizen?.hasDigitalAccess === false} back={back} canSchedule={isRegistrar && !!appeal.bench} canRecord={isMember} />
      {isPresiding && tally.decided && ["UNDER_REVIEW", "HEARING_SCHEDULED", "ORDER_DRAFTED"].includes(appeal.status) ? (
        <OrderBuilder appeal={appeal} s={s} candidates={candidates} attribution={attribution} names={names} back={back} decided={tally.decided} />
      ) : null}

      <ApplicationSummary app={app} today={today} cal={cal} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <AppealChain appeals={app.appeals} currentId={appeal.id} hrefFor={() => null} />
          <MissedDeadlinesPanel missed={missed} names={names} appealNos={new Map(app.appeals.map((a) => [a.id, a.appealNo]))} />
          <RepliesPanel appeal={appeal} />
          <QueriesPanel app={app} cal={cal} today={today} />
          <DocumentsPanel app={app} />
        </div>
        <div className="space-y-4">
          <LedgerPanel app={app} />
          <DelayPanel attribution={attribution} names={names} ground={appeal.ground} />
        </div>
      </div>
      <HearingsPanel appeal={appeal} />
      <OrdersPanel appeal={appeal} includeDrafts={isPresiding} />
      <HistoryPanel caseRef={app.uin} entityIds={[app.id, ...app.appeals.map((a) => a.id)]} />
    </div>
  );
}
