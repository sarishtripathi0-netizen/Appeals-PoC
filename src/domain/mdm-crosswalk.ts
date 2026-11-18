// Crosswalk from AMS master data to MDM codes, and the gap check: which AMS masters MDM already holds, which differ,
// and which are missing (to be moved into MDM later). Pure: the caller passes the AMS masters and the local MDM copy.

export type GapStatus = "MATCHED" | "DIFFERS" | "MISSING" | "INACTIVE" | "NOT_FOR_MDM";
/** Where the data should live once the gap is closed. */
export type Owner = "MDM" | "HR" | "SERVICE_CONFIG" | "AMS" | "IAM" | "FINANCE";

export type GapRow = {
  area: string;
  amsKey: string;
  amsName: string;
  mdmType: string | null;
  mdmCode: string | null;
  status: GapStatus;
  differences: string[];
  action: string;
  owner: Owner;
};

type Link = { type: string; code: string; note?: string } | { type: null; reason: string; owner?: Owner };

export const DEPARTMENT_LINKS: Record<string, Link> = {
  REV: { type: "department", code: "RDM" },
  SJE: { type: "department", code: "SJE" },
  ARP: { type: "department", code: "ARTPPG" },
  HUA: { type: null, reason: "Housing and Urban Affairs Department is not in MDM (the Sewa Setu service list codes it HUA)." },
  FIN: { type: null, reason: "Finance Department is not in MDM (the Sewa Setu service list codes it FIN)." },
};

export const DISTRICT_LINKS: Record<string, Link> = {
  KMM: { type: "district", code: "KMM" },
  JRT: { type: "district", code: "D-290" },
  SNP: { type: "sub-division", code: "KMM-SNP", note: "AMS lists the Sonapur co-district as a district; in MDM it is a sub-division of Kamrup Metropolitan. AMS should hold it as a sub-division." },
};

export const OFFICE_LINKS: Record<string, Link> = {
  "OFF-KMM-DPR": { type: "office", code: "CO_DISPUR" },
  "OFF-JRT-WRC": { type: "office", code: "AS-CR-290-01", note: "Jorhat West = Jorhat Pachim circle." },
  "OFF-KMM-DCO": { type: "office", code: "DC_KMM" },
  "OFF-SNP-CDO": { type: "office", code: "SDO_KMM-SNP" },
  "OFF-SEC": { type: "office", code: "SEC_RDM", note: "AMS has one Assam Secretariat office; MDM has one office per department (SEC_RDM, SEC_SJE, …). AMS should post each Secretary to their department's office." },
  "OFF-COMM": { type: "office", code: "ASCRTPS" },
  "OFF-KMM-MUN": { type: null, reason: "No urban local body office (Guwahati Municipal Corporation zone) and no office type for it in MDM." },
  "OFF-AITEC": { type: null, reason: "AITEC & CSD Society (Sewa Setu DDO for central penalty recovery) is not in MDM." },
  "OFF-FIN": { type: null, reason: "No Finance Department secretariat office in MDM (no SEC_FIN)." },
};

export const SERVICE_LINKS: Record<string, Link> = {
  INC: { type: "service", code: "100009" },
  SCC: { type: "service", code: "13960389" },
  NCL: { type: "service", code: "1492" },
  PRC: { type: "service", code: "100030", note: "MDM's nearest entry is the Permanent Residence Certificate for Higher Education (Home & Political, district level)." },
  CCJ: { type: null, reason: "Certified Copy of Jamabandi is in the Sewa Setu service list (service ID 4124, legacy 1054) but not in MDM." },
  TRL: { type: null, reason: "New trade licence (Guwahati Municipal Corporation) is in the Sewa Setu service list (2712, legacy 1601) but not in MDM." },
};

