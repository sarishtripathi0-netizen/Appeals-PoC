// Gap report as CSV: AMS master data against the MDM copy, for the MDM team.
import { ATTRIBUTE_GAPS } from "@/domain/mdm-crosswalk";
import { getSessionUser } from "@/lib/session";
import { mdmGapReport } from "@/services/mdm";

const cell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;

export async function GET() {
  const u = await getSessionUser();
  if (u?.role !== "ADMIN") return new Response("Not found.", { status: 404 });
  const rows = await mdmGapReport();
  const lines = [
    ["Area", "AMS key", "AMS name", "MDM type", "MDM code", "Status", "Differences", "Action", "Owner"].map(cell).join(","),
    ...rows.map((r) => [r.area, r.amsKey, r.amsName, r.mdmType, r.mdmCode, r.status, r.differences.join("; "), r.action, r.owner].map(cell).join(",")),
    "",
    ["Area", "Data", "Held in AMS", "Owner", "Proposal"].map(cell).join(","),
    ...ATTRIBUTE_GAPS.map((g) => [g.area, g.attribute, g.amsWhere, g.owner, g.action].map(cell).join(",")),
  ];
  return new Response(lines.join("\r\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="ams-mdm-gap-report.csv"' } });
}
