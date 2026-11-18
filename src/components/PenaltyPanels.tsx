// Penalty screens shared by the officer, the Sewa Setu DDO, Finance and the Commission (PLAN.md Part 2, §P6).

import Link from "next/link";
import { formatDate } from "@/domain/dates";
import { qrPayload } from "@/domain/penalty";
import { penaltyMachine, type PenaltyStatus } from "@/domain/penalty-machine";
import { prisma } from "@/lib/db";
import { qrSvg } from "@/lib/qr";
import { ROLE_LABELS } from "@/lib/session";
import { rupees } from "@/lib/view";
import { amountsOf, LEVEL_AUTHORITY } from "@/services/penalties";
import { Badge, Card, Empty, KV, type Tone } from "./ui";

export async function loadPenalty(where: { id: string } | { ref: string }) {
  return prisma.penalty.findUnique({
    where,
    include: { grns: { orderBy: { paidAt: "asc" } }, deductions: { orderBy: { recordedOn: "asc" } }, refunds: true, stays: true, adjustments: true, writeOffs: true, directions: true, lines: { include: { ticket: true } } },
  });
}
export type LoadedPenalty = NonNullable<Awaited<ReturnType<typeof loadPenalty>>>;

export function penaltyStatusLabel(s: string) {
  return penaltyMachine.statusLabels[s as PenaltyStatus] ?? s;
}

export function penaltyTone(s: string): Tone {
  switch (s) {
    case "CLOSED": case "PAID_EGRAS": case "CREDIT_CONFIRMED": case "RECOVERED": case "REFUNDED": return "green";
    case "RAISED": return "blue";
    case "OVERDUE": case "UNPAID_CONFIRMED": case "REFUND_DUE": case "STAYED": case "WRITE_OFF_REQUESTED": return "amber";
    case "CREDIT_MISSING": case "ESCALATED": case "EXCEPTION": return "red";
    default: return "purple";
  }
}

/** The penalty card: everything the officer needs, with the eGRAS QR code while it is active. */
export async function PenaltyCard({ p, forOfficer, linkToDetail }: { p: LoadedPenalty; forOfficer: boolean; linkToDetail?: boolean }) {
  const a = await amountsOf(prisma, p);
  const qr = p.qrActive && a.outstanding > 0 ? await qrSvg(qrPayload({ ref: p.ref, uin: p.uin, amount: a.outstanding, headOfAccount: p.headOfAccount })) : null;
  const pending = p.grns.filter((g) => g.status === "PENDING");
  return (
    <Card
      title={<span>Penalty {p.ref} <span className="text-sm font-normal text-slate-500">{rupees(p.amount)}</span></span>}
      actions={<Badge tone={penaltyTone(p.status)}>{penaltyStatusLabel(p.status)}</Badge>}
    >
      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <KV items={[
          ["Unique Identification Number (UIN)", p.uin],
          ["Appeal number", p.appealNo],
          ["Imposed by", LEVEL_AUTHORITY[p.imposedByLevel] ?? p.imposedByLevel],
          ["On", `${p.officerName}, ${p.designation} (employee ID ${p.employeeId})`],
          ["Amount", `${rupees(p.amount)}${p.amount !== p.originalAmount ? ` (originally ${rupees(p.originalAmount)})` : ""}`],
          ["Paid or recovered so far", rupees(a.net)],
          ["Still due", rupees(a.outstanding)],
          ["Order date", formatDate(p.orderDate)],
          ["Last date to pay through eGRAS", formatDate(p.dueOn, true)],
          ["Head of account", p.headOfAccount],
        ]} />
        {qr ? (
          <div className="text-center">
            {/* The QR code is generated on the server from our own payload. */}
            <div className="inline-block rounded-md border border-slate-200 bg-white p-1" dangerouslySetInnerHTML={{ __html: qr }} aria-label={`eGRAS QR code for ${rupees(a.outstanding)}`} role="img" />
            <div className="text-xs text-slate-500">eGRAS QR (demo) for {rupees(a.outstanding)}</div>
            {forOfficer ? <Link href={`/egras/${p.ref}`} className="btn-primary btn-sm mt-2" data-testid="pay-egras">Pay through eGRAS</Link> : null}
          </div>
        ) : forOfficer && a.outstanding > 0 && !["STAYED", "WRITE_OFF_REQUESTED"].includes(p.status) ? (
          <div className="max-w-[14rem] text-sm text-slate-600">
            The QR code is switched off. {["UNPAID_CONFIRMED", "IN_RECOVERY", "PARTLY_DEDUCTED"].includes(p.status) ? "The penalty is not yet paid; recovery from salary will follow. " : ""}
            You can still pay by an <Link className="underline" href={`/egras/${p.ref}`}>eGRAS challan</Link> quoting {p.ref}.
          </div>
        ) : forOfficer && ["DEDUCTED", "RECOVERED"].includes(p.status) ? (
          <div className="max-w-[14rem] text-sm text-slate-600">
            Recovered from your salary. <Link className="underline" href={`/egras/${p.ref}`}>eGRAS challan</Link> (demo: paying again shows a double recovery and refund).
          </div>
        ) : null}
      </div>
      {pending.length ? <p className="mt-3 rounded-md bg-sky-50 p-2 text-sm text-sky-900">Payment {pending.map((g) => `${g.grn} (${rupees(g.amount)})`).join(", ")} is being confirmed by eGRAS.</p> : null}
      {linkToDetail ? <p className="mt-3 text-sm"><Link className="text-brand-700 underline" href={`/penalties/${p.id}`}>Details, proof of service and history</Link></p> : null}
    </Card>
  );
}

