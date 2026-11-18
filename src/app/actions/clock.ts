"use server";

import { attempt, safeBack, str } from "@/lib/action";
import { SYSTEM_ACTOR } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { actorOf, getSessionUser, setSession } from "@/lib/session";
import { advanceClockBy, advanceClockTo } from "@/scheduler";
import { seedBaseline } from "@/seed";
import { stagePenaltyScenario } from "@/seed/penalty-scenarios";

function describe(r: { to: string; events: Record<string, number> }) {
  const parts = Object.entries(r.events).map(([k, v]) => `${k}: ${v}`);
  return `The date is now ${r.to}.${parts.length ? ` Automatic actions — ${parts.join("; ")}.` : " No automatic actions were due."}`;
}

export async function moveClock(fd: FormData) {
  const back = safeBack(fd.get("back"));
  const u = await getSessionUser();
  const actor = u ? actorOf(u) : SYSTEM_ACTOR;
  const days = Number(str(fd, "days"));
  const date = str(fd, "date");
  await attempt(back, async () => describe(date ? await advanceClockTo(actor, date) : await advanceClockBy(actor, days)));
}

export async function resetDemo(fd: FormData) {
  await seedBaseline(prisma);
  await attempt(safeBack(fd.get("back"), "/demo"), async () => "Demo data has been reset and the clock set back to the start date.");
}

/** Penalty module demo: reseed, stage the scenario, then open its first step as the right user. */
export async function startPenaltyScenario(fd: FormData) {
  const s = await stagePenaltyScenario(prisma, Number(str(fd, "scenario")));
  const first = s.steps.find((x) => x.userId && x.href);
  if (first) await setSession(first.userId!);
  await attempt(first?.href ?? "/demo", async () => `Scenario ${s.id} (${s.title}) is ready. Follow the steps on the Demo page.`);
}
