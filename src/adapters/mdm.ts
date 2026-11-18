// Client for the Sewa Setu Master Data Management (MDM) service, per its integration contract
// (versioned local copies + live lookups). Base URL from MDM_URL; AMS only reads from MDM, except consumer registration.

export const MDM_URL = (process.env.MDM_URL ?? "http://172.16.5.151:4001").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.MDM_TIMEOUT_MS ?? 15000);
/** Name AMS uses in MDM's consumer registry and in the X-User header. */
export const MDM_CONSUMER = { code: "ams-service", name: "Appeal Management System (Sewa Setu)" };

/** Entity types AMS copies, parent first (department before office; district before sub-division before circle). */
export const COPIED_TYPES = [
  "state", "district", "sub-division", "circle", "department", "office-type", "designation", "office",
  "office-jurisdiction", "cadre", "service-role-type", "service", "holiday", "employee", "sanctioned-post", "link-officer-rule",
] as const;
export type CopiedType = (typeof COPIED_TYPES)[number];

export type MdmPayload = { id: string; code: string; name?: string | null; isActive: boolean; mdmVersion: number | string; [k: string]: unknown };
export type MdmVersion = { global: number; prunedUpTo: number; updatedAt: string; entities: Record<string, number> };
export type MdmChange = { version: number; entityType: string; entityId: string; entityCode: string; op: "CREATE" | "UPDATE" | "DEACTIVATE" | "REACTIVATE"; payload: MdmPayload };
export type MdmChanges = { since: number; currentVersion: number; nextSince: number; hasMore: boolean; changes: MdmChange[] };
export type MdmSnapshot = { entityType: string; asOfVersion: number; count: number; records: MdmPayload[] };
export type ValidateResult = { valid: boolean; asOn: string; mdmVersion: number; results: Record<string, Record<string, "OK" | "NOT_FOUND" | "INACTIVE" | "NOT_EFFECTIVE">> };

export class MdmError extends Error {
  constructor(message: string, readonly status?: number, readonly body?: unknown) {
    super(message);
  }
}
/** GET /mdm/changes said the change log was pruned past our version: reload snapshots. */
export class SnapshotRequired extends MdmError {}

export interface MdmClient {
  version(): Promise<MdmVersion>;
  changes(since: number, entities: readonly string[], limit?: number): Promise<MdmChanges>;
  snapshot(type: string): Promise<MdmSnapshot>;
  validate(refs: Record<string, string[]>, asOn?: string): Promise<ValidateResult>;
  geoContext(locationCode: string, asOn?: string): Promise<unknown>;
  officesByJurisdiction(q: { officeType: string; locationCode: string; department?: string; asOn?: string }): Promise<unknown>;
  registerConsumer(usageUrl: string): Promise<unknown>;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${MDM_URL}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (e) {
    throw new MdmError(`The MDM service at ${MDM_URL} could not be reached (${(e as Error).message}).`);
  }
  const body = await res.json().catch(() => null);
  if (res.status === 410) throw new SnapshotRequired("MDM has pruned its change log; a snapshot is needed.", 410, body);
  if (!res.ok) throw new MdmError(`MDM answered ${res.status} for ${path}.`, res.status, body);
  return body as T;
}

const qs = (o: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString();

export const mdmHttp: MdmClient = {
  version: () => call("/mdm/version"),
  changes: (since, entities, limit = 1000) => call(`/mdm/changes?${qs({ since, entities: entities.join(","), limit })}`),
  snapshot: (type) => call(`/mdm/snapshot/${encodeURIComponent(type)}`),
  validate: (refs, asOn) => call("/mdm/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ asOn, refs }) }),
  geoContext: (code, asOn) => call(`/mdm/geo/${encodeURIComponent(code)}/context${asOn ? `?${qs({ asOn })}` : ""}`),
  officesByJurisdiction: (q) => call(`/mdm/offices/by-jurisdiction?${qs(q)}`),
  registerConsumer: (usageUrl) =>
    call("/mdm/consumers", {
      method: "POST",
      headers: { "content-type": "application/json", "x-user": MDM_CONSUMER.code },
      body: JSON.stringify({ ...MDM_CONSUMER, usageUrl }),
    }),
};
