import Link from "next/link";
import { Badge, Card, Empty, FeatureRef, one, PageHeader, type SP } from "@/components/ui";
import { DEMO_LINK_HOST } from "@/services/appeals";
import { formatDate } from "@/domain/dates";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

const CHANNELS = ["SMS", "EMAIL", "DASHBOARD"] as const;

/** Draft-appeal links in messages point at a demo host; inside the demo they open the local page. */
function linkify(text: string) {
  const parts = text.split(new RegExp(`${DEMO_LINK_HOST.replace(".", "\\.")}(/a/[\\w-]+)`));
  return parts.map((p, i) => (i % 2 ? <Link key={i} href={p} className="text-brand-700 underline">{DEMO_LINK_HOST}{p}</Link> : p));
}

export default async function MessagesLog({ searchParams }: { searchParams: SP }) {
  await requireUser();
  const sp = await searchParams;
  const channel = CHANNELS.find((c) => c === one(sp.channel));
  const q = one(sp.q)?.trim() ?? "";
  const messages = await prisma.notification.findMany({
    where: {
      ...(channel ? { channel } : {}),
      ...(q ? { OR: [{ recipientLabel: { contains: q } }, { caseRef: { contains: q } }, { text: { contains: q } }] } : {}),
    },
    orderBy: { seq: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <FeatureRef ids={["COM-08", "AMS-130", "COM-14"]} note="SMS and email are simulated; this log shows what would be sent" />
      <PageHeader title="Messages log" subtitle="Stand-in for the SMS gateway, email and dashboard alerts. Newest first." />
      <Card>
        <form className="grid gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="q">Search recipient, case or text</label>
            <input id="q" name="q" className="input" defaultValue={q} />
          </div>
          <div>
            <label className="label" htmlFor="channel">Channel</label>
            <select id="channel" name="channel" className="input" defaultValue={channel ?? ""}>
              <option value="">All</option>
              {CHANNELS.map((c) => <option key={c} value={c}>{c === "DASHBOARD" ? "Dashboard" : c === "EMAIL" ? "Email" : "SMS"}</option>)}
            </select>
          </div>
          <button className="btn-secondary">Filter</button>
        </form>
      </Card>
      <Card>
        {messages.length === 0 ? <Empty>No messages yet.</Empty> : (
          <ul className="divide-y divide-slate-100 text-sm" data-testid="messages">
            {messages.map((m) => (
              <li key={m.id} className="py-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Badge tone={m.channel === "SMS" ? "green" : m.channel === "EMAIL" ? "blue" : "grey"}>{m.channel === "DASHBOARD" ? "Dashboard" : m.channel === "EMAIL" ? "Email" : "SMS"}</Badge>
                  <span>{formatDate(m.sentOn)}</span>
                  <span>to {m.recipientLabel}{m.address ? ` (${m.address})` : ""}</span>
                  {m.caseRef ? <span>· {m.caseRef}</span> : null}
                </div>
                <p className="mt-1">{linkify(m.text)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
