import { resetDemo, startPenaltyScenario } from "@/app/actions/clock";
import { switchUser } from "@/app/actions/session";
import { Card, FeatureRef, Flash, HiddenBack, PageHeader, Planned, type SP } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { getToday } from "@/lib/context";
import { prisma } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/session";
import { DEMO_PASSWORD, DEMO_START } from "@/seed/masters";
import { PENALTY_SCENARIOS } from "@/seed/penalty-scenarios";

const SCENARIOS = [
  ["1", "On time", "An application delivered within its time limit: no appeal."],
  ["2", "Breach to delivery", "Time limit passes, draft appeal, one-click filing, hearing, order with penalty, delivery, confirmation, recovery."],
  ["3", "Escalation chain", "FAA misses its deadline, SAA extends then misses, the Commission decides on a split bench."],
  ["4", "Rejection appeal", "An application is rejected; the FAA sets the rejection aside and directs delivery."],
  ["5", "Link Officer", "A handover covers most of the delay, so the penalty falls on the Link Officer."],
  ["6", "Attempted closure", "The DPS tries to close a held application; the attempt is refused and listed for review."],
  ["7", "Remand", "The Commission sends a case back to the FAA with 15 working days to decide."],
  ["8", "Citizen declines", "The draft link lapses; what happens next depends on the switch."],
];

export default async function DemoPage({ searchParams }: { searchParams: SP }) {
  const today = await getToday();
  const ids = [...new Set(PENALTY_SCENARIOS.flatMap((s) => s.steps.map((x) => x.userId).filter(Boolean) as string[]))];
  const users = new Map((await prisma.user.findMany({ where: { id: { in: ids } } })).map((u) => [u.id, u]));
  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-129", "COM-06"]} />
      <PageHeader title="Demo scenarios" subtitle={`The demo starts on ${formatDate(DEMO_START, true)}. Today on the simulated clock: ${formatDate(today, true)}.`} />
      <Flash searchParams={searchParams} />
      <Card title="Reset">
        <p className="text-sm">Restores the seeded data and sets the clock back to the start date. The audit log is cleared only by this reset.</p>
        <form action={resetDemo} className="mt-3">
          <HiddenBack value="/demo" />
          <button className="btn-danger">Reset demo data</button>
        </form>
      </Card>
      <Card title="Penalty payment and recovery">
        <p className="muted mb-3 text-sm">
          Each button resets the demo data, sets up the scenario through the real workflow and signs you in as the first person in its steps.
          Every penalty is imposed on {formatDate(DEMO_START, true)}, so its last date is Wednesday 2 December 2026. Use the yellow bar to move the clock.
        </p>
        <ol className="space-y-4">
          {PENALTY_SCENARIOS.map((s) => (
            <li key={s.id} id={`penalty-${s.id}`} className="rounded-md border border-slate-200 p-3" data-testid={`penalty-scenario-${s.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{s.id}. {s.title} <span className="muted text-xs font-normal">({s.covers})</span></h3>
                  <p className="text-sm">{s.summary}</p>
                </div>
                <form action={startPenaltyScenario}>
                  <input type="hidden" name="scenario" value={s.id} />
                  <button className="btn-primary btn-sm" data-testid={`start-penalty-${s.id}`}>Start this scenario</button>
                </form>
              </div>
              <ol className="ml-5 mt-2 list-decimal space-y-1 text-sm">
                {s.steps.map((step, i) => {
                  const u = step.userId ? users.get(step.userId) : undefined;
                  return (
                    <li key={i}>
                      {step.text}
                      {u && step.href && (
                        <form action={switchUser} className="ml-1 inline">
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="target" value={step.href} />
                          <button className="text-brand-700 underline">Open as {u.name.replace(" (Demo)", "")} ({ROLE_LABELS[u.role] ?? u.role})</button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      </Card>
      <Card title="Appeals">
        <Planned milestone="M5">a &ldquo;Start this scenario&rdquo; button for each one, which stages its data and sets the clock.</Planned>
        <ol className="mt-3 space-y-2 text-sm">
          {SCENARIOS.map(([n, title, text]) => <li key={n}><strong>{n}. {title}.</strong> {text}</li>)}
        </ol>
      </Card>
      <Card title="Signing in">
        <ul className="ml-5 list-disc text-sm">
          <li>Use <strong>Switch role</strong> in the yellow bar to become any seeded user without signing in.</li>
          <li>Citizens: mobile 9000000001 to 9000000004; the OTP is shown on screen.</li>
          <li>Officers: see the usernames on the officer sign-in page; the password is <code>{DEMO_PASSWORD}</code> and the second-factor code is <code>246810</code>.</li>
        </ul>
      </Card>
    </div>
  );
}
