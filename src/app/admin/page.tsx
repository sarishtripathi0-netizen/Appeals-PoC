import { Card, Empty, FeatureRef, PageHeader } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { getToday } from "@/lib/context";
import { parseJson, prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function AdminClock() {
  await requireUser(["ADMIN"]);
  const today = await getToday();
  const [runs, holidays] = await Promise.all([
    prisma.schedulerRun.findMany({ orderBy: { id: "desc" }, take: 60 }),
    prisma.holiday.findMany({ where: { date: { gte: today.slice(0, 4) } }, orderBy: { date: "asc" } }),
  ]);
  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-129", "AMS-131"]} />
      <PageHeader title="Clock and scheduler" subtitle={`Simulated date: ${formatDate(today, true)}. Use the yellow bar to move the clock; the scheduler runs once for every day passed.`} />
      <Card title="Scheduler runs (latest 60 days)">
        {runs.length === 0 ? <Empty>The clock has not been moved since the last reset.</Empty> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Day</th><th>Automatic actions</th></tr></thead>
              <tbody>
                {runs.map((r) => {
                  const s = Object.entries(parseJson<Record<string, number>>(r.summary, {}));
                  return <tr key={r.id}><td>{formatDate(r.simDate, true)}</td><td>{s.length ? s.map(([k, v]) => `${k}: ${v}`).join("; ") : <span className="text-slate-400">none</span>}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Holidays">
        <p className="muted mb-2">Sundays and the Saturdays set in Rules and switches are also non-working. Dates are indicative; check them against the Government of Assam notification.</p>
        <ul className="grid gap-x-4 text-sm sm:grid-cols-2">
          {holidays.map((h) => <li key={h.date}><span className="inline-block w-36 text-slate-500">{formatDate(h.date, true)}</span>{h.name}</li>)}
        </ul>
      </Card>
    </div>
  );
}