/** Proof of service (E17): when the order reached the dashboard, the SMS and email log, and when the officer first opened it. */
export async function ProofOfService({ p }: { p: LoadedPenalty }) {
  const messages = await prisma.notification.findMany({ where: { entityType: "penalty", entityId: p.id, recipientId: p.officerId }, orderBy: { seq: "asc" }, take: 3 });
  const ts = (iso: string | null) => (iso ? iso.slice(0, 19).replace("T", " ") : "");
  return (
    <Card title="Proof of service">
      <KV items={[
        ["Posted on the officer's dashboard", `${formatDate(p.dashboardPostedOn, true)} (recorded ${ts(p.dashboardPostedAt)})`],
        ["SMS and email sent", p.messageSentOn ? `${formatDate(p.messageSentOn, true)} (recorded ${ts(p.messageSentAt)})` : "Not yet"],
        ["Deemed service date", formatDate(p.serviceDate, true)],
        ["First opened by the officer", p.firstViewedOn ? `${formatDate(p.firstViewedOn, true)} (recorded ${ts(p.firstViewedAt)})` : "Not yet opened"],
      ]} />
      <ul className="mt-3 space-y-1 text-xs text-slate-600">
        {messages.map((m) => <li key={m.id}><Badge tone="grey">{m.channel === "DASHBOARD" ? "Dashboard" : m.channel === "EMAIL" ? "Email" : "SMS"}</Badge> {m.address ? `to ${m.address} · ` : ""}{m.text}</li>)}
      </ul>
    </Card>
  );
}

