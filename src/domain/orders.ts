// Order templates (AMS-53, 84) and the checks an order must pass before it is signed (AMS-55, 59–62, 85).

import { checkPenalty } from "./rules";
import type { Level, Settings } from "./settings";

export type TemplateCode = "ALLOW_DELIVER" | "SET_ASIDE_REJECTION" | "DISMISS" | "REMAND";
export type Outcome = "ALLOWED" | "DISMISSED" | "REJECTION_SET_ASIDE" | "REMANDED" | "LATE_NOT_CONDONED";
export type Position = "ALLOW" | "DISMISS" | "REMAND";

export type OrderTemplate = {
  code: TemplateCode;
  label: string;
  outcome: Outcome;
  /** The bench decision this template records (Commission orders must match the vote). */
  position: Position;
  grounds: ("DELAY" | "REJECTION")[];
  levels: Level[];
  directsDelivery: boolean;
  findings: string;
  reasons: string;
};

export const ORDER_TEMPLATES: OrderTemplate[] = [
  {
    code: "ALLOW_DELIVER",
    label: "Allow the appeal and direct delivery",
    outcome: "ALLOWED",
    position: "ALLOW",
    grounds: ["DELAY"],
    levels: ["FAA", "SAA", "TAA"],
    directsDelivery: true,
    findings: "The application was complete on the date of the Unique Identification Number. The service was not delivered within the notified time limit. ",
    reasons: "The Designated Public Servant has not shown sufficient and reasonable cause for the delay. ",
  },
  {
    code: "SET_ASIDE_REJECTION",
    label: "Set the rejection aside and direct delivery",
    outcome: "REJECTION_SET_ASIDE",
    position: "ALLOW",
    grounds: ["REJECTION"],
    levels: ["FAA", "SAA", "TAA"],
    directsDelivery: true,
    findings: "The application was rejected. On examining the record, ",
    reasons: "The reasons given for rejection are not supported by the record, because ",
  },
  {
    code: "DISMISS",
    label: "Dismiss the appeal",
    outcome: "DISMISSED",
    position: "DISMISS",
    grounds: ["DELAY", "REJECTION"],
    levels: ["FAA", "SAA", "TAA"],
    directsDelivery: false,
    findings: "On examining the record and hearing the parties, ",
    reasons: "The appeal is dismissed because ",
  },
  {
    code: "REMAND",
    label: "Send the case back to the lower authority (remand)",
    outcome: "REMANDED",
    position: "REMAND",
    grounds: ["DELAY", "REJECTION"],
    levels: ["TAA"],
    directsDelivery: false,
    findings: "The lower authority did not examine ",
    reasons: "The case needs a fresh decision by the lower authority because ",
  },
];

export function templateFor(code: string): OrderTemplate | undefined {
  return ORDER_TEMPLATES.find((t) => t.code === code);
}

export function templatesFor(level: Level, ground: string): OrderTemplate[] {
  return ORDER_TEMPLATES.filter((t) => t.levels.includes(level) && t.grounds.includes(ground as "DELAY"));
}

export type PenaltyLine = { officerId: string; capacity: string; amount: number };

export const penaltyKey = (officerId: string, capacity: string) => `${officerId}|${capacity}`;

/**
 * Checks each penalty against the range for the level and the officers the authority may choose from:
 * those in the responsibility ledger and, for the Commission, the authorities that missed a deadline.
 * `allowed` holds `officerId|capacity` keys.
 */
export function checkPenaltyPlan(level: Level, plan: PenaltyLine[], allowed: Set<string>, s: Settings): string | null {
  const seen = new Set<string>();
  for (const p of plan) {
    if (seen.has(p.officerId)) return "Each officer can be penalised only once in an order.";
    seen.add(p.officerId);
    if (!allowed.has(penaltyKey(p.officerId, p.capacity)))
      return p.capacity === "FAA" || p.capacity === "SAA"
        ? "An appellate authority can be penalised only by the Commission, and only for a deadline it missed."
        : "The penalty must fall on an officer who held the case during the delay (see the responsibility ledger).";
    const err = checkPenalty(level, p.capacity, p.amount, s);
    if (err) return err;
  }
  return null;
}

export function penaltyDecided(plan: PenaltyLine[], noPenaltyReason: string | null | undefined): boolean {
  return plan.length > 0 || (!!noPenaltyReason && noPenaltyReason.trim().length >= 10);
}
