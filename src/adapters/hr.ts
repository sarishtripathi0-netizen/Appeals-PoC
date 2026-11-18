// Client for the Sewa Setu HR Utility (postings, function allotments, leave, Link Officer), per its integration
// guide. AMS only reads from it. Base URL from HR_URL. Every answer carries the MDM version it reflects.

export const HR_URL = (process.env.HR_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.HR_TIMEOUT_MS ?? 15000);

export type SeatStatus = "RESOLVED" | "NO_LINK_OFFICER" | "NOT_APPLICABLE" | "NO_HOLDER";
export type Holder = {
  sanctioned_post_id: string; employee_id: string; name: string; cadre: string | null; year_of_joining: number | null;
  charge_type: "SUBSTANTIVE" | "ADDITIONAL"; available: boolean; unavailable_reason: string | null; is_demo: boolean;
};
export type LinkOfficer = { employee_id: string; name: string; sanctioned_post_id: string; rule_step: string; deemed_dps_under_rule_3_3: boolean | null; is_demo: boolean };
export type SeatHolders = {
  office_id: string; post_code: string; function_code: string; at: string;
  holders: Holder[]; link_officer: LinkOfficer | null; status: SeatStatus; reason: string | null; roster_mode: boolean;
};
export type ChairHistory = {
  sanctioned_post_id: string; office_id: string; post_code: string; from: string; to: string;
  holders: { employee_id: string; name: string; charge_type: string; intervals: { from: string; to: string | null }[]; working_days: number; is_demo: boolean }[];
  unheld_intervals: { from: string; to: string }[]; working_days_in_interval: number; holidays_in_interval: string[];
};
export type EmployeePosts = {
  employee_id: string; name: string; cadre: string | null; is_demo: boolean; available: boolean; unavailable_reason: string | null;
  posts: { sanctioned_post_id: string; office_id: string; post_code: string; charge_type: string; since: string; until: string | null; rule_step: string | null; covering_for: string | null }[];
};
export type HrEventRow = { id: number; ts: string; type: string; effective_at: string; payload: Record<string, unknown> & { employee_id?: string; office_id?: string; post_code?: string; is_demo?: boolean } };
export type HrMdmStatus = { mode: string; base_url: string; applied_version: number; last_checked_at: string | null; last_error: string | null; last_check: { status: string; version: number } | null; consumer_code: string };

/** An answer plus the MDM freshness headers that came with it. */
export type WithMdm<T> = { body: T; mdmVersion: number | null; mdmStale: boolean };

export class HrError extends Error {
  constructor(message: string, readonly status?: number, readonly rule?: string | null) {
    super(message);
  }
}

export interface HrClient {
  mdmStatus(): Promise<WithMdm<HrMdmStatus>>;
  seatHolders(q: { officeCode: string; postCode: string; functionCode: string; at: string }): Promise<WithMdm<SeatHolders>>;
  chairHistory(chairId: string, from: string, to: string): Promise<WithMdm<ChairHistory>>;
  chairHolder?(chairId: string, at: string): Promise<WithMdm<{ sanctioned_post_id: string; status: string; holders: { employee_id: string; name: string; charge_type: string; is_demo: boolean }[] }>>;
  employeePosts(employeeId: string, at: string): Promise<WithMdm<EmployeePosts>>;
  roster(officeCode: string, at: string): Promise<WithMdm<{ office_id: string; name: string; chairs: unknown[] }>>;
  events(after: number, limit?: number): Promise<WithMdm<{ events: HrEventRow[] }>>;
}

async function call<T>(path: string): Promise<WithMdm<T>> {
  let res: Response;
  try {
    res = await fetch(`${HR_URL}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (e) {
    throw new HrError(`The HR Utility at ${HR_URL} could not be reached (${(e as Error).message}).`);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as { error?: { rule: string | null; message: string } } | null)?.error;
    throw new HrError(err?.message ?? `HR Utility answered ${res.status} for ${path}.`, res.status, err?.rule ?? null);
  }
  const v = res.headers.get("x-mdm-version");
  return { body: body as T, mdmVersion: v ? Number(v) : null, mdmStale: res.headers.get("x-mdm-stale") === "true" };
}

const qs = (o: Record<string, string | number>) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();
const enc = encodeURIComponent;

export const hrHttp: HrClient = {
  mdmStatus: () => call("/v1/mdm/status"),
  seatHolders: (q) => call(`/v1/seat-holders?${qs({ office_id: q.officeCode, post_code: q.postCode, function_code: q.functionCode, at: q.at })}`),
  chairHistory: (chair, from, to) => call(`/v1/posts/${enc(chair)}/history?${qs({ from, to })}`),
  chairHolder: (chair, at) => call(`/v1/posts/${enc(chair)}/holder?${qs({ at })}`),
  employeePosts: (id, at) => call(`/v1/employees/${enc(id)}/posts?${qs({ at })}`),
  roster: (office, at) => call(`/v1/offices/${enc(office)}/roster?${qs({ at })}`),
  events: (after, limit = 500) => call(`/v1/events?${qs({ after, limit })}`),
};

/** 10:00 IST on a date: the time AMS asks about for a simulated-clock day. */
export const officeHoursOn = (date: string) => `${date}T10:00:00+05:30`;
