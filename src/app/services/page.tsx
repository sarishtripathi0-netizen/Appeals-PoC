import Link from "next/link";
import { Card, Empty, PageHeader, type SP } from "@/components/ui";
import { totalFee } from "@/domain/service-config";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { rupees } from "@/lib/view";
import { configOf } from "@/services/applications";

/** Public list of notified services, searched from the front page. Applying needs a citizen sign-in. */
export default async function PublicServices({ searchParams }: { searchParams: SP }) {
  const raw = (await searchParams).q;
  const q = (typeof raw === "string" ? raw : "").trim();
  const u = await getSessionUser();
  const all = await prisma.service.findMany({ include: { department: true }, orderBy: { name: "asc" } });
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const services = all.filter((s) => words.every((w) => `${s.name} ${s.purpose} ${s.department.name}`.toLowerCase().includes(w)));
  const applyHref = (code: string) => (u?.role === "CITIZEN" ? `/citizen/apply/${code}` : "/login");

  return (
    <div className="space-y-4">
      <PageHeader title="Services" subtitle="Services notified under the Assam Right to Public Services (ARTPS) Act, with their time limits." />
      <form action="/services" role="search" className="flex max-w-2xl gap-2">
        <label htmlFor="q" className="sr-only">Search services</label>
        <input id="q" name="q" defaultValue={q} placeholder="Looking for a particular service? Search here..." className="input" />
        <button className="cursor-pointer rounded-md bg-accent-500 px-4 text-sm font-semibold text-white hover:bg-accent-600">Search</button>
      </form>
      {q ? <p className="muted">{services.length} of {all.length} services match &ldquo;{q}&rdquo;. <Link href="/services" className="text-brand-700 underline">Show all</Link></p> : null}
      {services.length === 0 ? <Empty>No service matches your search.</Empty> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {services.map((s) => {
            const fee = totalFee(configOf(s).fees);
            return (
              <Card key={s.code} title={s.name}>
                <p className="text-sm text-slate-700">{s.purpose}</p>
                <p className="mt-2 text-sm"><strong>Time limit:</strong> {s.timeLimitWorkingDays} working days{fee ? <> · <strong>Fee:</strong> {rupees(fee)}</> : null}</p>
                <p className="text-xs text-slate-500">{s.department.name}</p>
                <Link href={applyHref(s.code)} className="btn-primary mt-3">{u?.role === "CITIZEN" ? "Apply" : "Sign in to apply"}</Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
