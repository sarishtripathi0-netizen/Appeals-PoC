// Client for the appeal-management read API that Sewa Setu service systems expose (`/ams/...`), first the Minority
// Community Certificate service. It returns an application as decided, with the officers the Rule Engine resolved
// (DPS, acting DPS / Link Officer, workflow officers, FAA / SAA / TAA) and the statutory and step SLAs.

export type ServiceSystem = { code: string; name: string; baseUrl: string };

/** Service systems AMS reads from. Each one exposes the same `/ams` contract under its base URL. */
export const SERVICE_SYSTEMS: ServiceSystem[] = [
  { code: "MCC", name: "Minority Community Certificate service", baseUrl: (process.env.MCC_URL ?? "http://172.16.5.151:4005/mcc").replace(/\/$/, "") },
];
const TIMEOUT_MS = Number(process.env.SERVICE_SYSTEM_TIMEOUT_MS ?? 15000);

export type Ref = { code: string; name: string };
export type Person = {
  roleCode: string; roleName: string; category: "AUTHORITY" | "WORKFLOW"; stage: number | null; slaDays: number | null; returnSlaDays: number | null;
  status: string; office: Ref | null; designation: Ref | null; post: string | null; employeeCode: string | null; employeeName: string | null;
  via: string | null; reason: string | null; resolutionId: string | null; actingAs?: string;
  candidates: { post: string; priority: number; office: Ref; designation: Ref; delegationCode: string; orderNo: string; person: { employeeCode: string; name: string; via: string } | null; status: string; reason: string | null }[] | null;
};
export type ListItem = {
  applicationNo: string; service: { code: string; name: string; department: string; timelineDays: number }; status: string;
  applicantName: string; mobile: string; district: Ref; circle: Ref | null; submittedOn: string; dueDate: string; decidedAt: string | null;
  appealEligible: boolean; appealGrounds: string[];
  dps: { employeeCode: string | null; employeeName: string | null; designation: string | null; office: string | null };
  faa: { employeeCode: string | null; employeeName: string | null; designation: string | null; office: string | null; slaDays: number | null } | null;
};
export type Snapshot = {
  application: {
    applicationNo: string; service: { code: string; name: string; department: string; timelineDays: number; locationLevel: string };
    status: string; channel: string; submittedOn: string; dueDate: string; rule: { code: string; name: string; version: number; resolutionId: string } | null;
    engineMessage: string | null; mdmVersion: number | null;
    decision: { status: string; at: string; on: string; reason: string | null; by: { employeeCode: string; name: string; roleCode: string; actingAs: string } | null } | null;
    sla: { timelineDays: number; submittedOn: string; dueDate: string; workingDaysUsed: number; workingDaysLeft: number | null; overdue: boolean; state: string };
  };
  applicant: { name: string; fatherName: string | null; gender: string | null; mobile: string; email: string | null; addressLine: string | null; locationCode: string; location: { district: Ref; circle: Ref | null; village: Ref | null; ward: Ref | null }; [k: string]: unknown };
  documents: { docType: string; docKind: string; fileName: string; uploadedAt: string }[];
  certificate: unknown;
  designatedPersons: { dps: Person | null; linkOfficer: Person | null; actingDps: Person | null; appellate: Person[]; workflow: Person[]; all: Person[] };
  timeline: {
    statutory: Snapshot["application"]["sla"];
    steps: { seq: number; kind: string; stage: number; roleCode: string; roleName: string; slaDays: number; status: string; action: string | null; remarks: string | null; assignee: { employeeCode: string; name: string; actingAs: string } | null; openedOn: string | null; dueDate: string | null; completedOn: string | null; overdue: boolean; onTime: boolean | null }[];
    appealLevels: { roleCode: string; roleName: string; slaDays: number | null }[];
  };
  appeal: { eligible: boolean; grounds: string[]; nextAuthority: Person | null; levels: Person[] };
};

export class ServiceSystemError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export interface ServiceSystemClient {
  list(q: { appealEligible?: boolean; status?: string; serviceCode?: string; districtCode?: string; q?: string; limit?: number }): Promise<ListItem[]>;
  snapshot(applicationNo: string): Promise<Snapshot>;
}

export function serviceSystemClient(sys: ServiceSystem): ServiceSystemClient {
  async function call<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${sys.baseUrl}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    } catch (e) {
      throw new ServiceSystemError(`The ${sys.name} at ${sys.baseUrl} could not be reached (${(e as Error).message}).`);
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new ServiceSystemError((body as { message?: string } | null)?.message ?? `${sys.name} answered ${res.status} for ${path}.`, res.status);
    return body as T;
  }
  return {
    list: (q) => {
      const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));
      return call(`/ams/applications?${p.toString()}`);
    },
    snapshot: (no) => call(`/ams/applications/${encodeURIComponent(no)}`),
  };
}

export function systemByCode(code: string) {
  const s = SERVICE_SYSTEMS.find((x) => x.code === code);
  if (!s) throw new ServiceSystemError(`Unknown service system ${code}.`);
  return s;
}

/** Rule Engine post "DC_KMM:ADC:2" → HR Utility chair "DC_KMM-ADC-02". */
export function hrChairOf(post: string | null): string | null {
  const m = post?.match(/^(.+):([A-Z0-9_]+):(\d+)$/);
  return m ? `${m[1]}-${m[2]}-${m[3].padStart(2, "0")}` : null;
}
