// Orders at every level (AMS-53–68, 74, 80–85): drafting, e-Sign, authentication by the Registrar for the Commission,
// and what a final order sets in motion: set-aside, direction, penalties, remand, the citizen's next draft appeal.

import type { Appeal, Application, Order, Service } from "@prisma/client";
import { eSign } from "@/adapters";
import { addPeriod, type Calendar } from "@/domain/calendar";
import { tallyVotes } from "@/domain/commission";
import { formatDate } from "@/domain/dates";
import { attributeDelay, type Attribution, type LedgerSpan } from "@/domain/ledger";
import { orderNumber } from "@/domain/numbering";
import { checkPenaltyPlan, penaltyDecided, penaltyKey, templateFor, type PenaltyLine } from "@/domain/orders";
import type { Level, Settings } from "@/domain/settings";
import { appealMachine, applicationMachine, decide, type AppealCtx, type AppealStatus } from "@/domain/state-machines";
import { audit, SYSTEM_ACTOR, type Actor } from "@/lib/audit";
import { getRuleContext } from "@/lib/context";
import { type Db, parseJson, prisma } from "@/lib/db";
import { notifyMany, notifyUser } from "@/lib/notify";
import { AUTHORITY_NAME, createDraftAppeal, NEXT_LEVEL, registrarIds, type Ground } from "./appeals";
import { DomainError } from "./errors";
import { currentHolderId, rebuildLedger } from "./ledger";
import { imposePenalty } from "./penalties";
import { check } from "./transition";

const DELIVERED = ["DELIVERED", "DELIVERED_CONFIRMED"];

type LedgerRow = { officerId: string; capacity: string; fromOn: string; toOn: string | null; source: string };

/** Delay days per officer, from the day after the due date to delivery (or today). Rejections have none. */
export function delayAttribution(app: Pick<Application, "dueOn" | "deliveredOn" | "rejectedOn" | "heldOn">, ledger: LedgerRow[], today: string, cal: Calendar): Attribution[] {
  if (!app.dueOn || !app.heldOn) return [];
  return attributeDelay(ledger as LedgerSpan[], app.dueOn, app.deliveredOn ?? app.rejectedOn ?? today, cal);
}

export type PenaltyCandidate = { officerId: string; capacity: string };

/** Who an order may penalise: officers in the ledger and, for the Commission, authorities that missed a deadline (AMS-61, 85). */
export function penaltyCandidates(ledger: LedgerRow[], missed: { authorityId: string; level: string }[], level: Level): PenaltyCandidate[] {
  const out = new Map<string, PenaltyCandidate>();
  for (const l of ledger) out.set(penaltyKey(l.officerId, l.capacity), { officerId: l.officerId, capacity: l.capacity });
  if (level === "TAA") for (const m of missed) out.set(penaltyKey(m.authorityId, m.level), { officerId: m.authorityId, capacity: m.level });
  return [...out.values()];
}

export async function missedDeadlinesFor(db: Db, applicationId: string) {
  return db.missedDeadline.findMany({ where: { appeal: { applicationId } }, orderBy: { detectedOn: "asc" } });
}

async function benchOf(db: Db, appealId: string) {
  const bench = await db.bench.findUnique({ where: { appealId } });
  return bench ? { ...bench, members: parseJson<string[]>(bench.memberIds, []) } : null;
}

export type OrderInput = {
  templateCode: string;
  findings: string;
  reasons: string;
  directionDays?: number;
  penalties: PenaltyLine[];
  noPenaltyReason?: string;
  disciplinaryRecommendation?: string;
};

