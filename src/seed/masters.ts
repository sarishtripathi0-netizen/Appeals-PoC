// Fictional master data for the demo. Districts are real Assam districts; offices and people are invented and marked "(Demo)".

export const DEMO_START = "2026-11-02"; // Monday

export const DEPARTMENTS = [
  { code: "REV", name: "Revenue and Disaster Management Department" },
  { code: "HUA", name: "Housing and Urban Affairs Department" },
  { code: "SJE", name: "Social Justice and Empowerment Department" },
  { code: "ARP", name: "Administrative Reforms, Training, Pension and Public Grievances Department" },
  { code: "FIN", name: "Finance Department" },
];

export const DISTRICTS = [
  { code: "KMM", name: "Kamrup Metropolitan" },
  { code: "JRT", name: "Jorhat" },
  // A co-district is listed alongside districts so the applicant can choose where the service is delivered.
  { code: "SNP", name: "Sonapur Co-District (Kamrup Metropolitan)" },
];

export const OFFICES = [
  { id: "OFF-KMM-DPR", name: "Dispur Revenue Circle Office (Demo)", districtCode: "KMM", departmentCode: "REV", headOfOfficeId: "u-hoo-kmm" },
  { id: "OFF-JRT-WRC", name: "Jorhat West Revenue Circle Office (Demo)", districtCode: "JRT", departmentCode: "REV", headOfOfficeId: "u-hoo-jrt" },
  { id: "OFF-KMM-MUN", name: "Municipal Zone 2 Office, Guwahati (Demo)", districtCode: "KMM", departmentCode: "HUA", headOfOfficeId: "u-hoo-mun" },
  { id: "OFF-KMM-DCO", name: "Office of the District Commissioner, Kamrup Metropolitan (Demo)", districtCode: "KMM", departmentCode: "SJE", headOfOfficeId: "u-hoo-dco" },
  { id: "OFF-SNP-CDO", name: "Office of the Co-District Commissioner, Sonapur (Demo)", districtCode: "SNP", departmentCode: "SJE", headOfOfficeId: null },
  { id: "OFF-SEC", name: "Assam Secretariat, Dispur (Demo)", districtCode: "KMM", departmentCode: "REV", headOfOfficeId: null },
  { id: "OFF-AITEC", name: "AITEC & CSD Society, Dispur (Demo)", districtCode: "KMM", departmentCode: "ARP", headOfOfficeId: null },
  { id: "OFF-FIN", name: "Finance Department, Assam Secretariat (Demo)", districtCode: "KMM", departmentCode: "FIN", headOfOfficeId: null },
  { id: "OFF-COMM", name: "Assam Right to Public Services Commission (Demo)", districtCode: "KMM", departmentCode: "REV", headOfOfficeId: null },
];

type U = { id: string; name: string; role: string; designation?: string; officeId?: string; mobile?: string; email?: string; username?: string; employeeId?: string; isBackup?: boolean; hasDigitalAccess?: boolean };

const off = (id: string, name: string, role: string, designation: string, officeId: string, username: string, mobile: string, employeeId?: string): U => ({
  id, name, role, designation, officeId, username, mobile, email: `${username}@sewasetu-demo.example`, employeeId,
});

