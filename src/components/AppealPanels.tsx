import Link from "next/link";
import type { Calendar } from "@/domain/calendar";
import { formatDate } from "@/domain/dates";
import { LEVEL_NAMES } from "@/domain/numbering";
import type { Level } from "@/domain/settings";
import { parseJson, prisma } from "@/lib/db";
import { appealDeadlineView, appealStatusLabel, appealStatusTone, GROUND_LABELS, ORIGIN_LABELS } from "@/lib/view";
import { Badge, Card, Empty, KV } from "./ui";

export async function loadAppeal(id: string) {
  return prisma.appeal.findUnique({
    where: { id },
    include: {
      application: { include: { service: true, office: { include: { district: true } }, documents: true, infoRequests: { orderBy: { raisedOn: "asc" } }, ledger: { orderBy: { fromOn: "asc" } }, appeals: { orderBy: { appealNo: "asc" } } } },
      bench: true,
      votes: { orderBy: { castOn: "asc" } },
      missedDeadlines: true,
      hearings: { orderBy: { scheduledOn: "asc" } },
      orders: { orderBy: { draftedOn: "asc" } },
      replies: { orderBy: { requestedOn: "asc" } },
      directions: true,
      penalties: true,
    },
  });
}
export type LoadedAppeal = NonNullable<Awaited<ReturnType<typeof loadAppeal>>>;

const DONE = ["DECLINED", "LAPSED", "CLOSED", "ESCALATED", "COMPLIANCE", "AWAITING_CONFIRMATION", "AWAITING_AUTHENTICATION"];

export async function AppealSummary({ appeal, today, cal }: { appeal: LoadedAppeal; today: string; cal: Calendar }) {
  const authority = appeal.authorityId ? await prisma.user.findUnique({ where: { id: appeal.authorityId } }) : null;
  const deadline = appeal.extendedDeadlineOn ?? appeal.deadlineOn;
  const dv = appealDeadlineView(deadline, today, cal, DONE.includes(appeal.status) || !!appeal.decidedOn);
  return (
    <Card
      title={<span>{LEVEL_NAMES[appeal.level as Level]} <span className="text-sm font-normal text-slate-500">{appeal.appealNo}</span></span>}
      actions={<div className="flex flex-wrap gap-1"><Badge tone={appealStatusTone(appeal.status)}>{appealStatusLabel(appeal.status)}</Badge>{appeal.filedOn ? <Badge tone={dv.tone}>{dv.text}</Badge> : null}</div>}
    >
      <KV items={[
        ["Ground", GROUND_LABELS[appeal.ground]],
        ["How it arrived", ORIGIN_LABELS[appeal.origin]],
        ["Application", `${appeal.application.service.name} · ${appeal.application.uin}`],
        ["Authority", authority ? `${authority.name}, ${authority.designation}` : "—"],
        ...(appeal.status === "DRAFT" ? [["Draft link valid until", formatDate(appeal.linkExpiresOn, true)] as [string, string]] : []),
        ["Filing window", appeal.windowEndsOn ? `until ${formatDate(appeal.windowEndsOn)}` : "—"],
        ...(appeal.filedOn ? [["Filed on", `${formatDate(appeal.filedOn)}${appeal.isLate ? ` · late, reason: ${appeal.lateReason}${appeal.lateDecision ? ` (${appeal.lateDecision.toLowerCase()})` : ""}` : ""}`] as [string, string]] : []),
        ...(deadline ? [[appeal.level === "TAA" ? "Target date (not binding)" : "To be decided by", formatDate(deadline, true)] as [string, string]] : []),
        ...(appeal.decidedOn ? [["Decided on", formatDate(appeal.decidedOn)] as [string, string]] : []),
        ...(appeal.declinedOn ? [["Declined on", `${formatDate(appeal.declinedOn)}${appeal.declineReason ? ` · ${appeal.declineReason}` : ""}`] as [string, string]] : []),
      ]} />
      <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
        <div className="font-medium">Grounds</div>
        <p className="whitespace-pre-line">{appeal.groundsText}</p>
        <div className="mt-2 font-medium">Relief sought</div>
        <p>{appeal.reliefSought}</p>
      </div>
      {appeal.filedOn ? <p className="mt-3 text-sm"><Link className="text-brand-700 underline" href={`/doc/appeal/${appeal.id}`}>Appeal acknowledgement</Link></p> : null}
    </Card>
  );
}