export async function saveOrderDraft(actor: Actor, appealId: string, input: OrderInput) {
  const { today, settings: s } = await getRuleContext();
  const appeal = await prisma.appeal.findUniqueOrThrow({ where: { id: appealId }, include: { orders: true, votes: true, application: { include: { service: true } } } });
  const level = appeal.level as Level;
  const t = templateFor(input.templateCode);
  if (!t || !t.grounds.includes(appeal.ground as Ground) || !t.levels.includes(level)) throw new DomainError("Please choose an order template that fits this appeal.");
  const days = input.directionDays ?? s.defaultDirectionDays;
  if (t.directsDelivery && (!Number.isInteger(days) || days < 1 || days > 60)) throw new DomainError("The time to deliver must be between 1 and 60 days.");

  let isAuthority = appeal.authorityId === actor.id;
  let votesComplete = true;
  let majority: string | null = null;
  let dissent: string | null = null;
  if (level === "TAA") {
    const bench = await benchOf(prisma, appealId);
    isAuthority = bench?.presidingId === actor.id;
    const tally = tallyVotes(bench?.members ?? [], appeal.votes);
    votesComplete = !!tally.decided;
    if (tally.decided && t.position !== tally.decided)
      throw new DomainError(`The bench decided to ${tally.decided.toLowerCase()} the appeal. Choose the template that records that decision.`);
    const names = new Map((await prisma.user.findMany({ where: { id: { in: appeal.votes.map((v) => v.memberId) } } })).map((u) => [u.id, u.name]));
    majority = JSON.stringify({ counts: tally.counts, decided: tally.decided, casting: appeal.votes.find((v) => v.isCasting)?.memberId ?? null });
    dissent = tally.dissenters.length ? tally.dissenters.map((v) => `${names.get(v.memberId)} voted to ${v.position.toLowerCase()}: ${v.note || "no note recorded"}`).join("\n") : null;
  }

  const draft = appeal.orders.find((o) => o.status === "DRAFT");
  const to = await check(appealMachine, { ...appeal, caseRef: appeal.appealNo }, draft ? "editOrder" : "draftOrder", actor, { isAuthority, level, votesComplete }, today);
  const data = {
    templateCode: t.code, outcome: t.outcome, findings: input.findings.trim(), reasons: input.reasons.trim(),
    directionText: t.directsDelivery ? `Deliver the ${appeal.application.service.name} to the citizen within ${days} ${s.directionBasis === "WORKING" ? "working " : ""}days of this order and record the delivery on Sewa Setu.` : null,
    directionDays: t.directsDelivery ? days : null,
    penaltyPlan: JSON.stringify(input.penalties),
    noPenaltyReason: input.penalties.length ? null : input.noPenaltyReason?.trim() || null,
    disciplinaryRecommendation: input.disciplinaryRecommendation?.trim() || null,
    majority, dissent,
  };
  return prisma.$transaction(async (tx) => {
    const order = draft
      ? await tx.order.update({ where: { id: draft.id }, data })
      : await tx.order.create({ data: { ...data, orderNo: orderNumber(appeal.appealNo, appeal.orders.length + 1), appealId, level, status: "DRAFT", draftedById: actor.id, draftedOn: today } });
    await tx.appeal.update({ where: { id: appealId }, data: { status: to } });
    await audit(tx, today, { actor, action: draft ? "appeal.editOrder" : "appeal.draftOrder", entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo, before: appeal.status, after: to, details: { orderNo: order.orderNo, template: t.code } });
    return order;
  });
}

async function loadOrder(orderId: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { appeal: { include: { application: { include: { service: true, ledger: true, office: true, appeals: true } } } } },
  });
}
type LoadedOrder = Awaited<ReturnType<typeof loadOrder>>;

/** Everything needed to check an order and carry it out. */
async function prepare(order: LoadedOrder, today: string, s: Settings, cal: Calendar) {
  const appeal = order.appeal;
  const app = appeal.application;
  const level = appeal.level as Level;
  const t = templateFor(order.templateCode)!;
  const plan = parseJson<PenaltyLine[]>(order.penaltyPlan, []);
  const missed = await missedDeadlinesFor(prisma, app.id);
  const allowed = new Set(penaltyCandidates(app.ledger, missed, level).map((c) => penaltyKey(c.officerId, c.capacity)));
  return {
    appeal, app, level, t, plan,
    attribution: delayAttribution(app, app.ledger, today, cal),
    penaltyError: checkPenaltyPlan(level, plan, allowed, s),
    hasDirection: t.directsDelivery && !DELIVERED.includes(app.status),
  };
}

export async function signOrder(actor: Actor, orderId: string) {
  const { today, settings: s, cal } = await getRuleContext();
  const order = await loadOrder(orderId);
  if (order.status !== "DRAFT") throw new DomainError("This order has already been signed. A signed order cannot be changed.");
  const p = await prepare(order, today, s, cal);
  const isAuthority = p.level === "TAA" ? (await benchOf(prisma, p.appeal.id))?.presidingId === actor.id : p.appeal.authorityId === actor.id;
  const ctx: AppealCtx = {
    isAuthority, level: p.level, reasons: order.reasons, penaltyError: p.penaltyError,
    penaltyDecided: penaltyDecided(p.plan, order.noPenaltyReason), hasDirection: p.hasDirection,
  };
  const to = await check(appealMachine, { ...p.appeal, caseRef: p.appeal.appealNo }, "sign", actor, ctx, today);
  const esignRef = eSign.sign(`${order.orderNo}|${order.findings}|${order.reasons}`, actor.id, today).ref;

  return prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { status: "SIGNED", signedById: actor.id, signedOn: today, esignRef } });
    if (p.level === "TAA") {
      // A Commission order takes effect only when the Registrar authenticates it (AMS-83).
      await tx.appeal.update({ where: { id: p.appeal.id }, data: { status: to } });
      await audit(tx, today, { actor, action: "appeal.sign", entityType: "appeal", entityId: p.appeal.id, caseRef: p.appeal.appealNo, before: p.appeal.status, after: to, details: { orderNo: order.orderNo, outcome: order.outcome, esignRef } });
      await notifyMany(tx, today, await registrarIds(tx), `Order ${order.orderNo} has been signed by the presiding member and is ready for authentication.`,
        { channels: ["DASHBOARD", "EMAIL"], entityType: "appeal", entityId: p.appeal.id, caseRef: p.appeal.appealNo });
      return { to, direction: null };
    }
    await tx.appeal.update({ where: { id: p.appeal.id }, data: { status: to, decidedOn: today, closedOn: to === "CLOSED" ? today : null } });
    const direction = await applyOrderEffects(tx, order, p, actor, today, s, cal);
    await audit(tx, today, {
      actor, action: "appeal.sign", entityType: "appeal", entityId: p.appeal.id, caseRef: p.appeal.appealNo, before: p.appeal.status, after: to,
      details: { orderNo: order.orderNo, outcome: order.outcome, esignRef, penalties: p.plan, noPenaltyReason: order.noPenaltyReason, direction },
    });
    return { to, direction };
  });
}