export function PaymentsPanel({ p }: { p: LoadedPenalty }) {
  return (
    <Card title="Payments through eGRAS">
      {p.grns.length === 0 ? <Empty>No payments yet.</Empty> : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Receipt (GRN)</th><th>Paid on</th><th>How</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {p.grns.map((g) => (
                <tr key={g.grn}>
                  <td className="font-mono text-xs">{g.grn}</td>
                  <td>{formatDate(g.paidOn)}</td>
                  <td>{g.channel === "QR" ? "QR code" : "Challan"}</td>
                  <td>{rupees(g.amount)}</td>
                  <td><Badge tone={g.status === "SUCCESS" ? "green" : g.status === "FAILED" ? "red" : "blue"}>{g.status === "SUCCESS" ? `Confirmed ${formatDate(g.settledOn)}` : g.status === "FAILED" ? "Failed" : `Pending until ${formatDate(g.settlesOn)}`}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const PENALTY_ACTIONS: Record<string, string> = {
  "penalty.raise": "Penalty imposed; order posted on the dashboard and SMS and email sent",
  "penalty.firstView": "Opened by the officer for the first time",
  "penalty.payment": "Payment made through eGRAS (receipt pending)",
  "penalty.grnSuccess": "eGRAS receipt confirmed",
  "penalty.grnFailed": "eGRAS receipt failed",
  "penalty.demoForceFail": "Demo: receipt set to fail",
  "penalty.settlePaid": "Paid in full through eGRAS",
  "penalty.close": "Closed",
  "penalty.refundDue": "More collected than due: refund due",
  "penalty.dueDatePassed": "Last date passed without full payment",
  "penalty.confirmUnpaid": "Confirmed as not paid; QR code switched off; recovery from salary to follow",
  "penalty.directionAttached": "Standing Recovery Direction attached",
  "penalty.directionSent": "Recovery Direction sent to the Competent Authority for signature",
  "penalty.directionSigned": "Recovery Direction signed by the Competent Authority",
  "penalty.addToTicket": "Sent to the Finance nodal officer for recovery from salary",
  "penalty.ticketLine": "Added to the officer's recovery ticket",
  "penalty.routeToException": "Moved to the exceptions queue",
  "penalty.recordDeduction": "Deduction from salary recorded by Finance, with proof",
  "penalty.verifyDeduction": "Deduction proof verified by the Sewa Setu DDO",
  "penalty.returnDeduction": "Deduction entry returned to Finance",
  "penalty.creditReceived": "Credit to the head of account received from the treasury",
  "penalty.creditsMatched": "All deductions credited to the head of account",
  "penalty.creditMissing": "Credit not seen within the credit window; follow-up task for Finance",
  "penalty.creditWindowPassed": "Marked credit missing",
  "penalty.creditEscalated": "Missing credit escalated to the Finance senior officer and the Commission",
  "penalty.escalationPeriodPassed": "Escalated: credit still not seen",
  "penalty.creditFollowUp": "Finance followed up the missing credit with the treasury",
  "penalty.ticketEscalated": "Recovery overdue: ticket escalated to the Finance senior officer",
  "penalty.lineRemoved": "Taken off the recovery ticket; Finance told to stop deducting",
  "penalty.lineOnHold": "Recovery ticket line put on hold; Finance told to stop deducting",
  "penalty.stay": "Stay recorded",
  "penalty.liftStay": "Stay lifted",
  "penalty.reduce": "Penalty reduced by order",
  "penalty.setAside": "Penalty set aside by order",
  "penalty.resume": "Penalty continues at the revised amount",
  "penalty.recordRefund": "Refund made by Finance",
  "penalty.afterRefund": "Settled after the refund",
  "penalty.officerStatusChanged": "Moved to the exceptions queue after a change in staff records",
  "penalty.resolveAndResume": "Exception resolved; recovery resumed",
  "penalty.correctEmployeeId": "Employee ID corrected by the Sewa Setu DDO",
  "penalty.recordManualRecovery": "Recovered through the paying authority (recorded by hand)",
  "penalty.requestWriteOff": "Write-off requested",
  "penalty.approveWriteOff": "Write-off approved by the Competent Authority",
  "penalty.rejectWriteOff": "Write-off not approved by the Competent Authority",
};

/** Everything that happened to the penalty, from the audit log and the messages log, in order. */
export async function PenaltyTimeline({ p }: { p: LoadedPenalty }) {
  const [events, messages] = await Promise.all([
    prisma.auditEvent.findMany({ where: { entityType: "penalty", entityId: p.id }, orderBy: { id: "asc" } }),
    prisma.notification.findMany({ where: { entityType: "penalty", entityId: p.id }, orderBy: { seq: "asc" } }),
  ]);
  const rows = [
    ...events.map((e) => ({ key: `a${e.id}`, on: e.simDate, at: e.realTs, kind: "event" as const, text: PENALTY_ACTIONS[e.action] ?? e.action.replace("penalty.", ""), who: `${e.actorName} (${ROLE_LABELS[e.actorRole] ?? e.actorRole})`, refused: e.outcome === "REFUSED", status: e.beforeStatus !== e.afterStatus ? e.afterStatus : null })),
    // Messages have no wall-clock time; on the same simulated day they follow the events, in log order.
    ...messages.map((m) => ({ key: `n${m.id}`, on: m.sentOn, at: `~${String(m.seq).padStart(8, "0")}`, kind: "message" as const, text: m.text, who: `${m.channel === "DASHBOARD" ? "Dashboard" : m.channel === "EMAIL" ? "Email" : "SMS"} to ${m.recipientLabel}`, refused: false, status: null })),
  ].sort((x, y) => x.on.localeCompare(y.on) || x.at.localeCompare(y.at));
  return (
    <Card title="History" actions={<Link href={`/audit?case=${encodeURIComponent(p.uin)}`} className="text-sm text-brand-700 underline">Audit log for this UIN</Link>}>
      <ol className="space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-wrap gap-x-2">
            <span className="w-24 shrink-0 text-slate-500">{formatDate(r.on)}</span>
            {r.kind === "message" ? <span className="text-slate-600">✉ {r.who}: {r.text}</span> : (
              <>
                <span className={r.refused ? "text-rose-700" : ""}>{r.refused ? "Refused: " : ""}{r.text}</span>
                {r.status ? <Badge tone={penaltyTone(r.status)}>{penaltyStatusLabel(r.status)}</Badge> : null}
                <span className="text-slate-500">by {r.who}</span>
              </>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
