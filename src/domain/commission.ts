// Commission benches and votes (AMS-79–82): majority decides; on a tie the Chief Commissioner casts the deciding vote.

import type { Position } from "./orders";

export type VoteRow = { memberId: string; position: string; isCasting: boolean; note?: string | null };

export type Tally = {
  complete: boolean;
  counts: Record<Position, number>;
  majority: Position | null;
  /** Positions tied at the top when every member has voted and none has a majority. */
  tie: Position[];
  needsCasting: boolean;
  decided: Position | null;
  /** Members who voted against the decision. */
  dissenters: VoteRow[];
};

export const POSITIONS: Position[] = ["ALLOW", "DISMISS", "REMAND"];

export function tallyVotes(memberIds: string[], votes: VoteRow[]): Tally {
  const regular = votes.filter((v) => !v.isCasting && memberIds.includes(v.memberId));
  const complete = memberIds.length > 0 && memberIds.every((id) => regular.some((v) => v.memberId === id));
  const counts = { ALLOW: 0, DISMISS: 0, REMAND: 0 } as Record<Position, number>;
  for (const v of regular) counts[v.position as Position]++;
  const max = Math.max(...POSITIONS.map((p) => counts[p]));
  const top = POSITIONS.filter((p) => counts[p] === max);
  const majority = complete && top.length === 1 && max > memberIds.length / 2 ? top[0] : null;
  const tie = complete && !majority ? top : [];
  const casting = votes.find((v) => v.isCasting);
  const decided = majority ?? (casting && tie.includes(casting.position as Position) ? (casting.position as Position) : null);
  return {
    complete,
    counts,
    majority,
    tie,
    needsCasting: complete && !majority && !decided,
    decided,
    dissenters: decided ? regular.filter((v) => v.position !== decided) : [],
  };
}

/** A bench has 1 or 3 members, all Commissioners, and the presiding member sits on it. */
export function checkBench(memberIds: string[], presidingId: string, commissionerIds: Set<string>): string | null {
  const unique = [...new Set(memberIds)];
  if (unique.length !== memberIds.length) return "Each Commissioner can sit on the bench only once.";
  if (unique.length !== 1 && unique.length !== 3) return "A bench has one or three members.";
  if (!unique.every((id) => commissionerIds.has(id))) return "Only Commissioners can sit on a bench.";
  if (!unique.includes(presidingId)) return "The presiding member must sit on the bench.";
  return null;
}
