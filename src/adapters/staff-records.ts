// Mock of the State staff records system (employee ID, pay, payroll type, retirement date, status).
// Backed by the StaffRecord table in the POC; a real implementation would call the HR system.

import type { Db } from "@/lib/db";

export type PayrollType = "STATE" | "DEPUTATION_OUTSIDE" | "ULB" | "AUTONOMOUS" | "PSU" | "CONTRACTUAL";
export type StaffStatus = "ACTIVE" | "SUSPENDED" | "RETIRED" | "RESIGNED" | "DISMISSED" | "DECEASED";

export type StaffRecordData = {
  employeeId: string;
  name: string;
  designation: string;
  office: string;
  monthlyPay: number;
  payrollType: string;
  retirementOn: string | null;
  status: string;
  competentAuthorityId: string | null;
};

export interface StaffRecords {
  find(db: Db, employeeId: string): Promise<StaffRecordData | null>;
}

export const staffRecords: StaffRecords = {
  find: (db, employeeId) => db.staffRecord.findUnique({ where: { employeeId } }),
};

export const PAYROLL_LABELS: Record<string, string> = {
  STATE: "State payroll",
  DEPUTATION_OUTSIDE: "On deputation outside the State",
  ULB: "Urban local body",
  AUTONOMOUS: "Autonomous body",
  PSU: "Public sector undertaking",
  CONTRACTUAL: "Contractual",
};
