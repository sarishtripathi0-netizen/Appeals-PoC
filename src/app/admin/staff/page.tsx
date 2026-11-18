import { staffSave, unmatchedDemo } from "@/app/actions/exceptions";
import { PAYROLL_LABELS } from "@/adapters/staff-records";
import { Card, FeatureRef, Flash, HiddenBack, PageHeader, type SP } from "@/components/ui";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { currentUrl } from "@/lib/url";

const STATUSES = ["ACTIVE", "SUSPENDED", "RETIRED", "RESIGNED", "DISMISSED", "DECEASED"];

/** Mock staff records (an external system in real life) and other demo controls for the penalty module. */
export default async function StaffRecordsAdmin({ searchParams }: { searchParams: SP }) {
  await requireUser(["ADMIN"]);
  const back = await currentUrl();
  const records = await prisma.staffRecord.findMany({ orderBy: { employeeId: "asc" } });
  return (
    <div className="space-y-4">
      <FeatureRef ids={["COM-14", "E7", "E8", "E9", "E10", "E11", "E16"]} note="mock of the State staff records system" />
      <PageHeader title="Staff records (demo)" subtitle="Change an officer's posting (transfer), payroll type, status or retirement date to show how recovery responds. Recovery follows the employee ID, never the post." />
      <Flash searchParams={searchParams} />
      <Card title="Demo control: eGRAS payment with an unknown reference">
        <form action={unmatchedDemo} className="flex flex-wrap items-end gap-2">
          <HiddenBack value={back} />
          <div><label className="label" htmlFor="reference">Reference quoted</label><input id="reference" name="reference" defaultValue="PEN-2026-999999" className="input" /></div>
          <div><label className="label" htmlFor="amount">Amount (Rs.)</label><input id="amount" name="amount" type="number" defaultValue={1000} className="input max-w-[8rem]" /></div>
          <button className="btn-secondary">Pay challan</button>
        </form>
      </Card>
      <Card title={`Officers (${records.length})`}>
        <div className="space-y-3">
          {records.map((r) => (
            <form key={r.employeeId} action={staffSave} className="grid gap-2 rounded-md border border-slate-200 p-2 text-sm sm:grid-cols-4">
              <HiddenBack value={back} /><input type="hidden" name="employeeId" value={r.employeeId} />
              <div className="sm:col-span-4 font-medium">{r.employeeId}</div>
              <input name="name" defaultValue={r.name} className="input" aria-label="Name" />
              <input name="designation" defaultValue={r.designation} className="input sm:col-span-2" aria-label="Designation" />
              <input name="office" defaultValue={r.office} className="input" aria-label="Office" />
              <input name="monthlyPay" type="number" defaultValue={r.monthlyPay} className="input" aria-label="Monthly pay" />
              <select name="payrollType" defaultValue={r.payrollType} className="input" aria-label="Payroll type">{Object.entries(PAYROLL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <select name="status" defaultValue={r.status} className="input" aria-label="Status">{STATUSES.map((x) => <option key={x} value={x}>{x.charAt(0) + x.slice(1).toLowerCase()}</option>)}</select>
              <div className="flex gap-2"><input name="retirementOn" type="date" defaultValue={r.retirementOn ?? ""} className="input" aria-label="Retirement date" /><button className="btn-secondary btn-sm">Save</button></div>
            </form>
          ))}
        </div>
      </Card>
    </div>
  );
}
