import Link from "next/link";
import { writeOffDecide } from "@/app/actions/exceptions";
import { sign } from "@/app/actions/recovery";
import { Card, Empty, FeatureRef, Flash, HiddenBack, PageHeader, type SP } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { currentUrl } from "@/lib/url";
import { rupees } from "@/lib/view";

export default async function ForSignature({ searchParams }: { searchParams: SP }) {
  const u = await requireUser(["COMPETENT_AUTHORITY"]);
  const back = await currentUrl();
  const directions = await prisma.recoveryDirection.findMany({ where: { status: "AWAITING_SIGNATURE", competentAuthorityId: u.id }, include: { penalty: true }, orderBy: { sentOn: "asc" } });
  const writeOffs = await prisma.writeOff.findMany({ where: { status: "REQUESTED", penalty: { competentAuthorityId: u.id } }, include: { penalty: true }, orderBy: { requestedOn: "asc" } });
  const copies = await prisma.penalty.findMany({ where: { competentAuthorityId: u.id }, orderBy: { orderDate: "desc" }, take: 10 });

  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-91", "AMS-98"]} />
      <PageHeader title="For signature" subtitle={`${u.designation}. You are the appointing or disciplinary authority of the officers below.`} />
      <Flash searchParams={searchParams} />
      <Card title="Recovery Directions to sign">
        <p className="muted mb-2">Used when the Recovery Direction is issued case by case. Recovery from salary cannot start until you sign.</p>
        {directions.length === 0 ? <Empty>Nothing waiting for your signature.</Empty> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {directions.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  Recover {rupees(d.penalty.amount)} from the salary of <strong>{d.penalty.officerName}</strong>, {d.penalty.designation} (employee ID {d.penalty.employeeId}),
                  penalty <Link className="text-brand-700 underline" href={`/penalties/${d.penaltyId}`}>{d.penalty.ref}</Link>, UIN {d.penalty.uin}. Sent {formatDate(d.sentOn)}.
                </span>
                <form action={sign}>
                  <HiddenBack value={back} />
                  <input type="hidden" name="directionId" value={d.id} />
                  <button className="btn-primary btn-sm" data-testid="sign-direction">Sign with e-Sign (demo)</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Write-offs to approve">
        <p className="muted mb-2">A penalty that cannot be recovered is written off only with your approval and a reason. Every write-off appears in the monthly statement and the Commission's ledger.</p>
        {writeOffs.length === 0 ? <Empty>No write-off requests.</Empty> : (
          <ul className="space-y-3 text-sm">
            {writeOffs.map((w) => (
              <li key={w.id} className="rounded-md border border-slate-200 p-2">
                <div>Write off {rupees(w.amount)} on penalty <Link className="text-brand-700 underline" href={`/penalties/${w.penaltyId}`}>{w.penalty.ref}</Link> ({w.penalty.officerName}, employee ID {w.penalty.employeeId}). Requested {formatDate(w.requestedOn)} by the Sewa Setu DDO: <em>{w.reason}</em></div>
                <form action={writeOffDecide} className="mt-2 flex flex-wrap gap-2">
                  <HiddenBack value={back} /><input type="hidden" name="writeOffId" value={w.id} />
                  <input name="note" className="input max-w-sm" placeholder="Note (required if not approving)" aria-label="Note" />
                  <button name="decision" value="approve" className="btn-primary btn-sm" data-testid="approve-write-off">Approve with e-Sign (demo)</button>
                  <button name="decision" value="reject" className="btn-secondary btn-sm">Do not approve</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Penalties on officers under you (copies received)">
        {copies.length === 0 ? <Empty>None.</Empty> : (
          <ul className="space-y-1 text-sm">{copies.map((p) => <li key={p.id}><Link className="text-brand-700 hover:underline" href={`/penalties/${p.id}`}>{p.ref}</Link> · {p.officerName} · {rupees(p.amount)} · order of {formatDate(p.orderDate)}</li>)}</ul>
        )}
      </Card>
    </div>
  );
}
