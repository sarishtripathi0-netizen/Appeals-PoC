// The RTPS Commission (AMS-78–82): Registrar scrutiny, bench assignment, member votes and the Chief Commissioner's casting vote.

import { checkBench, POSITIONS, tallyVotes } from "@/domain/commission";
import type { Position } from "@/domain/orders";
import { appealMachine } from "@/domain/state-machines";
import { audit, type Actor } from "@/lib/audit";
import { getRuleContext } from "@/lib/context";
import { parseJson, prisma } from "@/lib/db";
import { notifyMany, notifyUser } from "@/lib/notify";
import { registrarIds, startReview } from "./appeals";
import { DomainError } from "./errors";
import { check } from "./transition";

const VOTING: string[] = ["UNDER_REVIEW", "HEARING_SCHEDULED"];

export async function commissionerIds(): Promise<Set<string>> {
  return new Set((await prisma.user.findMany({ where: { role: { in: ["COMMISSIONER", "CHIEF_COMMISSIONER"] } }, select: { id: true } })).map((u) => u.id));
}

async function loadTaa(appealId: string) {
  const appeal = await prisma.appeal.findUniqueOrThrow({ where: { id: appealId }, include: { application: true, votes: true, bench: true } });
  if (appeal.level !== "TAA") throw new DomainError("This is not an appeal before the Commission.");
  return appeal;
}

/** Admit the appeal and constitute its bench in one step. Admitting a late appeal accepts the late filing. */
export async function admitAppeal(actor: Actor, appealId: string, memberIds: string[], presidingId: string) {
  const { today, settings: s, cal } = await getRuleContext();
  const appeal = await loadTaa(appealId);
  const err = checkBench(memberIds, presidingId, await commissionerIds());
  if (err) throw new DomainError(err);
  const to = await check(appealMachine, { ...appeal, caseRef: appeal.appealNo }, "admit", actor, {}, today);
  await prisma.$transaction(async (tx) => {
    await tx.appeal.update({ where: { id: appealId }, data: { status: to, lateDecision: appeal.isLate ? "ACCEPTED" : null } });
    await tx.bench.create({ data: { appealId, memberIds: JSON.stringify(memberIds), presidingId, constitutedOn: today } });
    await audit(tx, today, { actor, action: "appeal.admit", entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo, before: appeal.status, after: to, details: { bench: memberIds, presidingId } });
    await startReview(tx, appeal, appeal.application, today, s, cal);
    await notifyMany(tx, today, memberIds, `Third appeal ${appeal.appealNo} has been admitted and placed before your bench.`, { channels: ["DASHBOARD", "EMAIL"], entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo });
    await notifyUser(tx, today, appeal.application.citizenId, `Sewa Setu: Your third appeal ${appeal.appealNo} has been admitted by the Commission and placed before a bench.`,
      { entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo });
  });
}

export async function returnAppeal(actor: Actor, appealId: string, reasons: string) {
  const { today } = await getRuleContext();
  const appeal = await loadTaa(appealId);
  const to = await check(appealMachine, { ...appeal, caseRef: appeal.appealNo }, "return", actor, { reasons }, today);
  await prisma.$transaction(async (tx) => {
    await tx.appeal.update({ where: { id: appealId }, data: { status: to, scrutinyNote: reasons } });
    await audit(tx, today, { actor, action: "appeal.return", entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo, before: appeal.status, after: to, details: { reasons } });
    await notifyUser(tx, today, appeal.application.citizenId, `Sewa Setu: The Commission has returned your appeal ${appeal.appealNo} for correction: ${reasons}. Please correct it and file again on Sewa Setu.`,
      { entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo });
  });
}

export async function rejectAtScrutiny(actor: Actor, appealId: string, reasons: string) {
  const { today } = await getRuleContext();
  const appeal = await loadTaa(appealId);
  const to = await check(appealMachine, { ...appeal, caseRef: appeal.appealNo }, "rejectScrutiny", actor, { reasons }, today);
  await prisma.$transaction(async (tx) => {
    await tx.appeal.update({ where: { id: appealId }, data: { status: to, scrutinyNote: reasons, decidedOn: today, closedOn: today, lateDecision: appeal.isLate ? "REFUSED" : null } });
    await audit(tx, today, { actor, action: "appeal.rejectScrutiny", entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo, before: appeal.status, after: to, details: { reasons } });
    await notifyUser(tx, today, appeal.application.citizenId, `Sewa Setu: The Commission did not admit your appeal ${appeal.appealNo}. Reasons: ${reasons}`,
      { entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo });
  });
}