export async function authenticateOrder(actor: Actor, orderId: string) {
  const { today, settings: s, cal } = await getRuleContext();
  const order = await loadOrder(orderId);
  if (order.level !== "TAA" || order.status !== "SIGNED") throw new DomainError("Only a signed order of the Commission can be authenticated.");
  const p = await prepare(order, today, s, cal);
  const to = await check(appealMachine, { ...p.appeal, caseRef: p.appeal.appealNo }, "authenticate", actor, { hasDirection: p.hasDirection, level: "TAA" }, today);
  return prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { status: "AUTHENTICATED", authenticatedById: actor.id, authenticatedOn: today } });
    await tx.appeal.update({ where: { id: p.appeal.id }, data: { status: to, decidedOn: today, closedOn: to === "CLOSED" ? today : null } });
    const direction = await applyOrderEffects(tx, order, p, actor, today, s, cal);
    await audit(tx, today, {
      actor, action: "appeal.authenticate", entityType: "appeal", entityId: p.appeal.id, caseRef: p.appeal.appealNo, before: p.appeal.status, after: to,
      details: { orderNo: order.orderNo, outcome: order.outcome, penalties: p.plan, direction },
    });
    return { to, direction };
  });
}

type Prepared = Awaited<ReturnType<typeof prepare>>;

/** What a final order sets in motion. Returns the direction to deliver, if any. */
async function applyOrderEffects(tx: Db, order: Order, p: Prepared, actor: Actor, today: string, s: Settings, cal: Calendar) {
  const { appeal, app, t, plan, attribution, level } = p;

  if (t.code === "SET_ASIDE_REJECTION" && app.status === "REJECTED") {
    const d = decide(applicationMachine, "REJECTED", "setAside", "SYSTEM", {});
    if (d.ok) {
      await tx.application.update({ where: { id: app.id }, data: { status: d.to, heldOn: app.heldOn ?? today, rejectedOn: null } });
      await rebuildLedger(tx, app.id);
      await audit(tx, today, { actor: SYSTEM_ACTOR, action: "application.setAside", entityType: "application", entityId: app.id, caseRef: app.uin, before: "REJECTED", after: d.to, details: { orderNo: order.orderNo, rejectedOn: app.rejectedOn } });
    }
  }

  let direction: { dueOn: string; assigneeId: string } | null = null;
  if (p.hasDirection) {
    const assigneeId = (await currentHolderId(tx, app.id, today)) ?? app.dpsId;
    const dueOn = addPeriod(today, order.directionDays ?? s.defaultDirectionDays, s.directionBasis, cal);
    direction = { dueOn, assigneeId };
    await tx.direction.create({ data: { orderId: order.id, appealId: appeal.id, applicationId: app.id, kind: "DELIVER", assigneeId, issuedOn: today, dueOn, status: "OPEN" } });
    await notifyUser(tx, today, assigneeId, `Order ${order.orderNo} directs you to deliver ${app.service.name} on ${app.uin} by ${formatDate(dueOn)}. Record the delivery on Sewa Setu.`,
      { entityType: "appeal", entityId: appeal.id, caseRef: appeal.appealNo });
  }

  // Each penalty starts its own life here (PLAN.md Part 2): deemed service, last date, QR and copies.
  for (const line of plan) {
    await imposePenalty(tx, {
      order, appeal, app, line,
      delayDays: attribution.find((a) => a.officerId === line.officerId)?.delayDays ?? 0,
      imposedById: appeal.authorityId ?? order.signedById ?? actor.id,
    }, today, s, cal);
  }

  if (t.code === "REMAND") await remand(tx, order, app, today, s, cal);

  // AMS-74: decided but still not delivered, so the portal drafts the next appeal for the citizen.
  const next = NEXT_LEVEL[level];
  if (!p.hasDirection && t.code !== "REMAND" && next && !DELIVERED.includes(app.status)) {
    await createDraftAppeal(tx, app, appeal.ground as Ground, today, s, cal, { level: next, parent: { ...appeal, decidedOn: today } });
  }

  // AMS-67: copies to all parties.
  await notifyMany(tx, today, [app.citizenId, app.dpsId, ...plan.map((l) => l.officerId), app.office.headOfOfficeId, appeal.authorityId],
    `Order ${order.orderNo} in appeal ${appeal.appealNo} has been issued (${t.label.toLowerCase()}). A copy is on Sewa Setu.`,
    { entityType: "appeal", entityId: appeal.id, caseRef: appeal.appealNo });
  return direction;
}