export function HearingsPanel({ appeal, showJoin }: { appeal: LoadedAppeal; showJoin?: boolean }) {
  if (appeal.hearings.length === 0) return null;
  return (
    <Card title="Hearings">
      <ul className="space-y-2 text-sm">
        {appeal.hearings.map((h) => {
          const att = parseJson<{ citizen?: boolean; dps?: boolean }>(h.attendance, {});
          return (
            <li key={h.id} className="rounded-md border border-slate-200 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{formatDate(h.scheduledOn, true)}, {h.timeSlot}</strong>
                <Badge tone={h.status === "SCHEDULED" ? "blue" : h.status === "HELD" ? "green" : "grey"}>{h.status === "SCHEDULED" ? "Scheduled" : h.status === "HELD" ? "Held" : h.status === "ADJOURNED" ? "Adjourned" : "Cancelled"}</Badge>
                <span className="text-slate-500">{h.mode === "ONLINE" ? "Online" : `In person (${h.inPersonReason})`}</span>
              </div>
              <div className="text-slate-600">Notice served {formatDate(h.noticeServedOn)}{h.shortNoticeReason ? ` · short notice, reason: ${h.shortNoticeReason}` : ""}</div>
              {showJoin && h.status === "SCHEDULED" && h.videoLink ? (
                <a href={h.videoLink} target="_blank" rel="noreferrer" className="btn-secondary btn-sm mt-1" title="Simulated video link">Join video hearing (demo link)</a>
              ) : null}
              {h.status === "HELD" ? <div className="text-slate-600">Attended: citizen {att.citizen ? "yes" : "no"}, DPS {att.dps ? "yes" : "no"}{h.notes ? ` · ${h.notes}` : ""}</div> : null}
              {h.status === "ADJOURNED" && h.notes ? <div className="text-slate-600">{h.notes}</div> : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function OrdersPanel({ appeal, includeDrafts }: { appeal: LoadedAppeal; includeDrafts?: boolean }) {
  const orders = appeal.orders.filter((o) => includeDrafts || o.status !== "DRAFT");
  if (orders.length === 0) return null;
  return (
    <Card title="Orders">
      <ul className="space-y-2 text-sm">
        {orders.map((o) => {
          const d = appeal.directions.find((x) => x.orderId === o.id);
          return (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/doc/order/${o.id}`} className="font-medium text-brand-700 hover:underline">{o.orderNo}</Link>
              <span className="flex flex-wrap gap-1">
                <Badge tone={o.status === "DRAFT" ? "amber" : "green"}>{o.status === "DRAFT" ? "Draft" : `Signed ${formatDate(o.signedOn)}`}</Badge>
                {d ? <Badge tone={d.status === "MET" ? "green" : d.status === "OPEN" ? "blue" : "red"}>{d.status === "MET" ? `Delivered ${formatDate(d.metOn)}` : d.status === "OPEN" ? `Delivery due ${formatDate(d.dueOn)}` : "Direction missed"}</Badge> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function RepliesPanel({ appeal }: { appeal: LoadedAppeal }) {
  if (appeal.replies.length === 0) return null;
  return (
    <Card title="Reply of the DPS (respondent)">
      {appeal.replies.map((r) => (
        <div key={r.id} className="text-sm">
          {r.submittedOn
            ? <><div className="text-slate-500">Received {formatDate(r.submittedOn)}{r.submittedOn > r.dueOn ? " (late)" : ""}</div><p className="whitespace-pre-line">{r.text}</p></>
            : <Empty>Requested {formatDate(r.requestedOn)}, due {formatDate(r.dueOn)}. Not received yet.</Empty>}
        </div>
      ))}
    </Card>
  );
}
