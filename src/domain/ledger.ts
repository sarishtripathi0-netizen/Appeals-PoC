// Responsibility ledger: who held a case on each day, and how the delay splits between them.

import { isWorkingDay, type Calendar } from "./calendar";
import { addDays, maxDate, minDate, type ISODate } from "./dates";

export type Capacity = "DPS" | "LINK_OFFICER" | "SUCCESSOR";

export type LedgerSpan = {
  officerId: string;
  capacity: Capacity;
  fromOn: ISODate;
  toOn: ISODate | null; // null = still holding
  source: "ASSIGNMENT" | "HANDOVER" | "TRANSFER";
};

export type HandoverSpan = { fromDpsId: string; toLinkOfficerId: string; startOn: ISODate; endOn: ISODate };

/**
 * Builds the ledger for one application: the DPS holds it from the UIN date,
 * except during handover periods, when the Link Officer holds it.
 * `endOn` closes the last span (delivery, rejection or closure); null keeps it open.
 */
export function buildLedger(dpsId: string, uinDate: ISODate, endOn: ISODate | null, handovers: HandoverSpan[]): LedgerSpan[] {
  const relevant = handovers
    .filter((h) => h.fromDpsId === dpsId && h.endOn >= uinDate && (endOn === null || h.startOn <= endOn))
    .sort((a, b) => a.startOn.localeCompare(b.startOn));

  const spans: LedgerSpan[] = [];
  let cursor = uinDate;
  for (const h of relevant) {
    const hStart = maxDate(h.startOn, uinDate);
    const hEnd = endOn ? minDate(h.endOn, endOn) : h.endOn;
    if (hStart < cursor) continue; // overlapping handovers: first one wins
    if (hStart > cursor) spans.push({ officerId: dpsId, capacity: "DPS", fromOn: cursor, toOn: addDays(hStart, -1), source: "ASSIGNMENT" });
    spans.push({ officerId: h.toLinkOfficerId, capacity: "LINK_OFFICER", fromOn: hStart, toOn: hEnd, source: "HANDOVER" });
    cursor = addDays(hEnd, 1);
  }
  if (endOn === null || cursor <= endOn) spans.push({ officerId: dpsId, capacity: "DPS", fromOn: cursor, toOn: endOn, source: "ASSIGNMENT" });
  return spans;
}

export function holderOn(spans: LedgerSpan[], day: ISODate): LedgerSpan | undefined {
  return spans.find((s) => s.fromOn <= day && (s.toOn === null || s.toOn >= day));
}

export type Attribution = { officerId: string; capacity: Capacity; delayDays: number };

/** Splits the working days of delay (the day after the due date up to `untilOn`) among the officers holding the case. */
export function attributeDelay(spans: LedgerSpan[], dueOn: ISODate, untilOn: ISODate, cal: Calendar): Attribution[] {
  const byOfficer = new Map<string, Attribution>();
  for (let d = addDays(dueOn, 1); d <= untilOn; d = addDays(d, 1)) {
    if (!isWorkingDay(d, cal)) continue;
    const h = holderOn(spans, d);
    if (!h) continue;
    const key = `${h.officerId}|${h.capacity}`;
    const a = byOfficer.get(key) ?? { officerId: h.officerId, capacity: h.capacity, delayDays: 0 };
    a.delayDays++;
    byOfficer.set(key, a);
  }
  return [...byOfficer.values()].sort((a, b) => b.delayDays - a.delayDays);
}

/** The suggested officer to penalise: the one who held the case for most of the delay. */
export function suggestedPenaltyOfficer(attribution: Attribution[]): Attribution | undefined {
  return attribution[0];
}
