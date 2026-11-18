// MDM layer: keeps the AMS copy of MDM masters fresh (version check → changes → snapshot fallback), answers MDM's
// usage check, and compares AMS master data with MDM (gap report). See docs/mdm-integration.md.

import { COPIED_TYPES, MDM_CONSUMER, mdmHttp, SnapshotRequired, type MdmClient, type MdmPayload } from "@/adapters/mdm";
import { DEPARTMENT_LINKS, DESIGNATION_LINKS, DISTRICT_LINKS, gapReport, OFFICE_LINKS, SERVICE_LINKS, type MdmIndex } from "@/domain/mdm-crosswalk";
import { audit, type Actor } from "@/lib/audit";
import { getToday } from "@/lib/context";
import { prisma, type Db } from "@/lib/db";
import { DomainError } from "./errors";

const now = () => new Date().toISOString();

function row(type: string, p: MdmPayload, syncedAt: string) {
  return { id: p.id, entityType: type, code: p.code, name: (p.name as string | null) ?? null, isActive: !!p.isActive, mdmVersion: Number(p.mdmVersion), payload: JSON.stringify(p), syncedAt };
}

/** Upsert one changed record by its MDM id, only when the change is newer than the copy. */
async function applyChange(db: Db, type: string, p: MdmPayload, syncedAt: string): Promise<boolean> {
  const cur = await db.mdmRecord.findUnique({ where: { id: p.id }, select: { mdmVersion: true } });
  if (cur && cur.mdmVersion >= Number(p.mdmVersion)) return false;
  const data = row(type, p, syncedAt);
  await db.mdmRecord.upsert({ where: { id: p.id }, create: data, update: data });
  return true;
}

async function loadSnapshots(db: Db, client: MdmClient, types: readonly string[], syncedAt: string) {
  let applied = 0;
  let asOf = 0;
  for (const t of types) {
    const s = await client.snapshot(t);
    await db.mdmRecord.deleteMany({ where: { entityType: t } });
    if (s.records.length) await db.mdmRecord.createMany({ data: s.records.map((p) => row(t, p, syncedAt)) });
    await db.mdmSyncState.upsert({ where: { entityType: t }, create: { entityType: t, appliedVersion: s.asOfVersion, lastSyncAt: syncedAt }, update: { appliedVersion: s.asOfVersion, lastSyncAt: syncedAt, lastError: null } });
    applied += s.records.length;
    asOf = Math.max(asOf, s.asOfVersion);
  }
  return { applied, asOf };
}

export type SyncResult = { mode: "UP_TO_DATE" | "CHANGES" | "SNAPSHOT"; fromVersion: number; toVersion: number; applied: number };

/**
 * Brings the local copy up to MDM's current version. First run (or a pruned change log) loads snapshots;
 * after that only the changes since the applied version are fetched.
 */
export async function syncMdm(actor: Actor, client: MdmClient = mdmHttp, db = prisma): Promise<SyncResult> {
  const startedAt = now();
  const states = await db.mdmSyncState.findMany();
  const known = new Map(states.map((s) => [s.entityType, s.appliedVersion]));
  const fromVersion = COPIED_TYPES.every((t) => known.has(t)) ? Math.min(...COPIED_TYPES.map((t) => known.get(t)!)) : 0;
  const run = await db.mdmSyncRun.create({ data: { startedAt, mode: "FAILED", fromVersion, actorId: actor.id } });
  try {
    const remote = await client.version();
    let result: SyncResult;
    if (fromVersion === 0) {
      const s = await loadSnapshots(db, client, COPIED_TYPES, startedAt);
      result = { mode: "SNAPSHOT", fromVersion, toVersion: s.asOf, applied: s.applied };
    } else if (fromVersion >= remote.global) {
      result = { mode: "UP_TO_DATE", fromVersion, toVersion: fromVersion, applied: 0 };
    } else {
      try {
        let since = fromVersion;
        let applied = 0;
        let current = remote.global;
        for (;;) {
          const page = await client.changes(since, COPIED_TYPES);
          for (const c of page.changes) if (await applyChange(db, c.entityType, c.payload, startedAt)) applied++;
          current = page.currentVersion;
          since = page.nextSince;
          if (!page.hasMore) break;
        }
        await db.mdmSyncState.updateMany({ data: { appliedVersion: current, lastSyncAt: startedAt, lastError: null } });
        result = { mode: "CHANGES", fromVersion, toVersion: current, applied };
      } catch (e) {
        if (!(e instanceof SnapshotRequired)) throw e;
        const s = await loadSnapshots(db, client, COPIED_TYPES, startedAt);
        result = { mode: "SNAPSHOT", fromVersion, toVersion: s.asOf, applied: s.applied };
      }
    }
    await db.mdmSyncRun.update({ where: { id: run.id }, data: { finishedAt: now(), mode: result.mode, toVersion: result.toVersion, applied: result.applied } });
    await audit(db, await getToday(db), { actor, action: "mdm.sync", entityType: "mdm", entityId: run.id, details: result });
    return result;
  } catch (e) {
    const msg = (e as Error).message;
    await db.mdmSyncRun.update({ where: { id: run.id }, data: { finishedAt: now(), error: msg } });
    await db.mdmSyncState.updateMany({ data: { lastError: msg } });
    throw new DomainError(`MDM sync failed: ${msg}`);
  }
}

