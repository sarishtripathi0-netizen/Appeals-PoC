// Orders on a penalty (stay, reduction, set-aside) and the write-off request, for the users allowed to record them,
// and the record of what has been ordered, refunded and written off (E5, E6, E18).

import { adjust, lift, stay, writeOffRequest } from "@/app/actions/exceptions";
import { formatDate } from "@/domain/dates";
import { ACTIVE, FINAL, type PenaltyStatus } from "@/domain/penalty-machine";
import { rupees } from "@/lib/view";
import type { LoadedPenalty } from "./PenaltyPanels";
import { Badge, Card, HiddenBack } from "./ui";

const RECORDERS = ["SEWA_SETU_DDO", "REGISTRAR", "COMMISSIONER", "CHIEF_COMMISSIONER"];
const AUTHORITY = { HIGHER_AUTHORITY: "Higher authority", COMMISSION: "RTPS Commission", COURT: "Court" } as Record<string, string>;

function OrderFields({ id }: { id: string }) {
  return (
    <>
      <div>
        <label className="label" htmlFor={`auth-${id}`}>Order of</label>
        <select id={`auth-${id}`} name="authority" className="input">
          <option value="COURT">Court</option>
          <option value="COMMISSION">RTPS Commission</option>
          <option value="HIGHER_AUTHORITY">Higher appellate authority</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`ref-${id}`}>Order reference</label>
        <input id={`ref-${id}`} name="orderRef" className="input" placeholder="For example: WP(C) 1234/2026" required />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`doc-${id}`}>Copy of the order</label>
        <input id={`doc-${id}`} name="document" type="file" accept=".pdf,.jpg,.jpeg,.png" className="text-sm" required />
      </div>
    </>
  );
}

export function PenaltyActions({ p, user, back }: { p: LoadedPenalty; user: { id: string; role: string }; back: string }) {
  const status = p.status as PenaltyStatus;
  const recorder = RECORDERS.includes(user.role);
  const reviewer = recorder || user.id === p.imposedById || (user.role === "SAA" && p.imposedByLevel === "FAA");
  const canStay = recorder && ACTIVE.includes(status);
  const canLift = recorder && status === "STAYED";
  const canAdjust = reviewer && !FINAL.includes(status) && status !== "REDUCED";
  const canSetAside = reviewer && status !== "SET_ASIDE" && status !== "WRITTEN_OFF";
  const canWriteOff = user.role === "SEWA_SETU_DDO" && ["EXCEPTION", "IN_RECOVERY", "PARTLY_DEDUCTED"].includes(status);
  if (!canStay && !canLift && !canAdjust && !canSetAside && !canWriteOff) return null;
  return (
    <Card title="Orders and write-off">
      <div className="space-y-4">
        {canStay ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-brand-700">Record a stay</summary>
            <form action={stay} className="mt-2 grid gap-2 sm:grid-cols-2">
              <HiddenBack value={back} /><input type="hidden" name="penaltyId" value={p.id} />
              <OrderFields id="stay" />
              <div><button className="btn-primary btn-sm" data-testid="record-stay">Record stay</button></div>
            </form>
          </details>
        ) : null}
        {canLift ? (
          <form action={lift} className="grid gap-2 sm:grid-cols-2">
            <HiddenBack value={back} /><input type="hidden" name="penaltyId" value={p.id} />
            <div className="sm:col-span-2 text-sm font-medium">Lift the stay</div>
            <OrderFields id="lift" />
            <div><button className="btn-secondary btn-sm">Lift stay</button></div>
          </form>
        ) : null}
        {canAdjust ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-brand-700">Reduce the penalty (review, appeal or court)</summary>
            <form action={adjust} className="mt-2 grid gap-2 sm:grid-cols-2">
              <HiddenBack value={back} /><input type="hidden" name="penaltyId" value={p.id} /><input type="hidden" name="kind" value="REDUCED" />
              <div><label className="label" htmlFor="newAmount">New amount (Rs.), now {rupees(p.amount)}</label><input id="newAmount" name="newAmount" type="number" min={1} max={p.amount - 1} className="input" required /></div>
              <OrderFields id="reduce" />
              <div><button className="btn-secondary btn-sm">Record reduction</button></div>
            </form>
          </details>
        ) : null}
        {canSetAside ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-rose-700">Set the penalty aside</summary>
            <form action={adjust} className="mt-2 grid gap-2 sm:grid-cols-2">
              <HiddenBack value={back} /><input type="hidden" name="penaltyId" value={p.id} /><input type="hidden" name="kind" value="SET_ASIDE" /><input type="hidden" name="newAmount" value="0" />
              <OrderFields id="setaside" />
              <div><button className="btn-danger btn-sm" data-testid="set-aside">Record set-aside</button></div>
            </form>
          </details>
        ) : null}
        {canWriteOff ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-brand-700">Request a write-off (Competent Authority to approve)</summary>
            <form action={writeOffRequest} className="mt-2 space-y-2">
              <HiddenBack value={back} /><input type="hidden" name="penaltyId" value={p.id} />
              <label className="label" htmlFor="woReason">Why it cannot be recovered</label>
              <textarea id="woReason" name="reason" rows={2} className="input" required />
              <button className="btn-secondary btn-sm" data-testid="request-write-off">Send for approval</button>
            </form>
          </details>
        ) : null}
      </div>
    </Card>
  );
}

export function OrdersRecord({ p }: { p: LoadedPenalty }) {
  if (!p.stays.length && !p.adjustments.length && !p.refunds.length && !p.writeOffs.length) return null;
  return (
    <Card title="Stays, reductions, refunds and write-offs">
      <ul className="space-y-1 text-sm">
        {p.stays.map((s) => <li key={s.id}><Badge tone="amber">Stay</Badge> {AUTHORITY[s.authority]} order {s.orderRef} ({s.documentName}) from {formatDate(s.startOn)}{s.liftedOn ? `, lifted ${formatDate(s.liftedOn)}` : ", in force"}{s.daysRemaining !== null ? ` · ${s.daysRemaining} days were left to pay` : ""}</li>)}
        {p.adjustments.map((a) => <li key={a.id}><Badge tone="purple">{a.kind === "SET_ASIDE" ? "Set aside" : "Reduced"}</Badge> {rupees(a.fromAmount)} → {rupees(a.toAmount)} by {AUTHORITY[a.byAuthority]} order {a.orderRef} ({a.documentName}), {formatDate(a.recordedOn)}</li>)}
        {p.refunds.map((r) => <li key={r.id}><Badge tone={r.status === "DUE" ? "amber" : "green"}>Refund</Badge> {rupees(r.amount)} · {r.reason === "DOUBLE_RECOVERY" ? "paid through eGRAS and also deducted (double recovery)" : r.reason === "EXCESS_PAYMENT" ? "paid more than due" : r.reason === "SET_ASIDE" ? "penalty set aside" : "penalty reduced"} · {r.status === "DUE" ? "due" : `refunded ${formatDate(r.refundedOn)}, reference ${r.reference}`}</li>)}
        {p.writeOffs.map((w) => <li key={w.id}><Badge tone={w.status === "APPROVED" ? "grey" : w.status === "REJECTED" ? "red" : "amber"}>Write-off</Badge> {rupees(w.amount)} · {w.reason} · {w.status === "REQUESTED" ? `requested ${formatDate(w.requestedOn)}, awaiting the Competent Authority` : `${w.status === "APPROVED" ? "approved" : "not approved"} ${formatDate(w.decidedOn)}${w.esignRef ? ` (${w.esignRef})` : ""}`}</li>)}
      </ul>
    </Card>
  );
}
