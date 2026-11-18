// HR Utility layer: who holds a seat (holder or Link Officer) at a time, a delay ledger built from HR, the HR event
// feed, and a readiness check of every AMS authority mapping. AMS screens still use AMS's own assignments.
// See docs/hr-integration.md.

import { hrHttp, HrError, officeHoursOn, type HrClient, type SeatHolders } from "@/adapters/hr";
import { addDays } from "@/domain/dates";
import { isWorkingDay } from "@/domain/calendar";
import { pickOfficer, SEATS, spansFromDays, type DayAnswer, type Seat, type SeatRole } from "@/domain/hr-seats";
import { attributeDelay, type LedgerSpan } from "@/domain/ledger";
import { audit, type Actor } from "@/lib/audit";
import { getRuleContext, getToday } from "@/lib/context";
import { prisma, type Db } from "@/lib/db";
import { DomainError } from "./errors";

export async function hrStatus(client: HrClient = hrHttp) {
  try {
    const r = await client.mdmStatus();
    return { reachable: true as const, mdm: r.body, mdmVersion: r.mdmVersion, mdmStale: r.mdmStale, error: null };
  } catch (e) {
    return { reachable: false as const, mdm: null, mdmVersion: null, mdmStale: false, error: (e as Error).message };
  }
}

type SeatQ = { officeCode: string; postCode: string; functionCode: string };

/**
 * Asks the HR Utility who holds a seat at `at` and returns AMS's pick. Answers AMS acts on (ledger, lookup) are kept
 * with the MDM version they reflect; readiness checks are not decisions and are not kept.
 */
export async function askSeat(seat: SeatQ, at: string, purpose: "READINESS" | "LEDGER" | "LOOKUP", opts: { applicationId?: string; client?: HrClient; db?: Db } = {}) {
  const client = opts.client ?? hrHttp;
  const db = opts.db ?? prisma;
  let res: SeatHolders | null = null;
  let mdmVersion: number | null = null;
  let error: string | null = null;
  let notInHr = false;
  try {
    const r = await client.seatHolders({ officeCode: seat.officeCode, postCode: seat.postCode, functionCode: seat.functionCode, at });
    res = r.body;
    mdmVersion = r.mdmVersion;
  } catch (e) {
    if (!(e instanceof HrError)) throw e;
    error = e.message;
    notInHr = e.status === 404; // office or post the HR Utility does not cover
  }
  const pick = res ? pickOfficer(res) : null;
  const row = {
    askedAt: new Date().toISOString(), at, officeCode: seat.officeCode, postCode: seat.postCode, functionCode: seat.functionCode,
    purpose, applicationId: opts.applicationId ?? null,
    status: res?.status ?? (notInHr ? "NOT_IN_HR" : "ERROR"), employeeId: pick?.employeeId ?? null, employeeName: pick?.name ?? null, capacity: pick?.capacity ?? null,
    chairId: pick?.chairId ?? null, reason: error ?? res?.reason ?? null, mdmVersion, response: JSON.stringify(res ?? { error }),
  };
  if (purpose !== "READINESS") await db.hrResolution.create({ data: row });
  return { row, res, pick, error };
}

export type ReadinessRow = {
  serviceCode: string; officeId: string; role: SeatRole; amsOfficer: string | null;
  seat: Seat | null; outcome: "RESOLVED" | "RESOLVED_DEMO" | "NO_ONE" | "NOT_IN_HR" | "NO_SEAT" | "ERROR";
  hrOfficer: string | null; capacity: string | null; others: string[]; note: string | null; mdmVersion: number | null;
};

/** For every current AMS authority mapping and role: can the HR Utility say who holds that seat on `date`? */
export async function hrReadiness(date: string, client: HrClient = hrHttp, db: Db = prisma): Promise<ReadinessRow[]> {
  const mappings = await db.authorityMapping.findMany({ where: { validTo: null }, orderBy: [{ serviceCode: "asc" }, { officeId: "asc" }] });
  const users = new Map((await db.user.findMany({ where: { role: { not: "CITIZEN" } } })).map((u) => [u.id, u.name.replace(" (Demo)", "")]));
  const rows: ReadinessRow[] = [];
  const asked = new Map<string, Awaited<ReturnType<typeof askSeat>>>();
  for (const m of mappings) {
    const spec = SEATS[`${m.serviceCode}|${m.officeId}`];
    const ams: Record<SeatRole, string | null> = { DPS: m.dpsId, FAA: m.faaId, SAA: m.saaId, DA: m.daId };
    for (const role of ["DPS", "FAA", "SAA", "DA"] as SeatRole[]) {
      if (role === "DA" && !m.daId) continue;
      const base = { serviceCode: m.serviceCode, officeId: m.officeId, role, amsOfficer: ams[role] ? users.get(ams[role]!) ?? ams[role] : null };
      const seat = spec?.[role] ?? null;
      if (!seat) { rows.push({ ...base, seat, outcome: "NO_SEAT", hrOfficer: null, capacity: null, others: [], note: "No seat defined for this role.", mdmVersion: null }); continue; }
      if ("notInHr" in seat) { rows.push({ ...base, seat, outcome: "NOT_IN_HR", hrOfficer: null, capacity: null, others: [], note: seat.notInHr, mdmVersion: null }); continue; }
      const key = `${seat.officeCode}|${seat.postCode}|${seat.functionCode}`;
      if (!asked.has(key)) asked.set(key, await askSeat(seat, officeHoursOn(date), "READINESS", { client, db }));
      const a = asked.get(key)!;
      rows.push({
        ...base, seat,
        outcome: a.row.status === "NOT_IN_HR" ? "NOT_IN_HR" : a.error ? "ERROR" : !a.pick ? "NO_ONE" : a.pick.isDemo ? "RESOLVED_DEMO" : "RESOLVED",
        hrOfficer: a.pick ? `${a.pick.name} (${a.pick.employeeId})` : null, capacity: a.pick?.capacity ?? null,
        others: a.pick?.others.map((o) => `${o.name} (${o.employee_id})`) ?? [],
        note: a.error ?? a.res?.reason ?? null, mdmVersion: a.row.mdmVersion,
      });
    }
  }
  return rows;
}

