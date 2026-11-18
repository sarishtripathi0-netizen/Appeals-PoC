// The penalty state machine (PLAN.md Part 2, §P4): every status, transition, role and guard in one module.
// Services call `decide(penaltyMachine, ...)`; the server never relies on the screen hiding a button.

import { decide, type Machine } from "./state-machines";

export type PenaltyStatus =
  | "RAISED" | "OVERDUE" | "PAID_EGRAS" | "UNPAID_CONFIRMED" | "IN_RECOVERY" | "PARTLY_DEDUCTED" | "DEDUCTED" | "RECOVERED"
  | "CREDIT_CONFIRMED" | "CLOSED" | "STAYED" | "REDUCED" | "SET_ASIDE" | "REFUND_DUE" | "REFUNDED" | "EXCEPTION"
  | "WRITE_OFF_REQUESTED" | "WRITTEN_OFF" | "CREDIT_MISSING" | "ESCALATED";

export type PenaltyEvent =
  | "settlePaid" | "close" | "dueDatePassed" | "confirmUnpaid" | "addToTicket" | "routeToException" | "recordDeduction"
  | "verifyDeduction" | "returnDeduction" | "creditsMatched" | "creditWindowPassed" | "escalationPeriodPassed" | "stay" | "liftStay"
  | "reduce" | "setAside" | "resume" | "refundDue" | "recordRefund" | "afterRefund" | "officerStatusChanged" | "resolveAndResume"
  | "recordManualRecovery" | "requestWriteOff" | "approveWriteOff" | "rejectWriteOff";

export type PenaltyCtx = {
  /** Amount still to be paid or recovered. */
  outstanding?: number;
  /** Amount collected over what is due (refund needed). */
  excess?: number;
  grnPending?: boolean;
  directionInPlace?: boolean;
  /** Why the penalty cannot go on a normal ticket (payroll type, officer status, staff record), if any. */
  routingProblem?: string | null;
  isAssignee?: boolean;
  /** Problems with a deduction entry (missing reference, proof, amount over the balance). */
  deductionError?: string | null;
  /** Balance after this deduction (0 means fully deducted). */
  outstandingAfter?: number;
  proofError?: string | null;
  verifiedAll?: boolean;
  reason?: string | null;
  orderRef?: string | null;
  documentName?: string | null;
  newAmount?: number;
  currentAmount?: number;
  /** The imposing authority or a higher appellate authority recording a review. */
  isReviewingAuthority?: boolean;
  priorStatus?: PenaltyStatus | null;
  nextStatus?: PenaltyStatus | null;
  reference?: string | null;
  isCompetentAuthority?: boolean;
  manualRecoveryError?: string | null;
};

/** Penalties that are still being paid or recovered. */
export const ACTIVE: PenaltyStatus[] = ["RAISED", "OVERDUE", "UNPAID_CONFIRMED", "IN_RECOVERY", "PARTLY_DEDUCTED"];
export const FINAL: PenaltyStatus[] = ["CLOSED", "WRITTEN_OFF", "SET_ASIDE"];
const NOT_FINAL: PenaltyStatus[] = [
  "RAISED", "OVERDUE", "PAID_EGRAS", "UNPAID_CONFIRMED", "IN_RECOVERY", "PARTLY_DEDUCTED", "DEDUCTED", "RECOVERED", "CREDIT_CONFIRMED",
  "STAYED", "REFUND_DUE", "REFUNDED", "EXCEPTION", "WRITE_OFF_REQUESTED", "CREDIT_MISSING", "ESCALATED",
];
const RECORDERS = ["SEWA_SETU_DDO", "REGISTRAR", "COMMISSIONER", "CHIEF_COMMISSIONER"] as const;
const REVIEWERS = [...RECORDERS, "FAA", "SAA"] as const;

const needText = (v: string | null | undefined, min = 5) => !!v && v.trim().length >= min;
const orderDocs = (c: PenaltyCtx) =>
  !needText(c.orderRef, 3) ? "Please enter the reference of the order." : !needText(c.documentName, 3) ? "Please attach a copy of the order." : null;
const reviewer = (c: PenaltyCtx, role: string) =>
  (role === "FAA" || role === "SAA") && !c.isReviewingAuthority ? "Only the imposing authority or a higher authority can record a review of this penalty." : null;

