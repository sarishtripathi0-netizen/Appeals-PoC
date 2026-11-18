import Link from "next/link";
import { confirm, returnIt, verify } from "@/app/actions/recovery";
import { closeUnmatched, manual, resume } from "@/app/actions/exceptions";
import { drop } from "@/app/actions/reconciliation";
import { PenaltyTable } from "@/components/PenaltyTable";
import { StatementList } from "@/components/StatementView";
import { Badge, Card, Empty, FeatureRef, Flash, HiddenBack, one, PageHeader, Planned, type SP } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { EXCEPTION_LABELS, monthName, type ExceptionKind, type Instalment } from "@/domain/recovery";
import { getToday } from "@/lib/context";
import { parseJson, prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { currentUrl } from "@/lib/url";
import { rupees } from "@/lib/view";
import { amountsOf } from "@/services/penalties";
import { proofCheck } from "@/services/recovery";

const TABS = [
  { key: "confirm", label: "Confirm unpaid" },
  { key: "tickets", label: "Tickets" },
  { key: "verify", label: "Verify proof" },
  { key: "exceptions", label: "Exceptions" },
  { key: "refunds", label: "Refunds" },
  { key: "credit", label: "Credit missing" },
  { key: "statement", label: "Monthly statement" },
  { key: "all", label: "All penalties" },
];

export default async function RecoveryWorkbench({ searchParams }: { searchParams: SP }) {
  await requireUser(["SEWA_SETU_DDO"]);
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === one(sp.tab)) ?? TABS[0];
  const [today, back] = await Promise.all([getToday(), currentUrl()]);
  const counts = {
    confirm: await prisma.penalty.count({ where: { status: "OVERDUE" } }),
    verify: await prisma.deduction.count({ where: { verification: "SUBMITTED" } }),
    exceptions: await prisma.exceptionCase.count({ where: { status: "OPEN" } }),
    refunds: await prisma.refund.count({ where: { status: "DUE" } }),
    credit: await prisma.deduction.count({ where: { credit: { in: ["MISSING", "ESCALATED"] } } }),
  } as Record<string, number>;

  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-90", "AMS-92", "AMS-94", "AMS-98"]} />
      <PageHeader title="Recovery workbench" subtitle="Sewa Setu Drawing and Disbursing Officer (DDO), AITEC & CSD Society. Unpaid penalties are recovered centrally from salary through the Finance nodal officer." />
      <Flash searchParams={searchParams} />
      <nav className="flex flex-wrap gap-2 text-sm">
        {TABS.map((t) => (
          <Link key={t.key} href={`/recovery?tab=${t.key}`} className={`rounded-full border px-3 py-1 ${t.key === tab.key ? "border-brand-600 bg-brand-50 font-medium text-brand-800" : "border-slate-300 bg-white"}`}>
            {t.label}{counts[t.key] ? ` (${counts[t.key]})` : ""}
          </Link>
        ))}
      </nav>
      {tab.key === "confirm" ? <ConfirmTab back={back} /> : null}
      {tab.key === "tickets" ? <TicketsTab today={today} /> : null}
      {tab.key === "verify" ? <VerifyTab back={back} /> : null}
      {tab.key === "exceptions" ? <ExceptionsTab back={back} /> : null}
      {tab.key === "refunds" ? <RefundsTab /> : null}
      {tab.key === "credit" ? <CreditTab back={back} /> : null}
      {tab.key === "statement" ? <StatementList /> : null}
      {tab.key === "all" ? <Card><PenaltyTable penalties={await prisma.penalty.findMany({ orderBy: { orderDate: "desc" } })} /></Card> : null}
    </div>
  );
}

async function ConfirmTab({ back }: { back: string }) {
  const overdue = await prisma.penalty.findMany({ where: { status: "OVERDUE" }, include: { grns: true }, orderBy: { dueOn: "asc" } });
  return (
    <Card title="Last date passed: confirm not paid">
      <p className="muted mb-3">Confirming switches off the QR code, tells the officer that recovery from salary will follow, and attaches the Recovery Direction. A case with an eGRAS payment still being confirmed cannot be confirmed until it settles.</p>
      {overdue.length === 0 ? <Empty>Nothing to confirm.</Empty> : (
        <ul className="divide-y divide-slate-100 text-sm">
          {await Promise.all(overdue.map(async (p) => {
            const a = await amountsOf(prisma, p);
            const pending = p.grns.filter((g) => g.status === "PENDING");
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <Link className="font-medium text-brand-700 hover:underline" href={`/penalties/${p.id}`}>{p.ref}</Link> · {p.officerName} ({p.employeeId}) · UIN {p.uin} · last date {formatDate(p.dueOn)} · <strong>{rupees(a.outstanding)}</strong> outstanding
                  {pending.length ? <div className="text-xs text-sky-800">eGRAS payment {pending.map((g) => `${g.grn} (${rupees(g.amount)}) settles ${formatDate(g.settlesOn)}`).join(", ")}: please wait.</div> : null}
                </span>
                <form action={confirm}>
                  <HiddenBack value={back} />
                  <input type="hidden" name="penaltyId" value={p.id} />
                  <button className="btn-primary btn-sm" data-testid={`confirm-${p.ref}`}>Confirm not paid</button>
                </form>
              </li>
            );
          }))}
        </ul>
      )}
    </Card>
  );
}

