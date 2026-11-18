import { notFound } from "next/navigation";
import { forceFail, pay } from "@/app/actions/penalties";
import { loadPenalty, PaymentsPanel } from "@/components/PenaltyPanels";
import { Back, Card, FeatureRef, Flash, HiddenBack, KV, type SP } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { FINAL, type PenaltyStatus } from "@/domain/penalty-machine";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { currentUrl } from "@/lib/url";
import { rupees } from "@/lib/view";
import { amountsOf } from "@/services/penalties";

/** Mock eGRAS payment page (step 2). Only the penalised officer pays here. */
export default async function EgrasPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: SP }) {
  const u = await requireUser();
  const { ref } = await params;
  const p = await loadPenalty({ ref });
  if (!p || !u.employeeId || u.employeeId !== p.employeeId) notFound();
  const [a, back] = await Promise.all([amountsOf(prisma, p), currentUrl()]);
  const pending = p.grns.filter((g) => g.status === "PENDING");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Back href={`/penalties/${p.id}`}>Back to the penalty</Back>
      <FeatureRef ids={["AMS-87", "AMS-88", "COM-14"]} note="eGRAS is simulated" />
      <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm"><strong>Demo:</strong> this stands in for the Government Receipt Accounting System (eGRAS). No money moves.</div>
      <Flash searchParams={searchParams} />
      <Card title="eGRAS: pay a Government penalty">
        <KV items={[
          ["Penalty reference", p.ref],
          ["Unique Identification Number (UIN)", p.uin],
          ["Payer", `${p.officerName} (employee ID ${p.employeeId})`],
          ["Head of account", p.headOfAccount],
          ["Amount due", rupees(a.outstanding)],
          ["Last date (QR)", formatDate(p.dueOn, true)],
        ]} />
        {a.outstanding > 0 && p.qrActive ? (
          <form action={pay} className="mt-4">
            <HiddenBack value={back} />
            <input type="hidden" name="ref" value={p.ref} />
            <input type="hidden" name="channel" value="QR" />
            <input type="hidden" name="amount" value={a.outstanding} />
            <button className="btn-primary" data-testid="pay-exact">Pay {rupees(a.outstanding)} (scan QR)</button>
          </form>
        ) : a.outstanding > 0 ? (
          <p className="mt-4 text-sm text-slate-600">The QR code is switched off for this penalty. A challan quoting the reference can still be paid below.</p>
        ) : <p className="mt-4 text-sm text-emerald-700">Nothing is due on this penalty.</p>}
      </Card>
      {!FINAL.includes(p.status as PenaltyStatus) ? (
        <Card title="Pay by challan (demo: any amount)">
          <p className="muted mb-2">A challan paid outside the QR code, quoting the reference. eGRAS accepts it even if the amount was already deducted from salary. Use it to show a late payment, a short or excess payment, or a double recovery.</p>
          <form action={pay} className="flex flex-wrap items-end gap-2">
            <HiddenBack value={back} />
            <input type="hidden" name="ref" value={p.ref} />
            <input type="hidden" name="channel" value="CHALLAN" />
            <div>
              <label className="label" htmlFor="amount">Amount (Rs.)</label>
              <input id="amount" name="amount" type="number" min={1} defaultValue={a.outstanding || p.amount} className="input max-w-[10rem]" required />
            </div>
            <button className="btn-secondary" data-testid="pay-challan">Pay challan</button>
          </form>
        </Card>
      ) : null}
      {pending.length ? (
        <Card title="Demo control: receipts awaiting settlement">
          <ul className="space-y-2 text-sm">
            {pending.map((g) => (
              <li key={g.grn} className="flex flex-wrap items-center justify-between gap-2">
                <span>{g.grn} · {rupees(g.amount)} · settles {formatDate(g.settlesOn)}{g.forceFail ? " · will fail" : ""}</span>
                {!g.forceFail ? (
                  <form action={forceFail}>
                    <HiddenBack value={back} />
                    <input type="hidden" name="grn" value={g.grn} />
                    <button className="btn-danger btn-sm">Make this receipt fail</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <PaymentsPanel p={p} />
    </div>
  );
}