export const penaltyMachine: Machine<PenaltyStatus, PenaltyEvent, PenaltyCtx & { role?: string }> = {
  name: "penalty",
  label: "penalty",
  statusLabels: {
    RAISED: "Penalty imposed: payment due",
    OVERDUE: "Last date passed: checking for payment",
    PAID_EGRAS: "Paid through eGRAS",
    UNPAID_CONFIRMED: "Penalty not yet paid; recovery from salary will follow",
    IN_RECOVERY: "With Finance for recovery from salary",
    PARTLY_DEDUCTED: "Partly deducted from salary",
    DEDUCTED: "Deducted from salary: being verified",
    RECOVERED: "Recovered: awaiting credit to the head of account",
    CREDIT_CONFIRMED: "Credit to the head of account confirmed",
    CLOSED: "Closed",
    STAYED: "Stayed by order",
    REDUCED: "Reduced by order",
    SET_ASIDE: "Set aside by order",
    REFUND_DUE: "Refund due to the officer",
    REFUNDED: "Refunded to the officer",
    EXCEPTION: "Needs handling by the Sewa Setu DDO",
    WRITE_OFF_REQUESTED: "Write-off requested",
    WRITTEN_OFF: "Written off",
    CREDIT_MISSING: "Deducted, but credit to the head of account not yet seen",
    ESCALATED: "Credit not seen: escalated to Finance",
  },
  transitions: [
    // ---- Main route ----
    { from: ["RAISED", "OVERDUE", "UNPAID_CONFIRMED", "IN_RECOVERY", "PARTLY_DEDUCTED", "EXCEPTION", "STAYED"], event: "settlePaid", to: "PAID_EGRAS", roles: ["SYSTEM"], guard: (c) => (c.outstanding === 0 && !c.excess ? null : "Not fully paid.") },
    { from: ["PAID_EGRAS", "CREDIT_CONFIRMED"], event: "close", to: "CLOSED", roles: ["SYSTEM"], guard: (c) => (c.excess ? "More was collected than is due: a refund is needed first." : null) },
    { from: ["RAISED"], event: "dueDatePassed", to: "OVERDUE", roles: ["SYSTEM"], guard: (c) => ((c.outstanding ?? 0) > 0 ? null : "Nothing is outstanding.") },
    {
      from: ["OVERDUE"], event: "confirmUnpaid", to: "UNPAID_CONFIRMED", roles: ["SEWA_SETU_DDO"],
      guard: (c) => (c.grnPending ? "A payment through eGRAS is still being confirmed (receipt pending). Please wait until it settles." : null) ?? ((c.outstanding ?? 0) > 0 ? null : "Nothing is outstanding."),
    },
    {
      from: ["UNPAID_CONFIRMED"], event: "addToTicket", to: "IN_RECOVERY", roles: ["SYSTEM"],
      guard: (c) => (!c.directionInPlace ? "No recovery ticket can be sent until a Recovery Direction is in place." : null) ?? c.routingProblem ?? null,
    },
    { from: ["UNPAID_CONFIRMED", "IN_RECOVERY", "PARTLY_DEDUCTED"], event: "routeToException", to: "EXCEPTION", roles: ["SYSTEM"], guard: (c) => (c.routingProblem ? null : "No reason to route this penalty to the exceptions queue.") },
    {
      from: ["IN_RECOVERY", "PARTLY_DEDUCTED"], event: "recordDeduction", to: (c) => ((c.outstandingAfter ?? 1) === 0 ? "DEDUCTED" : "PARTLY_DEDUCTED"), roles: ["FINANCE_NODAL"],
      guard: (c) => (c.isAssignee === false ? "This ticket is not assigned to you." : null) ?? c.deductionError ?? null,
    },
    {
      from: ["PARTLY_DEDUCTED", "DEDUCTED"], event: "verifyDeduction", to: (c) => (c.verifiedAll ? "RECOVERED" : (c.priorStatus as PenaltyStatus) ?? "PARTLY_DEDUCTED"), roles: ["SEWA_SETU_DDO"],
      guard: (c) => c.proofError ?? null,
    },
    { from: ["PARTLY_DEDUCTED", "DEDUCTED"], event: "returnDeduction", to: (c) => (c.priorStatus as PenaltyStatus) ?? "PARTLY_DEDUCTED", roles: ["SEWA_SETU_DDO"], guard: (c) => (needText(c.reason) ? null : "Please say what is wrong with the deduction entry.") },
    { from: ["RECOVERED", "CREDIT_MISSING", "ESCALATED"], event: "creditsMatched", to: "CREDIT_CONFIRMED", roles: ["SYSTEM"] },
    { from: ["RECOVERED"], event: "creditWindowPassed", to: "CREDIT_MISSING", roles: ["SYSTEM"] },
    { from: ["CREDIT_MISSING"], event: "escalationPeriodPassed", to: "ESCALATED", roles: ["SYSTEM"] },

    // ---- Stay, reduction, set-aside, refund ----
    { from: ACTIVE, event: "stay", to: "STAYED", roles: [...RECORDERS], guard: orderDocs },
    { from: ["STAYED"], event: "liftStay", to: (c) => (c.priorStatus as PenaltyStatus) ?? "RAISED", roles: [...RECORDERS], guard: orderDocs },
    {
      from: NOT_FINAL, event: "reduce", to: "REDUCED", roles: [...REVIEWERS],
      guard: (c) => reviewer(c, c.role ?? "") ?? orderDocs(c) ??
        (c.newAmount == null || !Number.isInteger(c.newAmount) || c.newAmount <= 0 ? "Enter the reduced amount in whole rupees (to cancel the penalty, set it aside instead)." : null) ??
        (c.newAmount! >= (c.currentAmount ?? 0) ? "A review can only lower the penalty." : null),
    },
    { from: ["REDUCED"], event: "resume", to: (c) => (c.nextStatus as PenaltyStatus) ?? "RAISED", roles: ["SYSTEM"] },
    { from: [...NOT_FINAL, "CLOSED"], event: "setAside", to: "SET_ASIDE", roles: [...REVIEWERS], guard: (c) => reviewer(c, c.role ?? "") ?? orderDocs(c) },
    { from: [...NOT_FINAL, "CLOSED", "REDUCED", "SET_ASIDE"], event: "refundDue", to: "REFUND_DUE", roles: ["SYSTEM"], guard: (c) => ((c.excess ?? 0) > 0 ? null : "Nothing to refund.") },
    { from: ["REFUND_DUE"], event: "recordRefund", to: "REFUNDED", roles: ["FINANCE_NODAL"], guard: (c) => (needText(c.reference, 3) ? null : "Please enter the refund reference.") },
    { from: ["REFUNDED"], event: "afterRefund", to: (c) => (c.nextStatus as PenaltyStatus) ?? "CLOSED", roles: ["SYSTEM"] },

    // ---- Exceptions and write-off ----
    { from: ["IN_RECOVERY", "PARTLY_DEDUCTED"], event: "officerStatusChanged", to: "EXCEPTION", roles: ["SYSTEM"], guard: (c) => (c.routingProblem ? null : "No change that needs handling.") },
    { from: ["EXCEPTION"], event: "resolveAndResume", to: "UNPAID_CONFIRMED", roles: ["SEWA_SETU_DDO"], guard: (c) => (needText(c.reason) ? null : "Please record how the problem was resolved.") },
    { from: ["EXCEPTION"], event: "recordManualRecovery", to: "RECOVERED", roles: ["SEWA_SETU_DDO"], guard: (c) => c.manualRecoveryError ?? null },
    {
      from: ["EXCEPTION", "IN_RECOVERY", "PARTLY_DEDUCTED"], event: "requestWriteOff", to: "WRITE_OFF_REQUESTED", roles: ["SEWA_SETU_DDO"],
      guard: (c) => (needText(c.reason, 10) ? null : "Please give the reason the penalty cannot be recovered.") ?? ((c.outstanding ?? 0) > 0 ? null : "Nothing is outstanding."),
    },
    { from: ["WRITE_OFF_REQUESTED"], event: "approveWriteOff", to: "WRITTEN_OFF", roles: ["COMPETENT_AUTHORITY"], guard: (c) => (c.isCompetentAuthority ? null : "Only the officer's Competent Authority can approve a write-off.") },
    {
      from: ["WRITE_OFF_REQUESTED"], event: "rejectWriteOff", to: "EXCEPTION", roles: ["COMPETENT_AUTHORITY"],
      guard: (c) => (c.isCompetentAuthority ? null : "Only the officer's Competent Authority can decide on a write-off.") ?? (needText(c.reason) ? null : "Please give a reason."),
    },
  ],
};

/** `decide` for the penalty machine; the role is passed into the guards as well. */
export function decidePenalty(from: PenaltyStatus, event: PenaltyEvent, role: string, ctx: PenaltyCtx) {
  return decide(penaltyMachine, from, event, role as never, { ...ctx, role });
}