/** Designation of each AMS officer as an MDM designation code (AMS stores designations as free text). */
export const DESIGNATION_LINKS: Record<string, string | { missing: string } | { iam: true }> = {
  "u-dps-kmm": "CIRCLE_OFFICER", "u-dps-jrt": "CIRCLE_OFFICER", "u-link-jrt": "CIRCLE_OFFICER", "u-dps-dep": "CIRCLE_OFFICER", "u-dps-sus": "CIRCLE_OFFICER", "u-dps-two": "CIRCLE_OFFICER",
  "u-link-kmm": { missing: "Assistant Settlement Officer" }, "u-dps-ret": { missing: "Assistant Settlement Officer" },
  "u-faa-kmm": "ADC", "u-hoo-kmm": "ADC", "u-faa-jrt": "ADC", "u-hoo-dco": "ADC",
  "u-hoo-jrt": "DISTRICT_COMMISSIONER", "u-dc-kmm": "DISTRICT_COMMISSIONER",
  "u-dps-mun": { missing: "Zonal Revenue Officer (municipal)" }, "u-faa-mun": { missing: "Additional Commissioner, Municipal Corporation" },
  "u-hoo-mun": { missing: "Zonal Commissioner (municipal)" }, "u-ca-mun": { missing: "Commissioner, Municipal Corporation" },
  "u-dps-sw-kmm": "ASSISTANT_COMMISSIONER", "u-link-sw-kmm": "ASSISTANT_COMMISSIONER", "u-dps-sw-snp": "ASSISTANT_COMMISSIONER",
  "u-da-kmm": "DEALING_ASSISTANT", "u-da-snp": "DEALING_ASSISTANT",
  "u-cdc-snp": "CO_DISTRICT_COMMISSIONER",
  "u-saa-rev": "COMMISSIONER_SECRETARY", "u-saa-hua": "COMMISSIONER_SECRETARY", "u-saa-sje": "COMMISSIONER_SECRETARY", "u-fin-senior": "COMMISSIONER_SECRETARY",
  "u-cc": "CHIEF_COMMISSIONER_ASCRTPS",
  "u-com1": { missing: "Commissioner, ARTPS Commission (State Commissioner)" }, "u-com2": { missing: "Commissioner, ARTPS Commission (State Commissioner)" },
  "u-registrar": { missing: "Registrar, ARTPS Commission (MDM's REGISTRAR is the revenue Registrar)" },
  "u-ss-ddo": { missing: "Drawing and Disbursing Officer" },
  "u-fin-nodal": { missing: "Joint Secretary to the Govt. of Assam" }, "u-fin-backup": { missing: "Deputy Secretary to the Govt. of Assam" },
  "u-ca-pers": "PRINCIPAL_SECRETARY", "u-ca-ias": { missing: "Additional Chief Secretary to the Govt. of Assam" },
  "u-callcentre": { iam: true }, "u-admin": { iam: true },
};