export const USERS: U[] = [
  // Kamrup Metropolitan — revenue circle
  off("u-dps-kmm", "Anjali Baruah (Demo)", "DPS", "Circle Officer, Dispur Revenue Circle", "OFF-KMM-DPR", "dps.dispur", "9800000101", "EMP-000101"),
  off("u-link-kmm", "Ripunjoy Kalita (Demo)", "LINK_OFFICER", "Assistant Settlement Officer, Dispur (Link Officer)", "OFF-KMM-DPR", "link.dispur", "9800000102", "EMP-000102"),
  off("u-faa-kmm", "Pranab Hazarika (Demo)", "FAA", "Additional District Commissioner, Kamrup Metropolitan", "OFF-KMM-DPR", "faa.kamrup", "9800000103", "EMP-000103"),
  off("u-hoo-kmm", "Mitali Das (Demo)", "HEAD_OF_OFFICE", "Additional District Commissioner (Revenue), Kamrup Metropolitan", "OFF-KMM-DPR", "hoo.kamrup", "9800000104"),
  // Jorhat — revenue circle
  off("u-dps-jrt", "Nilakshi Gogoi (Demo)", "DPS", "Circle Officer, Jorhat West Revenue Circle", "OFF-JRT-WRC", "dps.jorhat", "9800000201", "EMP-000201"),
  off("u-link-jrt", "Dipankar Saikia (Demo)", "LINK_OFFICER", "Circle Officer, Jorhat East (Link Officer)", "OFF-JRT-WRC", "link.jorhat", "9800000202", "EMP-000202"),
  off("u-faa-jrt", "Rituraj Bora (Demo)", "FAA", "Additional District Commissioner, Jorhat", "OFF-JRT-WRC", "faa.jorhat", "9800000203", "EMP-000203"),
  off("u-hoo-jrt", "Jahnabi Phukan (Demo)", "HEAD_OF_OFFICE", "District Commissioner, Jorhat", "OFF-JRT-WRC", "hoo.jorhat", "9800000204"),
  // Municipal (trade licence)
  off("u-dps-mun", "Farhana Ahmed (Demo)", "DPS", "Zonal Revenue Officer, Municipal Zone 2", "OFF-KMM-MUN", "dps.municipal", "9800000301", "EMP-000301"),
  off("u-faa-mun", "Sanjib Choudhury (Demo)", "FAA", "Additional Commissioner, Municipal Corporation", "OFF-KMM-MUN", "faa.municipal", "9800000302", "EMP-000302"),
  off("u-hoo-mun", "Rupjyoti Sarma (Demo)", "HEAD_OF_OFFICE", "Zonal Commissioner, Municipal Zone 2", "OFF-KMM-MUN", "hoo.municipal", "9800000303"),
  // Office of the District Commissioner, Kamrup Metropolitan: Scheduled Caste Certificate (district level)
  off("u-dps-sw-kmm", "Nayanmoni Baishya (Demo)", "DPS", "Assistant Commissioner (Social Welfare), Kamrup Metropolitan", "OFF-KMM-DCO", "dps.socialwelfare", "9800000701", "EMP-000701"),
  off("u-link-sw-kmm", "Partha Pratim Nath (Demo)", "LINK_OFFICER", "Assistant Commissioner (ARTPS), Kamrup Metropolitan (Link Officer)", "OFF-KMM-DCO", "link.artps", "9800000702", "EMP-000702"),
  off("u-dc-kmm", "Bornali Goswami (Demo)", "FAA", "District Commissioner, Kamrup Metropolitan", "OFF-KMM-DCO", "dc.kamrup", "9800000703", "EMP-000703"),
  off("u-hoo-dco", "Ranjit Medhi (Demo)", "HEAD_OF_OFFICE", "Additional District Commissioner (Establishment), Kamrup Metropolitan", "OFF-KMM-DCO", "adc.establishment", "9800000704"),
  off("u-da-kmm", "Juri Talukdar (Demo)", "DEALING_ASSISTANT", "Dealing Assistant, Social Welfare Branch, Kamrup Metropolitan", "OFF-KMM-DCO", "da.socialwelfare", "9800000705", "EMP-000705"),
  // Office of the Co-District Commissioner, Sonapur: Scheduled Caste Certificate (co-district level)
  off("u-dps-sw-snp", "Kamal Ch. Deka (Demo)", "DPS", "Assistant Commissioner (Social Welfare), Sonapur Co-District", "OFF-SNP-CDO", "dps.sonapur", "9800000711", "EMP-000711"),
  off("u-cdc-snp", "Rumi Hazarika (Demo)", "FAA", "Co-District Commissioner, Sonapur", "OFF-SNP-CDO", "cdc.sonapur", "9800000712", "EMP-000712"),
  off("u-da-snp", "Pinky Sarma (Demo)", "DEALING_ASSISTANT", "Dealing Assistant, Office of the Co-District Commissioner, Sonapur", "OFF-SNP-CDO", "da.sonapur", "9800000713", "EMP-000713"),
  // Secretariat (SAA = senior-most Secretary of the department)
  off("u-saa-rev", "Debajit Mahanta (Demo)", "SAA", "Commissioner and Secretary, Revenue and Disaster Management Department", "OFF-SEC", "saa.revenue", "9800000401", "EMP-000401"),
  off("u-saa-hua", "Kaberi Sarma (Demo)", "SAA", "Commissioner and Secretary, Housing and Urban Affairs Department", "OFF-SEC", "saa.urban", "9800000402", "EMP-000402"),
  off("u-saa-sje", "Anupam Choudhury (Demo)", "SAA", "Commissioner and Secretary, Social Justice and Empowerment Department (senior-most Secretary)", "OFF-SEC", "saa.socialjustice", "9800000403", "EMP-000403"),
  // RTPS Commission
  off("u-cc", "Arunima Barthakur (Demo)", "CHIEF_COMMISSIONER", "Chief Commissioner, ARTPS Commission", "OFF-COMM", "chief.commissioner", "9800000501"),
  off("u-com1", "Imran Hussain (Demo)", "COMMISSIONER", "Commissioner, ARTPS Commission", "OFF-COMM", "commissioner.one", "9800000502"),
  off("u-com2", "Lakhi Nath (Demo)", "COMMISSIONER", "Commissioner, ARTPS Commission", "OFF-COMM", "commissioner.two", "9800000503"),
  off("u-registrar", "Pallavi Choudhury (Demo)", "REGISTRAR", "Registrar, ARTPS Commission", "OFF-COMM", "registrar", "9800000504"),
  // More officers for the penalty module: on deputation, retiring soon, suspended, and one with several penalties
  off("u-dps-dep", "Rakesh Pegu (Demo)", "DPS", "Circle Officer, Jorhat East Revenue Circle (now on deputation to a public sector undertaking)", "OFF-JRT-WRC", "dps.deputation", "9800000221", "EMP-000221"),
  off("u-dps-ret", "Gitanjali Bora (Demo)", "DPS", "Assistant Settlement Officer, Dispur Revenue Circle", "OFF-KMM-DPR", "dps.retiring", "9800000121", "EMP-000121"),
  off("u-dps-sus", "Moinul Haque (Demo)", "DPS", "Circle Officer, Titabar Revenue Circle (under suspension)", "OFF-JRT-WRC", "dps.suspended", "9800000222", "EMP-000222"),
  off("u-dps-two", "Pallab Dutta (Demo)", "DPS", "Circle Officer, Chandmari Revenue Circle", "OFF-KMM-DPR", "dps.chandmari", "9800000122", "EMP-000122"),
  // Penalty recovery: central, through the Sewa Setu DDO and the Finance nodal officer (PLAN.md Part 2)
  off("u-ss-ddo", "Dipika Choudhury (Demo)", "SEWA_SETU_DDO", "Drawing and Disbursing Officer (Sewa Setu), AITEC & CSD Society", "OFF-AITEC", "ddo.sewasetu", "9800000801"),
  off("u-fin-nodal", "Arup Kumar Das (Demo)", "FINANCE_NODAL", "Joint Secretary, Finance Department (Nodal Officer for ARTPS penalties)", "OFF-FIN", "finance.nodal", "9800000811"),
  { ...off("u-fin-backup", "Sangeeta Rajkhowa (Demo)", "FINANCE_NODAL", "Deputy Secretary, Finance Department (Backup Nodal Officer for ARTPS penalties)", "OFF-FIN", "finance.backup", "9800000812"), isBackup: true },
  off("u-fin-senior", "Hrishikesh Barman (Demo)", "FINANCE_SENIOR", "Commissioner and Secretary, Finance Department", "OFF-FIN", "finance.senior", "9800000813"),
  off("u-ca-pers", "Madhurima Kakati (Demo)", "COMPETENT_AUTHORITY", "Principal Secretary, Personnel Department (Competent Authority, Assam Civil Service officers)", "OFF-SEC", "ca.personnel", "9800000821"),
  off("u-ca-ias", "Tapan Kumar Gogoi (Demo)", "COMPETENT_AUTHORITY", "Additional Chief Secretary, Personnel (A) Department (Competent Authority, IAS officers serving the State)", "OFF-SEC", "ca.ias", "9800000822"),
  off("u-ca-mun", "Bijoy Rabha (Demo)", "COMPETENT_AUTHORITY", "Commissioner, Municipal Corporation (Competent Authority, municipal officers)", "OFF-KMM-MUN", "ca.municipal", "9800000823"),
  // Support
  off("u-callcentre", "Call Centre Agent 01 (Demo)", "CALL_CENTRE", "Sewa Setu Call Centre", "OFF-SEC", "callcentre", "9800000601"),
  off("u-admin", "Portal Administrator (Demo)", "ADMIN", "Sewa Setu Administrator", "OFF-SEC", "admin", "9800000602"),
  // Citizens
  { id: "u-cit-1", name: "Rina Kalita (Demo)", role: "CITIZEN", mobile: "9000000001", email: "rina.demo@example.com" },
  { id: "u-cit-2", name: "Bikash Borah (Demo)", role: "CITIZEN", mobile: "9000000002", email: "bikash.demo@example.com" },
  { id: "u-cit-3", name: "Moonmoon Saikia (Demo)", role: "CITIZEN", mobile: "9000000003", email: "moonmoon.demo@example.com" },
  { id: "u-cit-4", name: "Abdul Karim (Demo)", role: "CITIZEN", mobile: "9000000004", email: null as unknown as undefined, hasDigitalAccess: false },
];