/** AMS-84: the case goes back to the highest lower authority that heard it, with a fresh, short deadline. */
async function remand(tx: Db, order: Order, app: Application & { appeals: Appeal[]; service: Service }, today: string, s: Settings, cal: Calendar) {
  const lower = app.appeals.find((a) => a.level === "SAA") ?? app.appeals.find((a) => a.level === "FAA");
  if (!lower) return;
  const d = decide(appealMachine, lower.status as AppealStatus, "reopenOnRemand", "SYSTEM", {});
  if (!d.ok) return;
  const remandDueOn = addPeriod(today, s.remandDays, s.appealDecisionBasis, cal);
  await tx.appeal.update({
    where: { id: lower.id },
    data: { status: d.to, remandCycle: { increment: 1 }, remandDueOn, deadlineOn: remandDueOn, extendedDeadlineOn: null, decidedOn: null, closedOn: null },
  });
  await audit(tx, today, { actor: SYSTEM_ACTOR, action: "appeal.remand", entityType: "appeal", entityId: lower.id, caseRef: lower.appealNo, before: lower.status, after: d.to, details: { orderNo: order.orderNo, remandDueOn } });
  await notifyMany(tx, today, [lower.authorityId, app.citizenId, app.dpsId],
    `The Commission has sent appeal ${lower.appealNo} back to the ${AUTHORITY_NAME[lower.level as Level]} by order ${order.orderNo}. It must be decided again by ${formatDate(remandDueOn)}.`,
    { entityType: "appeal", entityId: lower.id, caseRef: lower.appealNo });
}

// ---------- Compliance hooks used by the application services ----------

/** When the service is delivered, open directions are met and their appeals wait for the citizen's confirmation. */
export async function onDelivered(db: Db, applicationId: string, deliveryRef: string, actor: Actor, today: string) {
  const directions = await db.direction.findMany({ where: { applicationId, status: "OPEN" }, include: { appeal: true } });
  for (const d of directions) {
    await db.direction.update({ where: { id: d.id }, data: { status: "MET", metOn: today, deliveryRef } });
    const next = decide(appealMachine, d.appeal.status as AppealStatus, "deliveryRecorded", actor.role as "DPS", {});
    if (!next.ok) continue;
    await db.appeal.update({ where: { id: d.appealId }, data: { status: next.to } });
    await audit(db, today, { actor, action: "appeal.deliveryRecorded", entityType: "appeal", entityId: d.appealId, caseRef: d.appeal.appealNo, before: d.appeal.status, after: next.to, details: { deliveryRef, directionDueOn: d.dueOn, inTime: today <= d.dueOn } });
    await notifyMany(db, today, [d.appeal.authorityId], `Delivery recorded on appeal ${d.appeal.appealNo} (ref. ${deliveryRef}). Waiting for the citizen to confirm.`,
      { channels: ["DASHBOARD"], entityType: "appeal", entityId: d.appealId, caseRef: d.appeal.appealNo });
  }
}

/** When the citizen confirms receipt, appeals waiting for that confirmation close (AMS-106). */
export async function onConfirmed(db: Db, applicationId: string, actor: Actor, today: string) {
  const appeals = await db.appeal.findMany({ where: { applicationId, status: "AWAITING_CONFIRMATION" } });
  for (const a of appeals) {
    const next = decide(appealMachine, "AWAITING_CONFIRMATION", "confirm", actor.role as "CITIZEN", {});
    if (!next.ok) continue;
    await db.appeal.update({ where: { id: a.id }, data: { status: next.to, closedOn: today } });
    await audit(db, today, { actor, action: "appeal.confirm", entityType: "appeal", entityId: a.id, caseRef: a.appealNo, before: a.status, after: next.to });
    await notifyMany(db, today, [a.authorityId], `The citizen has confirmed receipt. Appeal ${a.appealNo} is closed.`, { channels: ["DASHBOARD"], entityType: "appeal", entityId: a.id, caseRef: a.appealNo });
  }
}