const MAX_LEDGER_DAYS = 90;

/**
 * Who was answerable for an application on each working day of delay, according to the HR Utility (holder, or the
 * Link Officer while the holder was away), split by working days like AMS's own ledger. Compared with AMS's ledger.
 */
export async function hrDelayLedger(applicationId: string, client: HrClient = hrHttp, db: Db = prisma) {
  const app = await db.application.findUnique({ where: { id: applicationId }, include: { ledger: true } });
  if (!app || !app.dueOn) throw new DomainError("No such application with a time limit.");
  const seat = SEATS[`${app.serviceCode}|${app.officeId}`]?.DPS;
  if (!seat || "notInHr" in seat) throw new DomainError(seat && "notInHr" in seat ? seat.notInHr : "No HR seat is defined for this service and office.");
  const { today, cal } = await getRuleContext(db);
  const end = app.deliveredOn ?? app.rejectedOn ?? today;
  const workingDays: string[] = [];
  for (let d = addDays(app.dueOn, 1); d <= end && workingDays.length < MAX_LEDGER_DAYS; d = addDays(d, 1)) if (isWorkingDay(d, cal)) workingDays.push(d);
  if (!workingDays.length) return { app, seat, days: [] as (DayAnswer & { name: string | null; status: string })[], hr: [], ams: attributeDelay(app.ledger as LedgerSpan[], app.dueOn, end, cal), mdmVersions: [] as number[], truncated: false };

  const days: (DayAnswer & { name: string | null; status: string })[] = [];
  const versions = new Set<number>();
  for (const d of workingDays) {
    const a = await askSeat(seat, officeHoursOn(d), "LEDGER", { applicationId, client, db });
    if (a.row.status === "NOT_IN_HR") throw new DomainError(`The HR Utility cannot answer for this office: ${a.error}`);
    if (a.row.mdmVersion) versions.add(a.row.mdmVersion);
    days.push({ day: d, employeeId: a.pick?.employeeId ?? null, capacity: a.pick?.capacity ?? null, name: a.pick?.name ?? null, status: a.row.status });
  }
  const hr = attributeDelay(spansFromDays(days), app.dueOn, end, cal);
  const ams = attributeDelay(app.ledger as LedgerSpan[], app.dueOn, end, cal);
  return { app, seat, days, hr, ams, mdmVersions: [...versions], truncated: workingDays.length === MAX_LEDGER_DAYS };
}

/** Pulls new HR events (posting, charge, function, availability, onboarding) from the outbox, from the last id seen. */
export async function pullHrEvents(actor: Actor, client: HrClient = hrHttp, db: Db = prisma) {
  const cursor = await db.hrEventCursor.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  let after = cursor.lastId;
  let received = 0;
  try {
    for (;;) {
      const { body } = await client.events(after, 500);
      for (const e of body.events) {
        await db.hrEvent.upsert({
          where: { id: e.id }, update: {},
          create: {
            id: e.id, type: e.type, ts: e.ts, effectiveAt: e.effective_at, employeeId: e.payload.employee_id ?? null, officeCode: e.payload.office_id ?? null,
            postCode: e.payload.post_code ?? null, isDemo: !!e.payload.is_demo, payload: JSON.stringify(e.payload), receivedAt: new Date().toISOString(),
          },
        });
        after = Math.max(after, e.id);
        received++;
      }
      if (body.events.length < 500) break;
    }
    await db.hrEventCursor.update({ where: { id: 1 }, data: { lastId: after, polledAt: new Date().toISOString(), lastError: null } });
  } catch (e) {
    await db.hrEventCursor.update({ where: { id: 1 }, data: { lastId: after, polledAt: new Date().toISOString(), lastError: (e as Error).message } });
    throw new DomainError(`Could not read HR events: ${(e as Error).message}`);
  }
  await audit(db, await getToday(db), { actor, action: "hr.events", entityType: "hr", entityId: "events", details: { received, lastId: after } });
  return { received, lastId: after };
}

/** MDM office codes AMS cares about (any seat in the table), for flagging events that affect AMS cases. */
export const AMS_HR_OFFICES = new Set(Object.values(SEATS).flatMap((r) => Object.values(r)).flatMap((s) => ("officeCode" in s ? [s.officeCode] : [])));