export const DEMO_PASSWORD = "demo123";

/** Officers whose staff records drive the exception cases: deputation (E8), retirement (E9), suspension (E11). */
const STAFF_OVERRIDES: Record<string, Partial<{ office: string; payrollType: string; retirementOn: string; status: string; monthlyPay: number }>> = {
  "EMP-000221": { payrollType: "PSU", office: "On deputation: a State public sector undertaking (Demo)", monthlyPay: 81200 },
  "EMP-000121": { retirementOn: "2026-12-31" },
  "EMP-000222": { status: "SUSPENDED", monthlyPay: 39200 },
};

const doc = (name: string, mandatory = true) => ({ name, mandatory });

/**
 * Issuance of Scheduled Caste Certificate, from the draft notification of the Social Justice and Empowerment Department
 * revising notification E-No. 541695/58 dated 26.08.2025 (Section 4, ARTPS Act). As decided for the POC, every application
 * follows one workflow with a 30-working-day time limit, instead of the draft's three verification routes (3/7/30 days).
 */
export const SCHEDULED_CASTE_CERTIFICATE = {
  code: "SCC",
  name: "Scheduled Caste Certificate",
  purpose: "Certifies that you belong to a notified Scheduled Caste and live in Assam, for reservation in education and jobs, government benefits and welfare schemes.",
  departmentCode: "SJE",
  notificationRef: "Draft notification revising E-No. 541695/58 dated 26.08.2025, Social Justice and Empowerment Department",
  timeLimitWorkingDays: 30,
  eligibility: [
    "You must be a permanent resident of Assam.",
    "Your father must already be recognised as a member of a Scheduled Caste community (with a valid SC certificate), or",
    "if there is no parental SC certificate: a recommendation from an authorised caste/tribe/community organisation notified by the State Government, or from the local Gaonburha (village head) or Ward Commissioner (urban area), and an affidavit affirming caste status.",
  ],
  formFields: [
    { key: "fatherName", label: "Father's full name", required: true },
    { key: "fatherCertNo", label: "Father's SC certificate number (if he has one)", required: false, help: "If it is in the e-District repository, you will not need to upload it. Demo: SC/KMM/2019/004512 (Ramen Kalita) or SC/KMM/2016/001877 (Dilip Borah)." },
  ],
  documents: [
    { name: "Applicant's photograph (captured live)", mandatory: true, live: true, help: "Captured once now and printed on the certificate. No upload." },
    { name: "Proof of date of birth (Birth Certificate, Aadhaar, PAN or Board Admit Card)", mandatory: true, fetch: "DOB" },
    { name: "Proof of residence (PRC, Aadhaar, EPIC, land document, electricity bill or ration card) of applicant or parent", mandatory: true, fetch: "RESIDENCE" },
    { name: "Scheduled Caste certificate of father", mandatory: false, group: "CASTE_BASIS", fetch: "FATHER_SC_CERT", help: "Either this, or the recommendation below." },
    { name: "Recommendation of a notified caste/community organisation, Gaonburha or Ward Commissioner (standard format)", mandatory: false, group: "CASTE_BASIS", help: "Only if the father's SC certificate is not available. The format is on the department's website." },
    { name: "Any other document (voter list, affidavit, existing caste certificate)", mandatory: false },
  ],
  // System check (same day, at application) -> Dealing Assistant checks the documents -> DPS decides and issues.
  workflow: ["DA_VERIFY", "DPS_DECISION"],
  fees: [{ label: "User/statutory charges", amount: 30 }, { label: "Convenience fee", amount: 10 }],
  maxReverts: 2,
  faaDays: 30,
  saaDays: 60,
};