/** Freshness of the copy: applied version, last sync and last error (shown with anything that relied on the copy). */
export async function mdmFreshness(db: Db = prisma) {
  const states = await db.mdmSyncState.findMany();
  const lastRun = await db.mdmSyncRun.findFirst({ orderBy: { startedAt: "desc" } });
  return {
    appliedVersion: states.length ? Math.min(...states.map((s) => s.appliedVersion)) : 0,
    lastSyncAt: states.map((s) => s.lastSyncAt).filter(Boolean).sort().at(-1) ?? null,
    lastError: states.find((s) => s.lastError)?.lastError ?? null,
    lastRun,
    records: await db.mdmRecord.count(),
  };
}

export async function mdmIndex(db: Db = prisma): Promise<MdmIndex> {
  const idx: MdmIndex = new Map();
  for (const r of await db.mdmRecord.findMany()) {
    if (!idx.has(r.entityType)) idx.set(r.entityType, new Map());
    idx.get(r.entityType)!.set(r.code, JSON.parse(r.payload));
  }
  return idx;
}

/** One MDM record from the local copy. */
export async function mdmRecord(type: string, code: string, db: Db = prisma) {
  const r = await db.mdmRecord.findUnique({ where: { entityType_code: { entityType: type, code } } });
  return r ? (JSON.parse(r.payload) as MdmPayload) : null;
}

export async function amsMasters(db: Db = prisma) {
  const [departments, districts, offices, services, users, holidays] = await Promise.all([
    db.department.findMany({ orderBy: { code: "asc" } }),
    db.district.findMany({ orderBy: { code: "asc" } }),
    db.office.findMany({ orderBy: { id: "asc" } }),
    db.service.findMany({ orderBy: { code: "asc" } }),
    db.user.findMany({ where: { role: { not: "CITIZEN" } }, orderBy: { id: "asc" } }),
    db.holiday.findMany({ orderBy: { date: "asc" } }),
  ]);
  return { departments, districts, offices, services, officers: users, holidays };
}

export async function mdmGapReport(db: Db = prisma) {
  return gapReport(await amsMasters(db), await mdmIndex(db));
}

/** AMS keys that point at an MDM record (reverse of the crosswalk). */
function amsKeysFor(type: string, code: string): string[] {
  const from = (links: Record<string, { type: string | null; code?: string }>) => Object.entries(links).filter(([, l]) => l.type === type && l.code === code).map(([k]) => k);
  switch (type) {
    case "department": return from(DEPARTMENT_LINKS as never);
    case "district": case "sub-division": return from(DISTRICT_LINKS as never);
    case "office": return from(OFFICE_LINKS as never);
    case "service": return from(SERVICE_LINKS as never);
    case "designation": return Object.entries(DESIGNATION_LINKS).filter(([, v]) => v === code).map(([k]) => k);
    default: return [];
  }
}

const OPEN_APPLICATION = { not: "CLOSED" };

/**
 * Usage check MDM calls before deactivating a record (GET {usageUrl}/{entityType}/{code}).
 * In use when an AMS record still points at it: open applications, authority mappings, officers, live penalties.
 */
export async function mdmUsage(type: string, code: string, db: Db = prisma) {
  const keys = amsKeysFor(type, code);
  const details: Record<string, number> = {};
  if (type === "department" && keys.length) {
    details.services = await db.service.count({ where: { departmentCode: { in: keys } } });
    details.offices = await db.office.count({ where: { departmentCode: { in: keys } } });
  }
  if ((type === "district" || type === "sub-division") && keys.length) {
    details.offices = await db.office.count({ where: { districtCode: { in: keys } } });
    details.openApplications = await db.application.count({ where: { office: { districtCode: { in: keys } }, status: OPEN_APPLICATION } });
  }
  if (type === "office" && keys.length) {
    details.openApplications = await db.application.count({ where: { officeId: { in: keys }, status: OPEN_APPLICATION } });
    details.authorityMappings = await db.authorityMapping.count({ where: { officeId: { in: keys }, validTo: null } });
    details.officers = await db.user.count({ where: { officeId: { in: keys } } });
  }
  if (type === "service" && keys.length) {
    details.openApplications = await db.application.count({ where: { serviceCode: { in: keys }, status: OPEN_APPLICATION } });
    details.authorityMappings = await db.authorityMapping.count({ where: { serviceCode: { in: keys }, validTo: null } });
  }
  if (type === "designation" && keys.length) details.officers = keys.length;
  if (type === "employee") details.livePenalties = await db.penalty.count({ where: { employeeId: code, status: { notIn: ["CLOSED", "WRITTEN_OFF", "SET_ASIDE"] } } });
  const inUse = Object.values(details).some((n) => n > 0);
  return { inUse, details: { consumer: MDM_CONSUMER.code, amsKeys: keys, ...details } };
}

/** Adds AMS to MDM's consumer registry, so MDM asks AMS before deactivating a record AMS uses. */
export async function registerWithMdm(actor: Actor, usageUrl: string, client: MdmClient = mdmHttp) {
  if (actor.role !== "ADMIN") throw new DomainError("Only the administrator can register AMS with MDM.");
  if (!/^https?:\/\/[^/]+\/.+/.test(usageUrl) || /localhost|127\.0\.0\.1/.test(usageUrl)) {
    throw new DomainError("Give a usage address MDM can reach over the network (this computer's IP address, not localhost).");
  }
  const r = await client.registerConsumer(usageUrl);
  await audit(prisma, await getToday(), { actor, action: "mdm.registerConsumer", entityType: "mdm", entityId: MDM_CONSUMER.code, details: { usageUrl } });
  return r;
}