async function TicketsTab({ today }: { today: string }) {
  const tickets = await prisma.ticket.findMany({ where: { status: "OPEN" }, include: { lines: { include: { penalty: true } } }, orderBy: [{ priority: "desc" }, { createdOn: "asc" }] });
  const names = new Map((await prisma.user.findMany({ where: { role: "FINANCE_NODAL" } })).map((u) => [u.id, u.name]));
  return (
    <Card title="Open recovery tickets">
      {tickets.length === 0 ? <Empty>No open tickets.</Empty> : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Ticket</th><th>Officer</th><th>Lines</th><th>Next instalment</th><th>With</th></tr></thead>
            <tbody>
              {tickets.map((t) => {
                const next = parseJson<Instalment[]>(t.plan, [])[0];
                return (
                  <tr key={t.id}>
                    <td><Link className="font-medium text-brand-700 hover:underline" href={`/finance/tickets/${t.id}`}>{t.ticketNo}</Link>{t.priority === "RETIREMENT" ? <> <Badge tone="red">retiring</Badge></> : null}</td>
                    <td>{t.lines[0]?.penalty.officerName}<div className="text-xs text-slate-500">{t.employeeId}</div></td>
                    <td>{t.lines.filter((l) => l.status === "ACTIVE" || l.status === "ON_HOLD").length}</td>
                    <td>{next ? <>{rupees(next.amount)} from {monthName(next.month)} salary <Badge tone={next.dueOn < today ? "red" : "grey"}>{next.dueOn < today ? `overdue since ${formatDate(next.dueOn)}` : `by ${formatDate(next.dueOn)}`}</Badge></> : "—"}</td>
                    <td>{names.get(t.assigneeId)}{t.bothOnLeave ? <> <Badge tone="amber">both on leave</Badge></> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function VerifyTab({ back }: { back: string }) {
  const pending = await prisma.deduction.findMany({ where: { verification: "SUBMITTED" }, include: { penalty: true }, orderBy: { recordedOn: "asc" } });
  return (
    <Card title="Deductions to verify">
      <p className="muted mb-3">Check the proof against the ticket line (employee ID, UIN, amount). A deduction cannot be marked recovered without the nodal officer&apos;s proof.</p>
      {pending.length === 0 ? <Empty>Nothing to verify.</Empty> : (
        <ul className="space-y-3">
          {await Promise.all(pending.map(async (d) => {
            const line = d.ticketLineId ? await prisma.ticketLine.findUnique({ where: { id: d.ticketLineId }, include: { ticket: true } }) : null;
            const problem = proofCheck(d, d.penalty, line?.ticket ?? null, line?.amount ?? null);
            return (
              <li key={d.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span><Link className="font-medium text-brand-700 hover:underline" href={`/penalties/${d.penaltyId}`}>{d.penalty.ref}</Link> · {d.penalty.officerName}</span>
                  <span>{rupees(d.amount)} · {monthName(d.salaryMonth)} salary</span>
                </div>
                <ul className="mt-1 grid gap-x-4 text-xs sm:grid-cols-2">
                  <li>Employee ID: {d.penalty.employeeId} {line && line.ticket.employeeId === d.penalty.employeeId ? "✓ matches the ticket" : ""}</li>
                  <li>UIN: {d.penalty.uin}</li>
                  <li>Payroll reference: {d.payrollRef}</li>
                  <li>Treasury voucher: {d.voucherNo}</li>
                  <li>Proof: {d.proofFile || "none"}</li>
                  <li>Recorded {formatDate(d.recordedOn)}</li>
                </ul>
                {problem ? <p className="mt-1 text-rose-700">{problem}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <form action={verify}>
                    <HiddenBack value={back} />
                    <input type="hidden" name="deductionId" value={d.id} />
                    <button className="btn-primary btn-sm" data-testid="verify-deduction">Proof checked: mark verified</button>
                  </form>
                  <form action={returnIt} className="flex flex-wrap gap-1">
                    <HiddenBack value={back} />
                    <input type="hidden" name="deductionId" value={d.id} />
                    <input name="reason" className="input max-w-xs" placeholder="What is wrong" aria-label="Reason for returning" required />
                    <button className="btn-secondary btn-sm">Return to Finance</button>
                  </form>
                </div>
              </li>
            );
          }))}
        </ul>
      )}
    </Card>
  );
}

async function ExceptionsTab({ back }: { back: string }) {
  const cases = await prisma.exceptionCase.findMany({ where: { status: "OPEN" }, include: { penalty: true }, orderBy: { openedOn: "asc" } });
  const resolved = await prisma.exceptionCase.findMany({ where: { status: "RESOLVED" }, include: { penalty: true }, orderBy: { resolvedOn: "desc" }, take: 10 });
  return (
    <div className="space-y-4">
      <Card title="Exceptions queue">
        <p className="muted mb-3">Penalties that cannot go on a normal salary-recovery ticket. Handle each by hand and record what was done.</p>
        {cases.length === 0 ? <Empty>No open exceptions.</Empty> : (
          <ul className="space-y-4">
            {await Promise.all(cases.map(async (c) => {
              const due = c.penalty ? (await amountsOf(prisma, c.penalty)).outstanding : 0;
              const canResume = c.kind === "SUSPENDED" || c.kind === "STAFF_RECORD_MISMATCH";
              return (
                <li key={c.id} className="rounded-md border border-rose-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><Badge tone="red">{EXCEPTION_LABELS[c.kind as ExceptionKind] ?? c.kind}</Badge> {c.penalty ? <><Link className="font-medium text-brand-700 hover:underline" href={`/penalties/${c.penalty.id}`}>{c.penalty.ref}</Link> · {c.penalty.officerName} ({c.penalty.employeeId}) · {rupees(due)} outstanding</> : <>Receipt {c.grn}</>}</span>
                    <span className="text-xs text-slate-500">since {formatDate(c.openedOn)}</span>
                  </div>
                  {c.kind === "SUSPENDED" ? <p className="mt-1 text-amber-800">Open point: whether to recover from the subsistence allowance has not been decided. Resume only on a recorded decision.</p> : null}
                  {c.kind === "UNMATCHED_PAYMENT" ? (
                    <form action={closeUnmatched} className="mt-2 flex flex-wrap gap-2">
                      <HiddenBack value={back} /><input type="hidden" name="exceptionId" value={c.id} />
                      <input name="note" className="input max-w-md" placeholder="What was done (refunded to payer, or matched by hand with reason)" aria-label="Resolution" required />
                      <button className="btn-secondary btn-sm">Resolve</button>
                    </form>
                  ) : null}
                  {c.penalty ? (
                    <div className="mt-2 grid gap-3 lg:grid-cols-2">
                      <details>
                        <summary className="cursor-pointer font-medium text-brand-700">Record recovery through the paying authority</summary>
                        <form action={manual} className="mt-2 grid gap-2 sm:grid-cols-2">
                          <HiddenBack value={back} /><input type="hidden" name="exceptionId" value={c.id} />
                          <div><label className="label" htmlFor={`lr-${c.id}`}>Our letter: reference</label><input id={`lr-${c.id}`} name="letterRef" className="input" required /></div>
                          <div><label className="label" htmlFor={`ld-${c.id}`}>Date</label><input id={`ld-${c.id}`} name="letterOn" type="date" className="input" /></div>
                          <div><label className="label" htmlFor={`rr-${c.id}`}>Their reply: reference</label><input id={`rr-${c.id}`} name="replyRef" className="input" required /></div>
                          <div><label className="label" htmlFor={`rd-${c.id}`}>Date</label><input id={`rd-${c.id}`} name="replyOn" type="date" className="input" /></div>
                          <div><label className="label" htmlFor={`vn-${c.id}`}>Treasury voucher</label><input id={`vn-${c.id}`} name="voucherNo" className="input" required /></div>
                          <div><label className="label" htmlFor={`am-${c.id}`}>Amount recovered (Rs.)</label><input id={`am-${c.id}`} name="amount" type="number" defaultValue={due} className="input" required /></div>
                          <div className="sm:col-span-2"><label className="label" htmlFor={`pf-${c.id}`}>Proof</label><input id={`pf-${c.id}`} name="proof" type="file" className="text-sm" required /></div>
                          <div><button className="btn-primary btn-sm" data-testid="manual-recovery">Record recovery</button></div>
                        </form>
                      </details>
                      <div className="space-y-2">
                        {canResume ? (
                          <form action={resume} className="space-y-1">
                            <HiddenBack value={back} /><input type="hidden" name="exceptionId" value={c.id} />
                            {c.kind === "STAFF_RECORD_MISMATCH" ? <input name="employeeId" className="input" placeholder={`Correct employee ID (now ${c.penalty.employeeId})`} aria-label="Correct employee ID" /> : null}
                            <input name="note" className="input" placeholder={c.kind === "SUSPENDED" ? "Decision reference for recovering from subsistence allowance" : "What was corrected"} aria-label="Note" required />
                            <button className="btn-secondary btn-sm">{c.kind === "SUSPENDED" ? "Resume recovery" : "Corrected: send to Finance"}</button>
                          </form>
                        ) : null}
                        <Link className="text-brand-700 underline" href={`/penalties/${c.penalty.id}`}>Request a write-off on the penalty page</Link>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            }))}
          </ul>
        )}
      </Card>
      {resolved.length ? (
        <Card title="Recently resolved">
          <ul className="space-y-1 text-sm">{resolved.map((c) => <li key={c.id}>{formatDate(c.resolvedOn)} · {c.penalty?.ref ?? c.grn} · {EXCEPTION_LABELS[c.kind as ExceptionKind]} · {c.resolution}</li>)}</ul>
        </Card>
      ) : null}
    </div>
  );
}

async function RefundsTab() {
  const refunds = await prisma.refund.findMany({ include: { penalty: true }, orderBy: { createdOn: "desc" } });
  return (
    <Card title="Refunds">
      {refunds.length === 0 ? <Empty>No refunds.</Empty> : (
        <ul className="space-y-1 text-sm">
          {refunds.map((r) => (
            <li key={r.id}><Badge tone={r.status === "DUE" ? "amber" : "green"}>{r.status === "DUE" ? "Due" : `Refunded ${formatDate(r.refundedOn)} (${r.reference})`}</Badge> <Link className="text-brand-700 hover:underline" href={`/penalties/${r.penaltyId}`}>{r.penalty.ref}</Link> · {r.penalty.officerName} · {rupees(r.amount)} · {r.reason === "DOUBLE_RECOVERY" ? "paid and also deducted" : r.reason === "EXCESS_PAYMENT" ? "paid more than due" : r.reason === "SET_ASIDE" ? "penalty set aside" : "penalty reduced"}</li>
          ))}
        </ul>
      )}
      <p className="muted mt-2">The Finance nodal officer makes each refund and records its reference.</p>
    </Card>
  );
}

async function CreditTab({ back }: { back: string }) {
  const [missing, awaited] = await Promise.all([
    prisma.deduction.findMany({ where: { credit: { in: ["MISSING", "ESCALATED"] } }, include: { penalty: true }, orderBy: { recordedOn: "asc" } }),
    prisma.creditFeedEntry.findMany({ where: { arrivedOn: null }, orderBy: { expectedOn: "asc" } }),
  ]);
  return (
    <div className="space-y-4">
      <Card title="Deducted but not credited to the head of account">
        <p className="muted mb-2">After the credit window, the Finance nodal officer gets a follow-up task; if the credit is still not seen after the escalation period, it goes to the Finance senior officer and the Commission.</p>
        {missing.length === 0 ? <Empty>No missing credits.</Empty> : (
          <ul className="space-y-1 text-sm">
            {missing.map((d) => (
              <li key={d.id}>
                <Badge tone="red">{d.credit === "ESCALATED" ? `Escalated ${formatDate(d.escalatedOn)}` : `Missing since ${formatDate(d.creditMissingOn)}`}</Badge>{" "}
                <Link className="text-brand-700 hover:underline" href={`/penalties/${d.penaltyId}`}>{d.penalty.ref}</Link> · {d.penalty.officerName} · voucher {d.voucherNo} · {rupees(d.amount)} · deducted {formatDate(d.recordedOn)}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Demo control: treasury credits on their way">
        {awaited.length === 0 ? <Empty>No credits pending in the treasury feed.</Empty> : (
          <ul className="space-y-2 text-sm">
            {awaited.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>Voucher {c.voucherNo} · {rupees(c.amount)} · expected {formatDate(c.expectedOn)}{c.dropped ? " · will not arrive (dropped)" : ""}</span>
                {!c.dropped ? (
                  <form action={drop}>
                    <HiddenBack value={back} />
                    <input type="hidden" name="entryId" value={c.id} />
                    <button className="btn-danger btn-sm" data-testid="drop-credit">Drop this credit</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