export const SERVICES = [
  { code: "PRC", name: "Permanent Residence Certificate", purpose: "Certifies that you permanently live in Assam, for admissions, jobs and schemes.", timeLimitWorkingDays: 15, departmentCode: "REV",
    documents: [doc("Proof of residence (land document or tenancy)"), doc("Identity proof (EPIC, Aadhaar or passport)"), doc("Gaon Burah or ward councillor certificate"), doc("Recent photograph", false)] },
  { code: "INC", name: "Income Certificate", purpose: "Certifies your family's annual income, for scholarships, fee waivers and schemes.", timeLimitWorkingDays: 15, departmentCode: "REV",
    documents: [doc("Identity proof (EPIC, Aadhaar or passport)"), doc("Salary certificate or self-declaration of income"), doc("Land holding document", false)] },
  SCHEDULED_CASTE_CERTIFICATE,
  { code: "NCL", name: "Non-Creamy Layer Certificate", purpose: "Certifies that you are not in the creamy layer of Other Backward Classes, for OBC reservation.", timeLimitWorkingDays: 20, departmentCode: "REV",
    documents: [doc("OBC caste certificate"), doc("Income proof of parents for three years"), doc("Identity proof (EPIC, Aadhaar or passport)")] },
  { code: "CCJ", name: "Certified Copy of Jamabandi", purpose: "A certified copy of the land record (Jamabandi) for your plot.", timeLimitWorkingDays: 7, departmentCode: "REV",
    documents: [doc("Dag and patta numbers (land details)"), doc("Identity proof (EPIC, Aadhaar or passport)")] },
  { code: "TRL", name: "Trade Licence (new)", purpose: "Permission from the municipal body to run a trade or business at a place.", timeLimitWorkingDays: 30, departmentCode: "HUA",
    documents: [doc("Proof of premises (ownership or rent agreement)"), doc("Identity proof of the owner"), doc("No-objection from the landlord", false), doc("Fire safety self-declaration")] },
];

