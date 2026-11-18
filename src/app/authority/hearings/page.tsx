import Link from "next/link";
import { Badge, Card, Empty, FeatureRef, PageHeader } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { getToday } from "@/lib/context";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function HearingsCalendar() {
  const u = await requireUser(["FAA", "SAA"]);
  const today = await getToday();
  const hearings = await prisma.hearing.findMany({ where: { appeal: { authorityId: u.id } }, include: { appeal: true }, orderBy: [{ scheduledOn: "asc" }, { timeSlot: "asc" }] });
  const upcoming = hearings.filter((h) => h.status === "SCHEDULED");
  const past = hearings.filter((h) => h.status !== "SCHEDULED").reverse();
  const days = [...new Set(upcoming.map((h) => h.scheduledOn))];

  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-42", "AMS-43", "AMS-47"]} />
      <PageHeader title="Hearings calendar" subtitle="Hearings are online by default. Fix or adjourn a hearing from the appeal itself." />
      <Card title="Scheduled">
        {days.length === 0 ? <Empty>No hearings scheduled.</Empty> : (
          <div className="space-y-3">
            {days.map((d) => (
              <div key={d}>
                <div className={`text-sm font-semibold ${d < today ? "text-rose-700" : ""}`}>{formatDate(d, true)}{d < today ? " (not yet recorded)" : d === today ? " (today)" : ""}</div>
                <ul className="ml-4 text-sm">
                  {upcoming.filter((h) => h.scheduledOn === d).map((h) => (
                    <li key={h.id}>{h.timeSlot} · <Link className="text-brand-700 hover:underline" href={`/authority/appeals/${h.appealId}`}>{h.appeal.appealNo}</Link> · {h.mode === "ONLINE" ? "online" : "in person"}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Past and adjourned">
        {past.length === 0 ? <Empty>None yet.</Empty> : (
          <ul className="space-y-1 text-sm">
            {past.map((h) => (
              <li key={h.id} className="flex flex-wrap gap-2">
                <span>{formatDate(h.scheduledOn)}</span>
                <Link className="text-brand-700 hover:underline" href={`/authority/appeals/${h.appealId}`}>{h.appeal.appealNo}</Link>
                <Badge tone={h.status === "HELD" ? "green" : "grey"}>{h.status === "HELD" ? "Held" : h.status === "ADJOURNED" ? "Adjourned" : "Cancelled"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