/** AMS master attributes MDM has no field or entity for. Owner says where they should go. */
export const ATTRIBUTE_GAPS: { area: string; attribute: string; amsWhere: string; owner: Owner; action: string }[] = [
  { area: "Service", attribute: "Who is DPS, Link Officer, FAA and SAA for a service at an office (structured)", amsWhere: "AuthorityMapping", owner: "MDM",
    action: "MDM has only dpsText/faaText/saaText and the service-role-type list. Add a service-authority entity: service × role type (DPS, LINK, FAA, SAA, DA) → designation + office type, with validity dates. AMS would then resolve the person through HR." },
  { area: "Service", attribute: "FAA and SAA decision time (days) per service", amsWhere: "Service.faaDays / saaDays", owner: "MDM", action: "Add faaDays and saaDays to service (notified particulars, like timelineDays)." },
  { area: "Service", attribute: "Document checklist (mandatory, alternatives, fetched, live photo)", amsWhere: "Service.documents", owner: "MDM", action: "Add a service-document entity (notified enclosures) or hold it in the service catalogue." },
  { area: "Service", attribute: "Eligibility conditions", amsWhere: "Service.eligibility", owner: "MDM", action: "Add notified eligibility text to service." },
  { area: "Service", attribute: "Fees (statutory charge, convenience fee)", amsWhere: "Service.fees", owner: "MDM", action: "Add a service-fee entity (label, amount, head of account)." },
  { area: "Service", attribute: "Workflow steps, extra form fields, maximum reverts", amsWhere: "Service.workflow / formFields / maxReverts", owner: "SERVICE_CONFIG", action: "Belongs to the rule engine / service configuration, not to MDM." },
  { area: "Service", attribute: "Purpose text shown to citizens", amsWhere: "Service.purpose", owner: "MDM", action: "MDM has description; use it and drop the AMS copy." },
  { area: "Employee", attribute: "Current designation and office (posting)", amsWhere: "User.designation / officeId", owner: "HR", action: "Postings come from HR (sanctioned posts are in MDM). AMS should read who holds a chair from HR." },
  { area: "Employee", attribute: "Payroll type, monthly pay, retirement date, service status (suspended, retired…)", amsWhere: "StaffRecord", owner: "HR", action: "HR/payroll data, needed for penalty recovery. Not master data for MDM; take from HR when available." },
  { area: "Employee", attribute: "Competent (appointing/disciplinary) authority of an officer", amsWhere: "StaffRecord.competentAuthorityId", owner: "MDM", action: "MDM cadre has a controlling department only. Add the competent-authority designation to cadre (e.g. IAS → Additional Chief Secretary, Personnel (A); ACS → Principal Secretary, Personnel)." },
  { area: "Employee", attribute: "Employee code issued by AMS (EMP-000101 style)", amsWhere: "User.employeeId / StaffRecord", owner: "MDM", action: "MDM mints employee codes (EMP-NNNN); AMS must not invent them. Mint the AMS officers in MDM (POST /mdm/employees/mint) and store the minted codes." },
  { area: "Office", attribute: "Head of office (person)", amsWhere: "Office.headOfOfficeId", owner: "HR", action: "Who heads an office is a posting (HR); the head-of-office designation per office type could be an MDM rule." },
  { area: "Finance", attribute: "Head of account for ARTPS penalties", amsWhere: "Setting headOfAccount", owner: "MDM", action: "A head-of-account code list in MDM (Finance) would let eGRAS, Finance and AMS share it." },
  { area: "Finance", attribute: "Penalty ranges by authority (section 9)", amsWhere: "Setting penaltyRanges", owner: "SERVICE_CONFIG", action: "A rule of the Act; belongs with the rule engine." },
  { area: "Code lists", attribute: "Payroll types and employee statuses", amsWhere: "src/adapters/staff-records.ts", owner: "MDM", action: "Shared code lists; add to MDM so HR, Finance and AMS use the same values." },
  { area: "Code lists", attribute: "Appeal grounds, order templates, hearing modes, penalty statuses", amsWhere: "src/domain", owner: "AMS", action: "Specific to appeals; stays in AMS." },
  { area: "Roles", attribute: "User roles and sign-in (citizen, call centre, admin)", amsWhere: "User.role", owner: "IAM", action: "Identity and access, not master data." },
];

export type AmsMasters = {
  departments: { code: string; name: string }[];
  districts: { code: string; name: string }[];
  offices: { id: string; name: string; districtCode: string; departmentCode: string }[];
  services: { code: string; name: string; departmentCode: string; timeLimitWorkingDays: number }[];
  officers: { id: string; name: string; designation: string | null; employeeId: string | null }[];
  holidays: { date: string; name: string }[];
};

/** MDM records by type, then by code (the AMS local copy). */
export type MdmIndex = Map<string, Map<string, { code: string; name?: string | null; isActive: boolean; [k: string]: unknown }>>;

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/\(demo\)/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();