type Mapping = {
  serviceCode: string; officeId: string; dpsId: string; linkOfficerId: string | null; faaId: string; saaId: string; validFrom: string;
  daId?: string;
};

export const MAPPINGS: Mapping[] = [
  ...["PRC", "INC", "NCL", "CCJ"].flatMap((s) => [
    { serviceCode: s, officeId: "OFF-KMM-DPR", dpsId: "u-dps-kmm", linkOfficerId: "u-link-kmm", faaId: "u-faa-kmm", saaId: "u-saa-rev", validFrom: "2024-01-01" },
    { serviceCode: s, officeId: "OFF-JRT-WRC", dpsId: "u-dps-jrt", linkOfficerId: "u-link-jrt", faaId: "u-faa-jrt", saaId: "u-saa-rev", validFrom: "2024-01-01" },
  ]),
  // Scheduled Caste Certificate: District Commissioner's office, or the Co-District office where the applicant's area falls under a co-district.
  { serviceCode: "SCC", officeId: "OFF-KMM-DCO", dpsId: "u-dps-sw-kmm", linkOfficerId: "u-link-sw-kmm", faaId: "u-dc-kmm", saaId: "u-saa-sje", validFrom: "2025-08-26", daId: "u-da-kmm" },
  { serviceCode: "SCC", officeId: "OFF-SNP-CDO", dpsId: "u-dps-sw-snp", linkOfficerId: "u-link-sw-kmm", faaId: "u-cdc-snp", saaId: "u-saa-sje", validFrom: "2025-08-26", daId: "u-da-snp" },
  { serviceCode: "TRL", officeId: "OFF-KMM-MUN", dpsId: "u-dps-mun", linkOfficerId: null, faaId: "u-faa-mun", saaId: "u-saa-hua", validFrom: "2024-01-01" },
];

