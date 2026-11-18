import { networkInterfaces } from "node:os";
import Link from "next/link";
import { mdmRegister, mdmSync } from "@/app/actions/mdm";
import { COPIED_TYPES, MDM_URL } from "@/adapters/mdm";
import { Badge, Card, Empty, FeatureRef, Flash, HiddenBack, PageHeader, type SP, type Tone } from "@/components/ui";
import { ATTRIBUTE_GAPS, type GapStatus, type Owner } from "@/domain/mdm-crosswalk";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { currentUrl } from "@/lib/url";
import { mdmFreshness, mdmGapReport } from "@/services/mdm";

const STATUS: Record<GapStatus, { label: string; tone: Tone }> = {
  MATCHED: { label: "In MDM", tone: "green" },
  DIFFERS: { label: "In MDM, differs", tone: "amber" },
  MISSING: { label: "Missing in MDM", tone: "red" },
  INACTIVE: { label: "Inactive in MDM", tone: "purple" },
  NOT_FOR_MDM: { label: "Not master data", tone: "grey" },
};
const OWNER: Record<Owner, string> = { MDM: "MDM", HR: "HR Utility", SERVICE_CONFIG: "Rule engine / service config", AMS: "AMS", IAM: "Identity (IAM)", FINANCE: "Finance" };
const AREAS = ["Department", "District", "Office", "Service", "Designation", "Employee", "Holiday"];

/** A LAN address MDM can call back on (MDM runs on another computer). */
function lanUsageUrl() {
  const ip = Object.values(networkInterfaces()).flat().find((n) => n && n.family === "IPv4" && !n.internal)?.address ?? "THIS-PC-IP";
  return `http://${ip}:3000/api/mdm/usage`;
}