function linkRow(area: string, amsKey: string, amsName: string, link: Link | undefined, mdm: MdmIndex, extra: (rec: Record<string, unknown>) => string[] = () => []): GapRow {
  if (!link) return { area, amsKey, amsName, mdmType: null, mdmCode: null, status: "MISSING", differences: [], action: "No crosswalk entry: decide the MDM code or add the record to MDM.", owner: "MDM" };
  if (link.type === null) return { area, amsKey, amsName, mdmType: null, mdmCode: null, status: "MISSING", differences: [], action: `Add to MDM. ${link.reason}`, owner: link.owner ?? "MDM" };
  const rec = mdm.get(link.type)?.get(link.code);
  if (!rec) return { area, amsKey, amsName, mdmType: link.type, mdmCode: link.code, status: "MISSING", differences: [], action: `Expected ${link.type} ${link.code} in MDM, but the local copy does not have it. Sync, or add it to MDM.`, owner: "MDM" };
  if (!rec.isActive) return { area, amsKey, amsName, mdmType: link.type, mdmCode: link.code, status: "INACTIVE", differences: [], action: "Deactivated in MDM: AMS must stop using it.", owner: "AMS" };
  const differences = [...(link.note ? [link.note] : []), ...extra(rec)];
  return { area, amsKey, amsName, mdmType: link.type, mdmCode: link.code, status: differences.length ? "DIFFERS" : "MATCHED", differences, action: differences.length ? "Use the MDM record; correct AMS where they differ." : "Use the MDM code.", owner: "AMS" };
}

