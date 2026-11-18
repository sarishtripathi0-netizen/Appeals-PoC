import Link from "next/link";
import { Badge, Card, Empty, FeatureRef, Flash, PageHeader, type SP } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { getRuleContext } from "@/lib/context";
import { parseJson, prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { appealDeadlineView, appealStatusLabel, appealStatusTone, GROUND_LABELS, ORIGIN_LABELS } from "@/lib/view";

export default async function CommissionCases({ searchParams }: { searchParams: SP }) {
  const u = await requireUser(["REGISTRAR", "COMMISSIONER", "CHIEF_COMMISSIONER"]);
  const { today, cal } = await getRuleContext();
  const all = await prisma.appeal.findMany({
    where: { level: "TAA", status: { notIn: ["DRAFT", "DECLINED", "LAPSED"] } },
    include: { application: { include: { service: true } }, bench: true, votes: true },
    orderBy: { filedOn: "asc" },
  });
  const onMyBench = (a: (typeof all)[number]) => parseJson<string[]>(a.bench?.memberIds, []).includes(u.id);
  const sections = [
    { title: "Scrutiny by the Registrar", rows: all.filter((a) => a.status === "SCRUTINY"), show: true },
    { title: "Returned to the citizen", rows: all.filter((a) => a.status === "RETURNED"), show: u.role === "REGISTRAR" },
    { title: u.role === "REGISTRAR" ? "Before benches" : "Before your bench", rows: all.filter((a) => ["UNDER_REVIEW", "HEARING_SCHEDULED", "ORDER_DRAFTED"].includes(a.status) && (u.role === "REGISTRAR" || onMyBench(a) || u.role === "CHIEF_COMMISSIONER")), show: true },
    { title: "Signed, awaiting authentication", rows: all.filter((a) => a.status === "AWAITING_AUTHENTICATION"), show: true },
    { title: "Decided", rows: all.filter((a) => ["COMPLIANCE", "AWAITING_CONFIRMATION", "CLOSED"].includes(a.status)), show: true },
  ];

  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-77", "AMS-78", "AMS-79", "AMS-83", "AMS-73"]} />
      <PageHeader title="Commission cases" subtitle="Third appeals, from scrutiny to an authenticated order. The 90-day time is a target; overdue cases are shown, never moved." />
      <Flash searchParams={searchParams} />
      {sections.filter((s) => s.show).map((s) => (
        <Card key={s.title} title={`${s.title} (${s.rows.length})`}>
          {s.rows.length === 0 ? <Empty>None.</Empty> : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Appeal</th><th>Service</th><th>How it arrived</th><th>Filed</th><th>Target</th><th>Status</th></tr></thead>
                <tbody>
                  {s.rows.map((a) => {
                    const dv = appealDeadlineView(a.deadlineOn, today, cal, !!a.decidedOn);
                    const waiting = a.bench && parseJson<string[]>(a.bench.memberIds, []).includes(u.id) && !a.votes.some((v) => v.memberId === u.id);
                    return (
                      <tr key={a.id}>
                        <td><Link className="font-medium text-brand-700 hover:underline" href={`/commission/appeals/${a.id}`}>{a.appealNo}</Link>{waiting ? <> <Badge tone="amber">your vote</Badge></> : null}</td>
                        <td>{a.application.service.name}<div className="text-xs text-slate-500">{GROUND_LABELS[a.ground]}</div></td>
                        <td>{ORIGIN_LABELS[a.origin]}{a.isLate ? <> <Badge tone="amber">late</Badge></> : null}</td>
                        <td>{formatDate(a.filedOn)}</td>
                        <td><Badge tone={dv.overdue ? "red" : "grey"}>{dv.overdue ? `Past target by ${dv.text.replace("Deadline passed ", "").replace(" ago", "")}` : dv.text}</Badge></td>
                        <td><Badge tone={appealStatusTone(a.status)}>{appealStatusLabel(a.status)}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
