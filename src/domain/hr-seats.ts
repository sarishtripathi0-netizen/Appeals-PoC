// Which seat holds each AMS role, as an HR Utility question: office (MDM code), post (MDM designation) and function.
// The HR Utility never names application roles; this mapping belongs to the Rule Engine. Until AMS calls the Rule
// Engine, this table stands in for it. Basis: MDM service dpsText / faaText / saaText and the HR function catalogue.

import type { Holder, SeatHolders } from "@/adapters/hr";
import { addDays, type ISODate } from "./dates";
import type { LedgerSpan } from "./ledger";

export type SeatRole = "DPS" | "FAA" | "SAA" | "DA";
export type Seat = { officeCode: string; postCode: string; functionCode: string; basis: string } | { notInHr: string };

// Seats in offices the HR Utility does not cover yet are still defined: HR answers 404 for them today, and they start
// resolving as soon as HR covers the office.
const DC_KMM_FAA: Seat = { officeCode: "DC_KMM", postCode: "DISTRICT_COMMISSIONER", functionCode: "ARTPS", basis: "MDM faaText: District Commissioner (holds every office function)" };
const SAA_RDM: Seat = { officeCode: "SEC_RDM", postCode: "PRINCIPAL_SECRETARY", functionCode: "GENERAL", basis: "MDM saaText: Principal Secretary, Revenue and Disaster Management" };
const SAA_SJE: Seat = { officeCode: "SEC_SJE", postCode: "SR_MOST_SECRETARY", functionCode: "GENERAL", basis: "Senior-most Secretary, Social Justice and Empowerment" };
const circle = (functionCode: string, basis: string): Record<SeatRole, Seat> => ({
  DPS: { officeCode: "CO_DISPUR", postCode: "CIRCLE_OFFICER", functionCode, basis },
  FAA: DC_KMM_FAA,
  SAA: SAA_RDM,
  DA: { notInHr: "No dealing-assistant step for this service." },
});
const JORHAT: Record<SeatRole, Seat> = {
  DPS: { officeCode: "AS-CR-290-01", postCode: "CIRCLE_OFFICER", functionCode: "REVENUE", basis: "Jorhat West = Jorhat Pachim circle office" },
  FAA: { officeCode: "AS-D-290", postCode: "DISTRICT_COMMISSIONER", functionCode: "ARTPS", basis: "MDM faaText: District Commissioner" },
  SAA: SAA_RDM,
  DA: { notInHr: "No dealing-assistant step for this service." },
};

/** Keyed by `${serviceCode}|${amsOfficeId}` (an AMS authority mapping). */
export const SEATS: Record<string, Record<SeatRole, Seat>> = {
  "INC|OFF-KMM-DPR": circle("INCOME_CERTIFICATE", "MDM service 100009: DPS Circle Officer"),
  "PRC|OFF-KMM-DPR": circle("REVENUE", "Assumed: Circle Officer, revenue function (MDM's PRC entry is a different, district-level service)"),
  "NCL|OFF-KMM-DPR": circle("REVENUE", "Assumed as in AMS: Circle Officer (MDM service 1492 puts it with the ADC (e-Governance) / Co-District Commissioner)"),
  "CCJ|OFF-KMM-DPR": circle("LAND_RECORDS", "Sewa Setu service list 4124: Circle Officer"),
  ...Object.fromEntries(["INC", "PRC", "NCL", "CCJ"].map((s) => [`${s}|OFF-JRT-WRC`, JORHAT])),
  "SCC|OFF-KMM-DCO": {
    DPS: { officeCode: "DC_KMM", postCode: "ADC", functionCode: "SOCIAL_WELFARE", basis: "MDM service 13960389: ADC (e-Governance) / Co-District Commissioner; the ADC holding Social Welfare" },
    FAA: DC_KMM_FAA,
    SAA: SAA_SJE,
    DA: { officeCode: "DC_KMM", postCode: "DEALING_ASSISTANT", functionCode: "SOCIAL_WELFARE", basis: "Dealing Assistant of the Social Welfare branch" },
  },
  "SCC|OFF-SNP-CDO": {
    DPS: { officeCode: "SDO_KMM-SNP", postCode: "CO_DISTRICT_COMMISSIONER", functionCode: "CASTE_CERTIFICATE", basis: "MDM service 13960389: Co-District Commissioner" },
    FAA: DC_KMM_FAA,
    SAA: SAA_SJE,
    DA: { notInHr: "MDM has no Dealing Assistant chair in the Sonapur co-district office." },
  },
  "TRL|OFF-KMM-MUN": {
    DPS: { notInHr: "No municipal (GMC zone) office in MDM, so none in the HR Utility." },
    FAA: { notInHr: "No municipal (GMC) office in MDM." },
    SAA: { notInHr: "Housing and Urban Affairs is not in MDM, so it has no secretariat office there." },
    DA: { notInHr: "No dealing-assistant step for this service." },
  },
};

/** The officer AMS would hold answerable: the first available holder (HR orders by seniority), else the Link Officer. */
export function pickOfficer(r: SeatHolders): { employeeId: string; name: string; capacity: "HOLDER" | "LINK_OFFICER"; chairId: string; isDemo: boolean; others: Holder[] } | null {
  const available = r.holders.filter((h) => h.available);
  if (available.length) {
    const [h, ...others] = available;
    return { employeeId: h.employee_id, name: h.name, capacity: "HOLDER", chairId: h.sanctioned_post_id, isDemo: h.is_demo, others };
  }
  if (r.link_officer) return { employeeId: r.link_officer.employee_id, name: r.link_officer.name, capacity: "LINK_OFFICER", chairId: r.link_officer.sanctioned_post_id, isDemo: r.link_officer.is_demo, others: [] };
  return null;
}

export type DayAnswer = { day: ISODate; employeeId: string | null; capacity: "HOLDER" | "LINK_OFFICER" | null };

/**
 * Merges per-day answers (working days only) into ledger spans, the same shape as AMS's own ledger, so attributeDelay
 * works unchanged. A span runs up to the day before the next answer, so the non-working days between belong to it.
 */
export function spansFromDays(days: DayAnswer[]): LedgerSpan[] {
  const spans: LedgerSpan[] = [];
  let open: LedgerSpan | null = null;
  for (const d of [...days].sort((a, b) => a.day.localeCompare(b.day))) {
    if (open) open.toOn = addDays(d.day, -1);
    if (!d.employeeId) { open = null; continue; } // nobody answerable that day (vacant, no Link Officer)
    const capacity = d.capacity === "LINK_OFFICER" ? "LINK_OFFICER" : "DPS";
    if (open && open.officerId === d.employeeId && open.capacity === capacity) open.toOn = d.day;
    else {
      if (open) open.toOn = addDays(d.day, -1);
      open = { officerId: d.employeeId, capacity, fromOn: d.day, toOn: d.day, source: capacity === "LINK_OFFICER" ? "HANDOVER" : "ASSIGNMENT" };
      spans.push(open);
    }
  }
  return spans;
}