export function gapReport(ams: AmsMasters, mdm: MdmIndex): GapRow[] {
  const rows: GapRow[] = [];
  const deptCode = (amsDept: string) => { const l = DEPARTMENT_LINKS[amsDept]; return l && l.type ? l.code : null; };

  for (const d of ams.departments) rows.push(linkRow("Department", d.code, d.name, DEPARTMENT_LINKS[d.code], mdm, (r) => (norm(r.name).includes(norm(d.name).replace(/ department$/, "")) || norm(d.name).includes(norm(r.name).replace(/ department$/, "")) ? [] : [`Name: AMS "${d.name}", MDM "${r.name}"`])));
  for (const d of ams.districts) rows.push(linkRow("District", d.code, d.name, DISTRICT_LINKS[d.code], mdm, (r) => (norm(d.name).startsWith(norm(r.name)) ? [] : [`Name: AMS "${d.name}", MDM "${r.name}"`])));
  for (const o of ams.offices) {
    rows.push(linkRow("Office", o.id, o.name, OFFICE_LINKS[o.id], mdm, (r) => {
      const out: string[] = [];
      const dl = DISTRICT_LINKS[o.districtCode];
      if (r.districtCode && dl?.type === "district" && dl.code !== r.districtCode) out.push(`District: AMS ${o.districtCode}, MDM ${r.districtCode}`);
      const dc = deptCode(o.departmentCode);
      if (r.departmentCode && dc && dc !== r.departmentCode) out.push(`Department: AMS ${o.departmentCode} (${dc} in MDM), MDM office is under ${r.departmentCode}`);
      return out;
    }));
  }
  for (const s of ams.services) {
    rows.push(linkRow("Service", s.code, s.name, SERVICE_LINKS[s.code], mdm, (r) => {
      const out: string[] = [];
      if (Number(r.timelineDays) !== s.timeLimitWorkingDays) out.push(`Time limit: AMS ${s.timeLimitWorkingDays} working days, MDM ${r.timelineDays} days`);
      const dc = deptCode(s.departmentCode);
      if (dc !== r.departmentCode) out.push(`Department: AMS ${s.departmentCode}${dc ? ` (${dc})` : ""}, MDM ${r.departmentCode}`);
      return out;
    }));
  }
  for (const u of ams.officers) {
    const l = DESIGNATION_LINKS[u.id];
    const name = `${u.name.replace(" (Demo)", "")}: ${u.designation ?? ""}`;
    if (!l) rows.push({ area: "Designation", amsKey: u.id, amsName: name, mdmType: null, mdmCode: null, status: "MISSING", differences: [], action: "No designation code: map it or add the designation to MDM.", owner: "MDM" });
    else if (typeof l === "string") rows.push(linkRow("Designation", u.id, name, { type: "designation", code: l }, mdm));
    else if ("iam" in l) rows.push({ area: "Designation", amsKey: u.id, amsName: name, mdmType: null, mdmCode: null, status: "NOT_FOR_MDM", differences: [], action: "A portal role, not a Government designation.", owner: "IAM" });
    else rows.push({ area: "Designation", amsKey: u.id, amsName: name, mdmType: "designation", mdmCode: null, status: "MISSING", differences: [], action: `Add designation "${l.missing}" to MDM.`, owner: "MDM" });
  }
  // Employees: AMS codes are local; MDM mints EMP-NNNN. Match by code only when it has MDM's shape.
  const employees = mdm.get("employee") ?? new Map();
  for (const u of ams.officers.filter((x) => x.employeeId)) {
    const rec = employees.get(u.employeeId!);
    rows.push(rec
      ? { area: "Employee", amsKey: u.employeeId!, amsName: u.name, mdmType: "employee", mdmCode: u.employeeId!, status: norm(rec.name) === norm(u.name) ? "MATCHED" : "DIFFERS", differences: norm(rec.name) === norm(u.name) ? [] : [`Name: AMS "${u.name}", MDM "${rec.name}"`], action: "Use the MDM employee.", owner: "AMS" }
      : { area: "Employee", amsKey: u.employeeId!, amsName: u.name, mdmType: "employee", mdmCode: null, status: "MISSING", differences: [], action: "Not in MDM. Mint in MDM (POST /mdm/employees/mint) and replace the AMS code with the minted EMP-NNNN.", owner: "MDM" });
  }
  // Holidays: state-wide closures (GAZETTED) by date.
  const mdmHolidays = [...(mdm.get("holiday") ?? new Map()).values()].filter((h) => h.isActive && !h.districtCode);
  const byDate = new Map(mdmHolidays.map((h) => [String(h.date ?? h.code), h]));
  for (const h of ams.holidays) {
    const r = byDate.get(h.date);
    if (!r) rows.push({ area: "Holiday", amsKey: h.date, amsName: h.name, mdmType: "holiday", mdmCode: null, status: "MISSING", differences: [], action: "AMS closes the office on this day; MDM has no holiday. Agree the official calendar and add it to MDM.", owner: "MDM" });
    else if (r.holidayType !== "GAZETTED") rows.push({ area: "Holiday", amsKey: h.date, amsName: h.name, mdmType: "holiday", mdmCode: r.code, status: "DIFFERS", differences: [`MDM has "${r.name}" as ${String(r.holidayType).toLowerCase()} (office stays open); AMS closes the office`], action: "Agree whether the office is closed.", owner: "MDM" });
    else rows.push({ area: "Holiday", amsKey: h.date, amsName: h.name, mdmType: "holiday", mdmCode: r.code, status: "MATCHED", differences: [], action: "Use the MDM holiday.", owner: "AMS" });
  }
  const amsDates = new Set(ams.holidays.map((h) => h.date));
  for (const r of mdmHolidays.filter((h) => h.holidayType === "GAZETTED" && !amsDates.has(String(h.date ?? h.code)) && String(h.date ?? h.code) >= "2026-01-01")) {
    rows.push({ area: "Holiday", amsKey: String(r.date ?? r.code), amsName: `(not in AMS) ${r.name}`, mdmType: "holiday", mdmCode: r.code, status: "DIFFERS", differences: ["MDM closes the office; AMS counts it as a working day"], action: "AMS should take its calendar from MDM.", owner: "AMS" });
  }
  return rows;
}

export function gapSummary(rows: GapRow[]) {
  const by = <K extends string>(f: (r: GapRow) => K) => rows.reduce((m, r) => m.set(f(r), (m.get(f(r)) ?? 0) + 1), new Map<K, number>());
  return { byStatus: by((r) => r.status), byArea: by((r) => `${r.area}:${r.status}`) };
}