// Indicative Assam public holidays for 2026–27. Dates of festivals that follow lunar calendars are approximate.
// Verify against the Government of Assam holiday notification before any real use.
export const HOLIDAYS: [string, string][] = [
  ["2026-01-15", "Magh Bihu"], ["2026-01-26", "Republic Day"], ["2026-01-31", "Me-Dam-Me-Phi"],
  ["2026-03-04", "Doul Utsav (Holi)"], ["2026-03-21", "Id-ul-Fitr (approx.)"], ["2026-04-03", "Good Friday"],
  ["2026-04-14", "Bohag Bihu"], ["2026-04-15", "Bohag Bihu"], ["2026-05-27", "Id-uz-Zuha (approx.)"],
  ["2026-06-26", "Muharram (approx.)"], ["2026-08-15", "Independence Day"], ["2026-09-04", "Janmashtami (approx.)"],
  ["2026-10-02", "Gandhi Jayanti"], ["2026-10-17", "Kati Bihu"], ["2026-10-19", "Maha Navami"], ["2026-10-20", "Vijaya Dashami"],
  ["2026-10-26", "Lakshmi Puja (approx.)"], ["2026-11-09", "Kali Puja and Diwali (approx.)"], ["2026-11-24", "Lachit Divas and Guru Nanak Jayanti"],
  ["2026-12-25", "Christmas"],
  ["2027-01-15", "Magh Bihu"], ["2027-01-26", "Republic Day"], ["2027-01-31", "Me-Dam-Me-Phi"],
  ["2027-03-10", "Id-ul-Fitr (approx.)"], ["2027-03-22", "Doul Utsav (Holi)"], ["2027-03-26", "Good Friday"],
  ["2027-04-14", "Bohag Bihu"], ["2027-04-15", "Bohag Bihu"], ["2027-05-17", "Id-uz-Zuha (approx.)"],
  ["2027-06-15", "Muharram (approx.)"], ["2027-08-15", "Independence Day"], ["2027-08-25", "Janmashtami (approx.)"],
  ["2027-10-02", "Gandhi Jayanti"], ["2027-10-08", "Maha Navami (approx.)"], ["2027-10-09", "Vijaya Dashami (approx.)"],
  ["2027-10-18", "Kati Bihu (approx.)"], ["2027-10-29", "Kali Puja and Diwali (approx.)"], ["2027-11-24", "Lachit Divas"],
  ["2027-12-25", "Christmas"],
];

/** Competent Authority by cadre: IAS officers (Secretaries, District and Co-District Commissioners), municipal officers, and the Assam Civil Service. */
function competentAuthorityFor(u: U): string {
  // Only the District or Co-District Commissioner themselves; an Additional District Commissioner is an Assam Civil Service officer.
  if (u.role === "SAA" || /^(District|Co-District) Commissioner/.test(u.designation ?? "")) return "u-ca-ias";
  if (u.officeId === "OFF-KMM-MUN") return "u-ca-mun";
  return "u-ca-pers";
}

const PAY: Record<string, number> = { DPS: 78400, LINK_OFFICER: 72100, FAA: 124800, SAA: 205400, DEALING_ASSISTANT: 38600 };

/** Mock staff records for every officer with an employee ID (PLAN.md Part 2, §P3). Officer names and IDs are fictional. */
export const STAFF_RECORDS = USERS.filter((u) => u.employeeId).map((u) => ({
  employeeId: u.employeeId!,
  name: u.name,
  designation: u.designation ?? "",
  office: OFFICES.find((o) => o.id === u.officeId)?.name ?? "",
  monthlyPay: PAY[u.role] ?? 60000,
  payrollType: "STATE",
  retirementOn: "2041-06-30" as string | null,
  status: "ACTIVE",
  competentAuthorityId: competentAuthorityFor(u),
  ...STAFF_OVERRIDES[u.employeeId!],
}));
