import { hrEvents } from "@/app/actions/hr";
import { HR_URL, hrHttp, officeHoursOn } from "@/adapters/hr";
import { Badge, Card, Empty, FeatureRef, Flash, HiddenBack, PageHeader, type SP, type Tone } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { getToday } from "@/lib/context";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { currentUrl } from "@/lib/url";
import { AMS_HR_OFFICES, hrDelayLedger, hrReadiness, hrStatus, type ReadinessRow } from "@/services/hr";
import { DomainError } from "@/services/errors";
import { mdmFreshness } from "@/services/mdm";

const OUTCOME: Record<ReadinessRow["outcome"], { label: string; tone: Tone }> = {
  RESOLVED: { label: "HR knows who", tone: "green" },
  RESOLVED_DEMO: { label: "HR: demo officer", tone: "blue" },
  NO_ONE: { label: "No one in the seat", tone: "red" },
  NOT_IN_HR: { label: "Not covered by HR", tone: "amber" },
  NO_SEAT: { label: "No seat defined", tone: "purple" },
  ERROR: { label: "Error", tone: "red" },
};
const ROLE: Record<string, string> = { DPS: "DPS", FAA: "First Appellate Authority", SAA: "Second Appellate Authority", DA: "Dealing Assistant" };
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export default async function HrAdmin({ searchParams }: { searchParams: SP }) {
  await requireUser(["ADMIN"]);
  const sp = await searchParams;
  const back = await currentUrl();
  const today = await getToday();
  const on = /^\d{4}-\d{2}-\d{2}$/.test(str(sp.on)) ? str(sp.on) : today;
  const [status, mdm] = await Promise.all([hrStatus(), mdmFreshness()]);
  const readiness = status.reachable ? await hrReadiness(on) : [];

  // Delay ledger from HR for one application, on request.
  const delayed = await prisma.application.findMany({
    where: { officeId: { in: ["OFF-KMM-DPR", "OFF-KMM-DCO", "OFF-SNP-CDO", "OFF-JRT-WRC"] }, OR: [{ status: "HELD" }, { heldOn: { not: null } }] },
    select: { id: true, uin: true, serviceCode: true, dueOn: true, status: true, officeId: true }, orderBy: { dueOn: "asc" },
  });
  const appId = str(sp.app);
  let ledger: Awaited<ReturnType<typeof hrDelayLedger>> | null = null;
  let ledgerError: string | null = null;
  if (appId && status.reachable) {
    try { ledger = await hrDelayLedger(appId); } catch (e) { if (e instanceof DomainError) ledgerError = e.message; else throw e; }
  }
  const names = new Map((await prisma.user.findMany({ where: { role: { not: "CITIZEN" } }, select: { id: true, name: true } })).map((u) => [u.id, u.name.replace(" (Demo)", "")]));
  const hrNames = new Map(ledger?.days.filter((d) => d.employeeId).map((d) => [d.employeeId!, d.name ?? d.employeeId!]) ?? []);

  // Officer lookup: posts an officer holds (what IAM would offer them to act as).
  const emp = str(sp.emp);
  let posts: Awaited<ReturnType<typeof hrHttp.employeePosts>>["body"] | null = null;
  let postsError: string | null = null;
  if (emp && status.reachable) {
    try { posts = (await hrHttp.employeePosts(emp, officeHoursOn(on))).body; } catch (e) { postsError = (e as Error).message; }
  }

  const [events, eventCount, cursor] = await Promise.all([
    prisma.hrEvent.findMany({ orderBy: { id: "desc" }, take: 25 }),
    prisma.hrEvent.count(),
    prisma.hrEventCursor.findUnique({ where: { id: 1 } }),
  ]);
  const tally = (o: ReadinessRow["outcome"]) => readiness.filter((r) => r.outcome === o).length;

  return (
    <div className="space-y-4">
      <FeatureRef ids={["HR"]} note="HR Utility integration" />
      <PageHeader
        title="Officers and postings (HR Utility)"
        subtitle={<>Who holds a seat at a given time, whether they are available, and who covers as Link Officer, from the HR Utility at <code>{HR_URL}</code>. AMS reads it; AMS screens still use AMS&rsquo;s own assignments until the readiness check below is clear.</>}
      />
      <Flash searchParams={searchParams} />

      <Card title="Connection">
        {status.reachable ? (
          <dl className="grid gap-y-1 text-sm sm:grid-cols-[14rem_1fr]">
            <dt className="text-slate-500">HR Utility</dt><dd><Badge tone="green">Reachable</Badge> MDM mode {status.mdm!.mode}{status.mdmStale ? <> · <Badge tone="amber">stale MDM copy</Badge></> : null}</dd>
            <dt className="text-slate-500">MDM version HR reflects</dt><dd>{status.mdm!.applied_version}</dd>
            <dt className="text-slate-500">MDM version of AMS&rsquo;s copy</dt>
            <dd>{mdm.appliedVersion || "not synchronised"}{mdm.appliedVersion && mdm.appliedVersion !== status.mdm!.applied_version ? <span className="text-amber-800"> (differs: answers may be about a slightly different MDM state)</span> : null}</dd>
          </dl>
        ) : <p className="rounded-md bg-rose-50 p-2 text-sm text-rose-800">{status.error} Start it with <code>python run.py</code> in the HR utility folder, or set <code>HR_URL</code>.</p>}
      </Card>

      <Card title={`Readiness: can HR say who holds each AMS seat on ${formatDate(on, true)}?`}>
        <form className="mb-3 flex flex-wrap items-end gap-2 text-sm">
          <div><label className="label" htmlFor="on">Date</label><input id="on" name="on" type="date" defaultValue={on} className="input" /></div>
          <button className="btn-secondary">Check</button>
        </form>
        <p className="muted mb-2">
          One row per AMS authority mapping and role. The seat (office, post, function) is AMS&rsquo;s stand-in for the Rule Engine, which owns that mapping.
          Where HR lists several available holders, AMS takes the first (seniority order); choosing among them is the Rule Engine&rsquo;s decision.
        </p>
        <p className="mb-3 flex flex-wrap gap-2">{(Object.keys(OUTCOME) as ReadinessRow["outcome"][]).filter((o) => tally(o)).map((o) => <Badge key={o} tone={OUTCOME[o].tone}>{OUTCOME[o].label}: {tally(o)}</Badge>)}</p>
        {readiness.length === 0 ? <Empty>The HR Utility is not reachable.</Empty> : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Service · AMS office</th><th>Role</th><th>Seat in HR</th><th>AMS today</th><th>HR on that day</th></tr></thead>
            <tbody>{readiness.map((r, i) => (
              <tr key={i}>
                <td>{r.serviceCode} · <span className="text-xs">{r.officeId}</span></td>
                <td>{ROLE[r.role]}</td>
                <td className="text-xs">{r.seat && "officeCode" in r.seat ? <><code>{r.seat.officeCode}</code> / <code>{r.seat.postCode}</code> / <code>{r.seat.functionCode}</code><div className="text-slate-500">{r.seat.basis}</div></> : "—"}</td>
                <td>{r.amsOfficer ?? "—"}</td>
                <td>
                  <Badge tone={OUTCOME[r.outcome].tone}>{OUTCOME[r.outcome].label}</Badge>
                  {r.hrOfficer ? <div className="mt-1">{r.hrOfficer}{r.capacity === "LINK_OFFICER" ? " (Link Officer)" : ""}</div> : null}
                  {r.others.length ? <div className="text-xs text-slate-500">Also available: {r.others.join(", ")}</div> : null}
                  {r.note ? <div className="text-xs text-slate-500">{r.note}</div> : null}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>

      <Card title="Delay ledger from HR">
        <p className="muted mb-2">
          For each working day of delay, asks HR who was answerable for the DPS seat (the holder, or the Link Officer while the holder was on leave, tour or training),
          and splits the delay like AMS&rsquo;s own ledger. Each answer is kept with the MDM version it reflects.
        </p>
        <form className="mb-3 flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="on" value={on} />
          <div className="min-w-[18rem]">
            <label className="label" htmlFor="app">Application held past its time limit</label>
            <select id="app" name="app" defaultValue={appId} className="input">
              <option value="">Choose…</option>
              {delayed.map((a) => <option key={a.id} value={a.id}>{a.uin} · {a.serviceCode} · due {a.dueOn} · {a.officeId}</option>)}
            </select>
          </div>
          <button className="btn-secondary">Build ledger</button>
        </form>
        {ledgerError ? <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">{ledgerError}</p> : null}
        {ledger ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">HR Utility</h3>
              {ledger.hr.length === 0 ? <Empty>No working days of delay, or no one answerable.</Empty> : (
                <ul className="text-sm">{ledger.hr.map((a) => <li key={a.officerId + a.capacity}>{hrNames.get(a.officerId) ?? a.officerId} ({a.officerId}), {a.capacity === "LINK_OFFICER" ? "Link Officer" : "DPS"}: <strong>{a.delayDays}</strong> working day(s)</li>)}</ul>
              )}
              <p className="muted mt-1">{ledger.days.length} day(s) asked{ledger.truncated ? " (first 90 only)" : ""}; MDM version {ledger.mdmVersions.join(", ") || "—"}.</p>
            </div>
            <div>
              <h3 className="font-semibold">AMS today</h3>
              <ul className="text-sm">{ledger.ams.map((a) => <li key={a.officerId + a.capacity}>{names.get(a.officerId) ?? a.officerId}, {a.capacity === "LINK_OFFICER" ? "Link Officer" : "DPS"}: <strong>{a.delayDays}</strong> working day(s)</li>)}</ul>
              <p className="muted mt-1">AMS&rsquo;s demo officers are fictional, so the names differ; compare how the days split.</p>
            </div>
          </div>
        ) : null}
      </Card>

      <Card title="Posts an officer holds">
        <p className="muted mb-2">What IAM would offer the officer to act as: substantive and additional charges, and Link Officer charges while the covered officer is away.</p>
        <form className="mb-3 flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="on" value={on} />
          <div><label className="label" htmlFor="emp">Employee ID</label><input id="emp" name="emp" defaultValue={emp} placeholder="EMP-0047" className="input" /></div>
          <button className="btn-secondary">Look up</button>
        </form>
        {postsError ? <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">{postsError}</p> : null}
        {posts ? (
          <div className="text-sm">
            <div><strong>{posts.name}</strong> ({posts.employee_id}{posts.cadre ? `, ${posts.cadre}` : ""}){posts.is_demo ? " · demo officer" : ""} · {posts.available ? "available" : `away: ${posts.unavailable_reason}`}</div>
            {posts.posts.length === 0 ? <Empty>Holds no post on this date.</Empty> : (
              <ul className="ml-5 list-disc">{posts.posts.map((p) => <li key={p.sanctioned_post_id + p.charge_type}><code>{p.sanctioned_post_id}</code> · {p.charge_type.toLowerCase()}{p.covering_for ? ` · covering for ${p.covering_for} (${p.rule_step})` : ""} · since {p.since.slice(0, 10)}</li>)}</ul>
            )}
          </div>
        ) : null}
      </Card>

      <Card title={`HR events (${eventCount} received)`} actions={
        <form action={hrEvents}><HiddenBack value={back} /><button className="btn-secondary btn-sm" data-testid="hr-events">Fetch new events</button></form>
      }>
        <p className="muted mb-2">
          Postings, charges, function allotments and leave from the HR outbox, read from the last id seen ({cursor?.lastId ?? 0}).
          Events for an office AMS uses are marked; an event counts only once its effective time has come.
          {cursor?.lastError ? <span className="text-rose-700"> Last error: {cursor.lastError}</span> : null}
        </p>
        {events.length === 0 ? <Empty>No events fetched yet.</Empty> : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Id</th><th>Event</th><th>Effective</th><th>Officer</th><th>Office · post</th><th></th></tr></thead>
            <tbody>{events.map((e) => (
              <tr key={e.id}>
                <td>{e.id}</td><td>{e.type}</td><td>{e.effectiveAt.slice(0, 16).replace("T", " ")}{new Date(e.effectiveAt) > new Date() ? <> <Badge tone="purple">future</Badge></> : null}</td>
                <td>{e.employeeId}</td><td>{e.officeCode} · {e.postCode}</td>
                <td>{e.officeCode && AMS_HR_OFFICES.has(e.officeCode) ? <Badge tone="blue">AMS office</Badge> : null}{e.isDemo ? <> <Badge>demo</Badge></> : null}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