export async function refileAppeal(actor: Actor, appealId: string, groundsText: string) {
  const { today } = await getRuleContext();
  const appeal = await loadTaa(appealId);
  if (actor.role === "CITIZEN" && appeal.application.citizenId !== actor.id) throw new DomainError("This is not your appeal.");
  if (groundsText.trim().length < 20) throw new DomainError("Please explain the grounds of the appeal in a sentence or two.");
  const to = await check(appealMachine, { ...appeal, caseRef: appeal.appealNo }, "refile", actor, {}, today);
  await prisma.$transaction(async (tx) => {
    await tx.appeal.update({ where: { id: appealId }, data: { status: to, groundsText: groundsText.trim() } });
    await audit(tx, today, { actor, action: "appeal.refile", entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo, before: appeal.status, after: to });
    await notifyMany(tx, today, await registrarIds(tx), `Appeal ${appeal.appealNo} has been corrected and filed again for scrutiny.`, { channels: ["DASHBOARD"], entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo });
  });
}

/** A bench member votes, with an optional note. A vote can be changed until the order is drafted. */
export async function castVote(actor: Actor, appealId: string, position: string, note: string) {
  const { today } = await getRuleContext();
  const appeal = await loadTaa(appealId);
  const members = parseJson<string[]>(appeal.bench?.memberIds, []);
  if (!members.includes(actor.id)) throw new DomainError("Only members of the bench can vote on this appeal.");
  if (!VOTING.includes(appeal.status)) throw new DomainError("Voting is closed on this appeal.");
  if (!POSITIONS.includes(position as Position)) throw new DomainError("Please choose: allow, dismiss or remand.");
  const mine = appeal.votes.find((v) => v.memberId === actor.id && !v.isCasting);
  await prisma.$transaction(async (tx) => {
    if (mine) await tx.vote.update({ where: { id: mine.id }, data: { position, note: note || null, castOn: today } });
    else await tx.vote.create({ data: { appealId, memberId: actor.id, position, note: note || null, castOn: today } });
    // A changed vote can undo a tie, so an earlier casting vote no longer applies.
    await tx.vote.deleteMany({ where: { appealId, isCasting: true } });
    await audit(tx, today, { actor, action: "appeal.vote", entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo, details: { position, changed: !!mine } });
  });
  const votes = await prisma.vote.findMany({ where: { appealId } });
  const tally = tallyVotes(members, votes);
  if (tally.needsCasting) {
    const cc = await prisma.user.findFirst({ where: { role: "CHIEF_COMMISSIONER" } });
    await notifyMany(prisma, today, [cc?.id], `The bench is evenly divided on appeal ${appeal.appealNo}. Your casting vote is needed.`, { channels: ["DASHBOARD", "EMAIL"], entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo });
  } else if (tally.decided) {
    await notifyMany(prisma, today, [appeal.bench?.presidingId], `All members have voted on appeal ${appeal.appealNo}. The order can now be drafted.`, { channels: ["DASHBOARD"], entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo });
  }
  return tally;
}

/** AMS-81: on a tie, the Chief Commissioner decides between the tied positions, even when not on the bench. */
export async function castCastingVote(actor: Actor, appealId: string, position: string, note: string) {
  const { today } = await getRuleContext();
  if (actor.role !== "CHIEF_COMMISSIONER") throw new DomainError("Only the Chief Commissioner can cast the deciding vote.");
  const appeal = await loadTaa(appealId);
  const tally = tallyVotes(parseJson<string[]>(appeal.bench?.memberIds, []), appeal.votes);
  if (!tally.needsCasting) throw new DomainError("A casting vote is needed only when every member has voted and the bench is evenly divided.");
  if (!tally.tie.includes(position as Position)) throw new DomainError(`The casting vote must choose between: ${tally.tie.map((p) => p.toLowerCase()).join(", ")}.`);
  await prisma.$transaction(async (tx) => {
    await tx.vote.create({ data: { appealId, memberId: actor.id, position, note: note || null, castOn: today, isCasting: true } });
    await audit(tx, today, { actor, action: "appeal.castingVote", entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo, details: { position, tie: tally.tie } });
    await notifyMany(tx, today, [appeal.bench?.presidingId], `The Chief Commissioner has cast the deciding vote on appeal ${appeal.appealNo}. The order can now be drafted.`, { channels: ["DASHBOARD"], entityType: "appeal", entityId: appealId, caseRef: appeal.appealNo });
  });
}
