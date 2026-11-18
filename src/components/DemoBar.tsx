import Link from "next/link";
import { moveClock } from "@/app/actions/clock";
import { formatDate } from "@/domain/dates";
import { getRuleContext } from "@/lib/context";
import { prisma } from "@/lib/db";
import { getSessionUser, ROLE_LABELS } from "@/lib/session";
import { currentUrl } from "@/lib/url";
import { isWorkingDay } from "@/domain/calendar";
import { RoleSwitcher } from "./RoleSwitcher";

const ROLE_ORDER = ["CITIZEN", "DPS", "LINK_OFFICER", "DEALING_ASSISTANT", "HEAD_OF_OFFICE", "FAA", "SAA", "REGISTRAR", "COMMISSIONER", "CHIEF_COMMISSIONER", "SEWA_SETU_DDO", "FINANCE_NODAL", "FINANCE_SENIOR", "COMPETENT_AUTHORITY", "CALL_CENTRE", "ADMIN"];

/** Demo banner: simulated date, clock controls and the role switcher. Not part of the real product. */
export async function DemoBar() {
  const [{ today, cal }, user, users, back] = await Promise.all([
    getRuleContext(),
    getSessionUser(),
    prisma.user.findMany({ where: { OR: [{ role: { not: "CITIZEN" } }, { id: { startsWith: "u-cit-" } }] } }),
    currentUrl(),
  ]);
  const options = users
    .filter((u) => !/^u-cit-\d{10}$/.test(u.id))
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name))
    .map((u) => ({ id: u.id, label: `${u.name}${u.designation ? ` — ${u.designation}` : ""}`, group: ROLE_LABELS[u.role] ?? u.role }));
  const holiday = await prisma.holiday.findUnique({ where: { date: today } });
  const working = isWorkingDay(today, cal);

  return (
    <div className="no-print border-b border-amber-300 bg-amber-100 text-amber-950">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 text-xs sm:px-4">
        <span className="rounded bg-amber-300 px-1.5 py-0.5 font-bold tracking-wide">DEMO</span>
        <span>
          Simulated date: <strong data-testid="sim-date">{formatDate(today, true)}</strong>{" "}
          <span className="text-amber-800">({holiday ? `holiday: ${holiday.name}` : working ? "working day" : "office closed"})</span>
        </span>
        <form action={moveClock} className="flex flex-wrap items-center gap-1">
          <input type="hidden" name="back" value={back} />
          {[1, 7, 30].map((d) => (
            <button key={d} name="days" value={d} className="cursor-pointer rounded border border-amber-400 bg-white px-2 py-0.5 font-medium hover:bg-amber-50" data-testid={`clock-plus-${d}`}>
              +{d} {d === 1 ? "day" : "days"}
            </button>
          ))}
        </form>
        <form action={moveClock} className="flex items-center gap-1">
          <input type="hidden" name="back" value={back} />
          <label htmlFor="jump-date" className="sr-only">Go to date</label>
          <input id="jump-date" type="date" name="date" min={today} className="rounded border border-amber-300 bg-white px-1 py-0.5" required />
          <button className="cursor-pointer rounded border border-amber-400 bg-white px-2 py-0.5 font-medium hover:bg-amber-50">Go</button>
        </form>
        <RoleSwitcher options={options} currentId={user?.id} />
        <nav className="flex flex-wrap gap-3 font-medium">
          <Link href="/demo" className="underline">Demo scenarios</Link>
          <Link href="/notifications" className="underline">Messages log</Link>
          <Link href="/audit" className="underline">Audit log</Link>
        </nav>
      </div>
    </div>
  );
}
