import { notFound } from "next/navigation";
import { deduct } from "@/app/actions/recovery";
import { DeductionsPanel, loadTicket, TicketSummary } from "@/components/RecoveryPanels";
import { loadPenalty } from "@/components/PenaltyPanels";
import { Back, Card, FeatureRef, Flash, HiddenBack, type SP } from "@/components/ui";
import { monthName, nextPayMonth, type Instalment } from "@/domain/recovery";
import { getRuleContext } from "@/lib/context";
import { parseJson, prisma } from "@/lib/db";
import { homeFor, requireUser } from "@/lib/session";
import { currentUrl } from "@/lib/url";
import { rupees } from "@/lib/view";
import { amountsOf } from "@/services/penalties";

const CAN_VIEW = ["FINANCE_NODAL", "FINANCE_SENIOR", "SEWA_SETU_DDO", "REGISTRAR", "COMMISSIONER", "CHIEF_COMMISSIONER"];

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const u = await requireUser();
  if (!CAN_VIEW.includes(u.role)) notFound();
  const { id } = await params;
  const t = await loadTicket(id);
  if (!t) notFound();
  const [{ today, cal }, back] = await Promise.all([getRuleContext(), currentUrl()]);
  const isAssignee = u.id === t.assigneeId && t.status === "OPEN";
  const plan = parseJson<Instalment[]>(t.plan, []);
  const month = plan[0]?.month ?? nextPayMonth(today, cal);
  // Suggested split of this month's instalment across the lines, oldest first.
  let toAllocate = plan[0]?.amount ?? 0;
  const lines = await Promise.all(t.lines.map(async (l) => {
    const due = (await amountsOf(prisma, l.penalty)).outstanding;
    const suggest = l.status === "ACTIVE" ? Math.min(due, toAllocate) : 0;
    toAllocate -= suggest;
    return { l, due, suggest };
  }));
  const penalties = await Promise.all(t.lines.map((l) => loadPenalty({ id: l.penaltyId })));

  return (
    <div className="space-y-4">
      <Back href={u.role === "FINANCE_NODAL" ? "/finance" : homeFor(u.role)}>Back</Back>
      <FeatureRef ids={["AMS-92", "AMS-93", "E12", "E13"]} />
      <Flash searchParams={searchParams} />
      <TicketSummary t={t} today={today} />
      {isAssignee ? (
        <Card title={`Record deductions: ${monthName(month)} salary`}>
          <p className="muted mb-3">Enter what was actually deducted for each line. A part deduction is fine; the balance carries to the next month. Leave the payroll reference empty to fetch one from the payroll system (demo).</p>
          {lines.filter((x) => x.l.status === "ACTIVE").map(({ l, due, suggest }) => (
            <form key={l.id} action={deduct} className="mb-3 grid gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-3">
              <HiddenBack value={back} />
              <input type="hidden" name="lineId" value={l.id} />
              <div className="sm:col-span-3 text-sm font-medium">{l.penalty.ref} · UIN {l.penalty.uin} · {rupees(due)} still due</div>
              <div><label className="label" htmlFor={`m-${l.id}`}>Salary month</label><input id={`m-${l.id}`} name="salaryMonth" type="month" defaultValue={month} className="input" required /></div>
              <div><label className="label" htmlFor={`a-${l.id}`}>Amount deducted (Rs.)</label><input id={`a-${l.id}`} name="amount" type="number" min={1} max={due} defaultValue={suggest || due} className="input" required /></div>
              <div><label className="label" htmlFor={`p-${l.id}`}>Payroll deduction reference</label><input id={`p-${l.id}`} name="payrollRef" className="input" placeholder="Fetched if empty" /></div>
              <div><label className="label" htmlFor={`v-${l.id}`}>Treasury voucher number</label><input id={`v-${l.id}`} name="voucherNo" className="input" required /></div>
              <div className="sm:col-span-2"><label className="label" htmlFor={`f-${l.id}`}>Proof of deduction</label><input id={`f-${l.id}`} name="proof" type="file" accept=".pdf,.jpg,.jpeg,.png" className="text-sm" /><input type="hidden" name="proofName" value="" /></div>
              <div><button className="btn-primary" data-testid="record-deduction">Record deduction</button></div>
            </form>
          ))}
        </Card>
      ) : null}
      {penalties.filter((p) => p && p.deductions.length).map((p) => <DeductionsPanel key={p!.id} p={p!} />)}
    </div>
  );
}
