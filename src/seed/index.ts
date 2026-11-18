// Reset and seed. Used by `npm run setup` (via prisma/seed.ts) and by the in-app "Reset demo data" button.

import type { PrismaClient } from "@prisma/client";
import { makeCalendar, subtractWorkingDays } from "@/domain/calendar";
import { DEFAULT_SETTINGS, SETTING_DEFS } from "@/domain/settings";
import { addDays } from "@/domain/dates";
import { stageApplication, stageFirstAppeal } from "./helpers";
import { DEMO_PASSWORD, DEMO_START, DEPARTMENTS, DISTRICTS, HOLIDAYS, MAPPINGS, OFFICES, SCHEDULED_CASTE_CERTIFICATE, SERVICES, STAFF_RECORDS, USERS } from "./masters";

const TABLES = [
  "ExternalApplication", "Task", "MonthlyStatement", "CreditFeedEntry", "WriteOff", "ExceptionCase", "Adjustment", "Stay", "Refund", "Deduction", "TicketLine", "Ticket",
  "RecoveryDirection", "PaymentGRN", "Penalty", "StaffRecord", "Direction", "Vote", "Bench", "Order", "Hearing", "RespondentReply", "MissedDeadline",
  "Appeal", "LedgerEntry", "InfoRequest", "ApplicationDocument", "Application", "Handover", "Notification", "DelayFlag",
  "SchedulerRun", "AuthorityMapping", "Service", "User", "Office", "District", "Department", "Holiday", "Setting", "ClockState", "Counter",
];

export async function wipeDatabase(db: PrismaClient) {
  await db.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  await db.$executeRawUnsafe("INSERT OR IGNORE INTO AuditGuard (id, unlocked) VALUES (1, 0)");
  await db.$executeRawUnsafe("UPDATE AuditGuard SET unlocked = 1 WHERE id = 1");
  await db.$executeRawUnsafe('DELETE FROM "AuditEvent"');
  await db.$executeRawUnsafe("DELETE FROM sqlite_sequence WHERE name = 'AuditEvent'").catch(() => {});
  await db.$executeRawUnsafe("UPDATE AuditGuard SET unlocked = 0 WHERE id = 1");
  for (const t of TABLES) await db.$executeRawUnsafe(`DELETE FROM "${t}"`);
  await db.$executeRawUnsafe("PRAGMA foreign_keys = ON");
}

export async function seedMasters(db: PrismaClient, today = DEMO_START, overrides: Partial<typeof DEFAULT_SETTINGS> = {}) {
  await db.department.createMany({ data: DEPARTMENTS });
  await db.district.createMany({ data: DISTRICTS });
  await db.office.createMany({ data: OFFICES });
  await db.user.createMany({
    data: USERS.map((u) => ({ ...u, email: u.email ?? null, password: u.username ? DEMO_PASSWORD : null, hasDigitalAccess: u.hasDigitalAccess ?? true })),
  });
  await db.staffRecord.createMany({ data: STAFF_RECORDS });
  await db.service.createMany({
    data: SERVICES.map((s) => {
      const x = s as typeof s & Partial<typeof SCHEDULED_CASTE_CERTIFICATE>;
      const json = (v: unknown) => (v === undefined ? null : JSON.stringify(v));
      return { ...s, documents: JSON.stringify(s.documents), eligibility: json(x.eligibility), formFields: json(x.formFields), workflow: json(x.workflow), fees: json(x.fees) };
    }),
  });
  await db.authorityMapping.createMany({ data: MAPPINGS });
  await db.holiday.createMany({ data: HOLIDAYS.map(([date, name]) => ({ date, name })) });
  const values = { ...DEFAULT_SETTINGS, ...overrides };
  await db.setting.createMany({
    data: SETTING_DEFS.map((d) => ({
      key: d.key, value: JSON.stringify(values[d.key]), category: d.category, label: d.label, description: d.description, isSwitch: !!d.isSwitch,
    })),
  });
  await db.clockState.create({ data: { id: 1, today } });
  await db.auditGuard.upsert({ where: { id: 1 }, create: { id: 1, unlocked: false }, update: { unlocked: false } });
}

export function demoCalendar() {
  return makeCalendar(HOLIDAYS.map(([d]) => d), DEFAULT_SETTINGS.offSaturdays);
}

/** A few live applications so the worklists are not empty. Scenario stagers add more. */
export async function seedLiveWork(db: PrismaClient, today = DEMO_START) {
  const cal = demoCalendar();
  const back = (n: number) => subtractWorkingDays(today, n, cal);

  await stageApplication(db, cal, { serviceCode: "INC", citizenId: "u-cit-2", district: "KMM", submittedOn: back(3), status: "IN_PROGRESS" });
  // Scheduled Caste Certificate waiting for the Dealing Assistant's document check.
  await stageApplication(db, cal, { serviceCode: "SCC", citizenId: "u-cit-3", district: "KMM", submittedOn: back(2), status: "IN_PROGRESS", stage: "DA_VERIFY", formData: { applicantName: "Moonmoon Saikia", fatherName: "Hemen Saikia", address: "Ward 11, Hatigaon, Guwahati", purpose: "College admission" } });
  await stageApplication(db, cal, { serviceCode: "CCJ", citizenId: "u-cit-4", district: "KMM", submittedOn: back(2), status: "IN_PROGRESS" });
  await stageApplication(db, cal, { serviceCode: "NCL", citizenId: "u-cit-2", district: "KMM", submittedOn: back(6), status: "AWAITING_CITIZEN", query: { raisedOn: back(1), items: ["Income proof of parents for 2024-25 is not legible. Please upload a clear copy."] } });
  await stageApplication(db, cal, { serviceCode: "PRC", citizenId: "u-cit-3", district: "JRT", submittedOn: back(5), status: "IN_PROGRESS" });

  // Due today: the time limit passes on the next day (start of the breach-to-delivery journey).
  await stageApplication(db, cal, { serviceCode: "PRC", citizenId: "u-cit-1", district: "KMM", submittedOn: back(15), status: "IN_PROGRESS", formData: { applicantName: "Rina Kalita", address: "House 12, Survey, Beltola, Guwahati", purpose: "College admission" } });

  // Rejected three working days ago: the citizen can appeal against the rejection.
  await stageApplication(db, cal, { serviceCode: "INC", citizenId: "u-cit-3", district: "KMM", submittedOn: back(9), status: "REJECTED", rejectedOn: back(3), rejectionReasons: "Income declaration is not countersigned by the Gaon Burah." });

  // Held since the time limit passed; first appeal filed and with the FAA.
  const dueOn = back(10);
  const held = await stageApplication(db, cal, { serviceCode: "NCL", citizenId: "u-cit-2", district: "KMM", submittedOn: back(30), status: "HELD", heldOn: addDays(dueOn, 1) });
  await stageFirstAppeal(db, cal, held, back(6));

  // First appeal two working days from its deadline: moving the clock a week escalates it (start of the escalation chain).
  const late = await stageApplication(db, cal, { serviceCode: "INC", citizenId: "u-cit-4", district: "KMM", submittedOn: back(50), status: "HELD", heldOn: addDays(back(35), 1) });
  await stageFirstAppeal(db, cal, late, back(28));
}

export async function seedBaseline(db: PrismaClient) {
  await wipeDatabase(db);
  await seedMasters(db);
  await seedLiveWork(db);
}
