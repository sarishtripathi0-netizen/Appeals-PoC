import Link from "next/link";
import { intakeImport } from "@/app/actions/intake";
import { SERVICE_SYSTEMS, serviceSystemClient, ServiceSystemError, type ListItem, type Snapshot } from "@/adapters/service-systems";
import { Badge, Card, Empty, FeatureRef, Flash, HiddenBack, PageHeader, type SP, type Tone } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { currentUrl } from "@/lib/url";
import { crossCheck, type PersonCheck } from "@/services/intake";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const MDM: Record<PersonCheck["mdm"], { label: string; tone: Tone }> = {
  OK: { label: "In MDM", tone: "green" }, NOT_IN_MDM: { label: "Not in MDM", tone: "red" }, NAME_DIFFERS: { label: "MDM: other person", tone: "red" }, UNRESOLVED: { label: "Not resolved", tone: "amber" },
};
const HR: Record<PersonCheck["hr"], { label: string; tone: Tone }> = {
  SAME: { label: "HR agrees", tone: "green" }, DIFFERENT: { label: "HR: someone else", tone: "red" }, VACANT: { label: "HR: chair vacant", tone: "amber" },
  NOT_IN_HR: { label: "Not in HR", tone: "grey" }, UNRESOLVED: { label: "Not resolved", tone: "amber" }, ERROR: { label: "HR error", tone: "red" },
};