export default async function MdmAdmin({ searchParams }: { searchParams: SP }) {
  await requireUser(["ADMIN"]);
  const sp = await searchParams;
  const area = typeof sp.area === "string" && AREAS.includes(sp.area) ? sp.area : null;
  const back = await currentUrl();
  const [fresh, counts, runs, rows] = await Promise.all([
    mdmFreshness(),
    prisma.mdmRecord.groupBy({ by: ["entityType"], _count: true }),
    prisma.mdmSyncRun.findMany({ orderBy: { startedAt: "desc" }, take: 8 }),
    mdmGapReport(),
  ]);
  const count = new Map(counts.map((c) => [c.entityType, c._count]));
  const shown = rows.filter((r) => !area || r.area === area);
  const tally = (status: GapStatus, a?: string) => rows.filter((r) => r.status === status && (!a || r.area === a)).length;

  return (
    <div className="space-y-4">
      <FeatureRef ids={["MDM"]} note="Master Data Management integration" />
      <PageHeader
        title="Master data (MDM)"
        subtitle={<>AMS keeps a local copy of the Sewa Setu master data from the MDM service at <code>{MDM_URL}</code>, refreshed by version. The gap report lists AMS master data that MDM does not have yet, to be moved into MDM.</>}
      />
      <Flash searchParams={searchParams} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Local copy">
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-slate-500">Applied MDM version</dt><dd className="font-medium">{fresh.appliedVersion || "not synchronised yet"}</dd>
            <dt className="text-slate-500">Last synchronised</dt><dd>{fresh.lastSyncAt ? new Date(fresh.lastSyncAt).toLocaleString("en-IN") : "never"}</dd>
            <dt className="text-slate-500">Records copied</dt><dd>{fresh.records.toLocaleString("en-IN")}</dd>
          </dl>
          {fresh.lastError ? <p className="mt-2 rounded-md bg-rose-50 p-2 text-sm text-rose-800">Last error: {fresh.lastError}</p> : null}
          <form action={mdmSync} className="mt-3">
            <HiddenBack value={back} />
            <button className="btn-primary" data-testid="mdm-sync">Synchronise now</button>
          </form>
          <p className="muted mt-2">Entity types copied (parent first): {COPIED_TYPES.map((t) => `${t} (${count.get(t) ?? 0})`).join(", ")}.</p>
        </Card>
        <Card title="Register AMS with MDM">
          <p className="muted mb-2">
            Adds AMS to MDM&rsquo;s consumer registry. Before deactivating a record, MDM then asks AMS whether it is still in use, at <code>{"{usage address}/{entityType}/{code}"}</code>.
            The address must be reachable from the MDM server.
          </p>
          <form action={mdmRegister} className="flex flex-wrap gap-2">
            <HiddenBack value={back} />
            <input name="usageUrl" defaultValue={lanUsageUrl()} className="input max-w-md" aria-label="Usage address" />
            <button className="btn-secondary">Register</button>
          </form>
          <p className="muted mt-2">Test it: <Link className="underline" href="/api/mdm/usage/office/CO_DISPUR">/api/mdm/usage/office/CO_DISPUR</Link></p>
        </Card>
      </div>

      <Card title="Synchronisation runs">
        {runs.length === 0 ? <Empty>No runs yet.</Empty> : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Started</th><th>Mode</th><th>Versions</th><th>Records</th><th>Error</th></tr></thead>
            <tbody>{runs.map((r) => (
              <tr key={r.id}><td>{new Date(r.startedAt).toLocaleString("en-IN")}</td><td>{r.mode}</td><td>{r.fromVersion} → {r.toVersion ?? "—"}</td><td>{r.applied}</td><td className="text-rose-700">{r.error}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>

      <Card title="Gap report: AMS master data against MDM" actions={<a className="btn-secondary btn-sm" href="/api/mdm/gaps">Download CSV</a>}>
        {fresh.records === 0 ? <p className="mb-3 rounded-md bg-amber-50 p-2 text-sm text-amber-900">Synchronise first: without a local copy every record shows as missing.</p> : null}
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          <Link href="/admin/mdm" className={`rounded-full border px-3 py-1 ${!area ? "border-brand-600 bg-brand-50" : "border-slate-200"}`}>All ({rows.length})</Link>
          {AREAS.map((a) => (
            <Link key={a} href={`/admin/mdm?area=${a}`} className={`rounded-full border px-3 py-1 ${area === a ? "border-brand-600 bg-brand-50" : "border-slate-200"}`}>
              {a} <span className="text-rose-700">{tally("MISSING", a) || ""}</span>{tally("DIFFERS", a) ? <span className="text-amber-700"> ·{tally("DIFFERS", a)}</span> : null}
            </Link>
          ))}
        </div>
        <p className="mb-3 flex flex-wrap gap-2 text-sm">
          {(Object.keys(STATUS) as GapStatus[]).map((s) => <Badge key={s} tone={STATUS[s].tone}>{STATUS[s].label}: {tally(s)}</Badge>)}
        </p>
        <div className="table-wrap"><table className="data">
          <thead><tr><th>Area</th><th>AMS</th><th>MDM</th><th>Status</th><th>What to do</th></tr></thead>
          <tbody>{shown.map((r) => (
            <tr key={`${r.area}-${r.amsKey}`}>
              <td>{r.area}</td>
              <td><div className="font-medium">{r.amsName}</div><div className="text-xs text-slate-500">{r.amsKey}</div></td>
              <td>{r.mdmCode ? <code>{r.mdmType}:{r.mdmCode}</code> : <span className="text-slate-400">—</span>}</td>
              <td><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></td>
              <td>
                {r.differences.map((d, i) => <div key={i} className="text-amber-800">{d}</div>)}
                <div>{r.action}</div>
                <div className="text-xs text-slate-500">Owner: {OWNER[r.owner]}</div>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      </Card>

      <Card title="AMS data with no place in MDM yet">
        <p className="muted mb-2">Attributes and lists AMS holds that MDM has no entity or field for, with where each should live.</p>
        <div className="table-wrap"><table className="data">
          <thead><tr><th>Area</th><th>Data</th><th>Held in AMS</th><th>Should live in</th><th>Proposal</th></tr></thead>
          <tbody>{ATTRIBUTE_GAPS.map((g) => (
            <tr key={g.attribute}><td>{g.area}</td><td className="font-medium">{g.attribute}</td><td><code className="text-xs">{g.amsWhere}</code></td><td>{OWNER[g.owner]}</td><td>{g.action}</td></tr>
          ))}</tbody>
        </table></div>
      </Card>
    </div>
  );
}
