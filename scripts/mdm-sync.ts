// Synchronise the AMS copy of MDM masters and print the gap summary: `npm run mdm:sync`.
import { SYSTEM_ACTOR } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { mdmGapReport, syncMdm } from "@/services/mdm";

async function main() {
  const r = await syncMdm(SYSTEM_ACTOR);
  console.log(`MDM sync: ${r.mode}, version ${r.fromVersion} → ${r.toVersion}, ${r.applied} record(s).`);
  const rows = await mdmGapReport();
  const tally = new Map<string, number>();
  for (const x of rows) tally.set(`${x.area} ${x.status}`, (tally.get(`${x.area} ${x.status}`) ?? 0) + 1);
  for (const [k, v] of [...tally].sort()) console.log(`  ${k}: ${v}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