export default async function Intake({ searchParams }: { searchParams: SP }) {
  await requireUser(["ADMIN"]);
  const sp = await searchParams;
  const back = await currentUrl();
  const sys = SERVICE_SYSTEMS.find((s) => s.code === str(sp.source)) ?? SERVICE_SYSTEMS[0];
  const client = serviceSystemClient(sys);
  const all = str(sp.all) === "1";
  const no = str(sp.no);

  let list: ListItem[] = [];
  let error: string | null = null;
  try { list = await client.list({ appealEligible: all ? undefined : true, limit: 100 }); } catch (e) { if (e instanceof ServiceSystemError) error = e.message; else throw e; }
  let snap: Snapshot | null = null;
  let checks: PersonCheck[] = [];
  if (no) {
    try { snap = await client.snapshot(no); checks = await crossCheck(snap); } catch (e) { if (e instanceof ServiceSystemError) error = e.message; else throw e; }
  }
  const imported = new Map((await prisma.externalApplication.findMany({ where: { source: sys.code } })).map((x) => [x.externalNo, x]));

  return (
    <div className="space-y-4">
      <FeatureRef ids={["RULE-ENGINE"]} note="intake from service systems" />
      <PageHeader
        title="Appeals intake from service systems"
        subtitle={<>Applications decided in a service system, with the officers the Rule Engine resolved for them. An application is appeal-eligible when it was rejected, or is still open after its statutory due date. Bringing it into AMS lets the citizen appeal to the First Appellate Authority the Rule Engine named. Source: <code>{sys.baseUrl}/ams</code>.</>}
      />
      <Flash searchParams={searchParams} />
      {error ? <p className="rounded-md bg-rose-50 p-2 text-sm text-rose-800">{error}</p> : null}

      <Card title={`${sys.name}: ${all ? "all applications" : "appeal-eligible applications"} (${list.length})`} actions={
        <Link className="btn-secondary btn-sm" href={all ? "/admin/intake" : "/admin/intake?all=1"}>{all ? "Only appeal-eligible" : "Show all"}</Link>
      }>
        {list.length === 0 ? <Empty>No applications.</Empty> : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Application</th><th>Service</th><th>Applicant</th><th>Status</th><th>DPS / FAA (Rule Engine)</th><th></th></tr></thead>
            <tbody>{list.map((x) => {
              const done = imported.get(x.applicationNo);
              return (
                <tr key={x.applicationNo}>
                  <td><Link className="font-medium text-brand-700 hover:underline" href={`/admin/intake?no=${encodeURIComponent(x.applicationNo)}${all ? "&all=1" : ""}`}>{x.applicationNo}</Link><div className="text-xs text-slate-500">submitted {formatDate(x.submittedOn)} · due {formatDate(x.dueDate)}</div></td>
                  <td>{x.service.name}<div className="text-xs text-slate-500">{x.service.code} · {x.service.timelineDays} working days · {x.district.name}</div></td>
                  <td>{x.applicantName}</td>
                  <td>{x.status.replaceAll("_", " ").toLowerCase()}{x.appealEligible ? <div><Badge tone="amber">appeal: {x.appealGrounds.join(", ").toLowerCase()}</Badge></div> : null}</td>
                  <td className="text-xs">{x.dps.employeeName ?? <span className="text-rose-700">DPS not resolved</span>}{x.dps.designation ? `, ${x.dps.designation}` : ""}<br />{x.faa?.employeeName ? `FAA: ${x.faa.employeeName}, ${x.faa.designation}` : <span className="text-rose-700">FAA not resolved</span>}</td>
                  <td>{done ? <Badge tone="green">In AMS</Badge> : null}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Card>

      {snap ? (
        <>
          <Card title={`${snap.application.applicationNo}: ${snap.application.service.name}`} actions={
            snap.appeal.eligible ? (
              <form action={intakeImport}>
                <HiddenBack value={back} /><input type="hidden" name="source" value={sys.code} /><input type="hidden" name="applicationNo" value={snap.application.applicationNo} />
                <button className="btn-primary btn-sm" data-testid="intake-import">{imported.has(snap.application.applicationNo) ? "Refresh snapshot in AMS" : "Bring into AMS for appeal"}</button>
              </form>
            ) : <Badge>not appeal-eligible</Badge>
          }>
            <dl className="grid gap-y-1 text-sm sm:grid-cols-[13rem_1fr]">
              <dt className="text-slate-500">Applicant</dt><dd>{snap.applicant.name} · {snap.applicant.mobile} · {snap.applicant.location.village?.name ?? snap.applicant.location.ward?.name ?? ""}, {snap.applicant.location.circle?.name ?? ""}, {snap.applicant.location.district.name}</dd>
              <dt className="text-slate-500">Status</dt><dd>{snap.application.status.replaceAll("_", " ").toLowerCase()}{snap.application.decision ? ` on ${formatDate(snap.application.decision.on)} by ${snap.application.decision.by?.name ?? "—"}${snap.application.decision.reason ? `: “${snap.application.decision.reason}”` : ""}` : ""}</dd>
              <dt className="text-slate-500">Statutory time limit</dt><dd>{snap.application.sla.timelineDays} working days, due {formatDate(snap.application.sla.dueDate)} · {snap.application.sla.state.replaceAll("_", " ").toLowerCase()}</dd>
              <dt className="text-slate-500">Appeal</dt><dd>{snap.appeal.eligible ? `Eligible (${snap.appeal.grounds.join(", ").toLowerCase()}); first appeal to ${snap.appeal.nextAuthority?.employeeName ?? "—"}, ${snap.appeal.nextAuthority?.designation?.name ?? ""}` : "Not eligible"}</dd>
              <dt className="text-slate-500">Rule Engine</dt><dd>Rule {snap.application.rule ? `${snap.application.rule.code} “${snap.application.rule.name}” v${snap.application.rule.version}` : "—"} · MDM version {snap.application.mdmVersion ?? "—"}{snap.application.engineMessage ? ` · ${snap.application.engineMessage}` : ""}</dd>
            </dl>
          </Card>

          <Card title="Designated persons, checked against MDM and the HR Utility">
            <p className="muted mb-2">The Rule Engine resolved these officers when the application was submitted. AMS checks each employee code against its MDM copy, and the chair against the HR Utility on the decision date.</p>
            <div className="table-wrap"><table className="data">
              <thead><tr><th>Role</th><th>Officer (Rule Engine)</th><th>Post</th><th>SLA</th><th>MDM</th><th>HR Utility</th></tr></thead>
              <tbody>{checks.map((c, i) => (
                <tr key={i}>
                  <td>{c.role}</td>
                  <td>{c.person.employeeName ?? <span className="text-rose-700">{c.person.reason ?? "not resolved"}</span>}<div className="text-xs text-slate-500">{c.person.employeeCode} · {c.person.designation?.name}, {c.person.office?.name}{c.person.via && c.person.via !== "REGULAR" ? ` · via ${c.person.via}` : ""}</div></td>
                  <td className="text-xs"><code>{c.person.post}</code></td>
                  <td>{c.person.slaDays != null ? `${c.person.slaDays} days` : "—"}</td>
                  <td><Badge tone={MDM[c.mdm].tone}>{MDM[c.mdm].label}</Badge>{c.mdm === "NAME_DIFFERS" ? <div className="text-xs text-rose-700">{c.mdmName}</div> : null}</td>
                  <td><Badge tone={HR[c.hr].tone}>{HR[c.hr].label}</Badge>{c.hr === "DIFFERENT" ? <div className="text-xs text-rose-700">{c.hrHolders.join(", ")}</div> : null}</td>
                </tr>
              ))}</tbody>
            </table></div>
            {snap.designatedPersons.linkOfficer?.candidates?.length ? (
              <p className="muted mt-2">Link Officer candidates (by priority): {snap.designatedPersons.linkOfficer.candidates.map((c) => `${c.priority}. ${c.person?.name ?? "—"} (${c.designation.name}, ${c.office.name}; ${c.delegationCode})`).join(" · ")}</p>
            ) : null}
          </Card>

          <Card title="Timeline">
            <div className="table-wrap"><table className="data">
              <thead><tr><th>#</th><th>Step</th><th>SLA</th><th>Assignee</th><th>Opened · due · done</th><th>Outcome</th></tr></thead>
              <tbody>{snap.timeline.steps.filter((t) => t.status !== "CANCELLED").map((t) => (
                <tr key={t.seq}><td>{t.seq}</td><td>{t.roleName} ({t.kind.toLowerCase()})</td><td>{t.slaDays} days</td><td>{t.assignee?.name ?? "—"}</td>
                  <td className="text-xs">{t.openedOn ?? "—"} · {t.dueDate ?? "—"} · {t.completedOn ?? "—"}</td>
                  <td>{t.action?.toLowerCase() ?? t.status.toLowerCase()}{t.overdue ? <> <Badge tone="red">overdue</Badge></> : null}{t.remarks ? <div className="text-xs text-slate-500">{t.remarks}</div> : null}</td></tr>
              ))}</tbody>
            </table></div>
            <p className="muted mt-2">Appeal levels: {snap.timeline.appealLevels.map((l) => `${l.roleCode} ${l.slaDays != null ? `${l.slaDays} days` : "(from the rule)"}`).join(" · ")}. {snap.timeline.steps.filter((t) => t.status === "CANCELLED").length} later step(s) were cancelled by the decision.</p>
          </Card>
        </>
      ) : null}
    </div>
  );
}
