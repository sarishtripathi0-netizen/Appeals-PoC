// Every status flow in the POC, with its guards, in one place.
// Services call `decide(...)` before changing a status; the server never trusts the UI to hide buttons.

export type Role =
  | "CITIZEN" | "DPS" | "LINK_OFFICER" | "FAA" | "SAA" | "REGISTRAR" | "COMMISSIONER"
  | "CHIEF_COMMISSIONER" | "HEAD_OF_OFFICE" | "CALL_CENTRE" | "ADMIN" | "SYSTEM"
  | "DEALING_ASSISTANT" | "SEWA_SETU_DDO" | "FINANCE_NODAL" | "FINANCE_SENIOR" | "COMPETENT_AUTHORITY";

type Guard<C> = (ctx: C) => string | null;

export type Transition<S extends string, E extends string, C> = {
  from: S[];
  event: E;
  to: S | ((ctx: C) => S);
  roles: Role[];
  guard?: Guard<C>;
  /** Marks refusals that must be reported (e.g. attempts to close a held application). */
  refusalCode?: string;
};

export type Machine<S extends string, E extends string, C> = {
  name: string;
  label: string;
  statusLabels: Record<S, string>;
  transitions: Transition<S, E, C>[];
};

export type Decision<S> =
  | { ok: true; to: S }
  | { ok: false; reason: string; refusalCode?: string };

export function decide<S extends string, E extends string, C>(m: Machine<S, E, C>, from: S, event: E, role: Role, ctx: C): Decision<S> {
  const candidates = m.transitions.filter((t) => t.event === event && t.from.includes(from));
  if (candidates.length === 0)
    return { ok: false, reason: `This action is not available while the ${m.label} is "${m.statusLabels[from] ?? from}".` };
  const byRole = candidates.filter((t) => t.roles.includes(role));
  if (byRole.length === 0) return { ok: false, reason: "Your role cannot take this action." };
  let lastRefusal: Decision<S> | null = null;
  for (const t of byRole) {
    const msg = t.guard?.(ctx) ?? null;
    if (msg) {
      lastRefusal = { ok: false, reason: msg, refusalCode: t.refusalCode };
      continue;
    }
    return { ok: true, to: typeof t.to === "function" ? t.to(ctx) : t.to };
  }
  return lastRefusal!;
}

export function availableEvents<S extends string, E extends string, C>(m: Machine<S, E, C>, from: S, role: Role): E[] {
  return [...new Set(m.transitions.filter((t) => t.from.includes(from) && t.roles.includes(role)).map((t) => t.event))];
}

const needText = (v: string | null | undefined, min = 5) => !!v && v.trim().length >= min;

// ---------------- Application ----------------

export type ApplicationStatus =
  | "DRAFT" | "IN_PROGRESS" | "AWAITING_CITIZEN" | "HELD" | "DELIVERED" | "DELIVERED_CONFIRMED" | "REJECTED" | "CLOSED";

export type ApplicationEvent =
  | "submit" | "raiseQuery" | "respondQuery" | "deliver" | "reject" | "close" | "breach" | "release" | "confirm" | "setAside";

export type ApplicationCtx = {
  docsComplete?: boolean;
  isCurrentHolder?: boolean;
  reasons?: string | null;
  queryCount?: number;
  secondQueryReason?: string | null;
  queryItems?: string[];
  deliveryRef?: string | null;
  appealPossibleOrOpen?: boolean;
  filingWindowOpen?: boolean;
  /** Most reverts a service allows (notified); when set, the second one needs no recorded reason. */
  maxQueries?: number | null;
  /** An internal step (the Dealing Assistant's document check) still pending; the DPS cannot issue or reject until it is done. */
  stageWaiting?: string | null;
};

const HELD_MESSAGE =
  "This application is on hold because an appeal may be filed or is open. It cannot be closed or rejected now. You can still deliver the service.";

const holderOnly: Guard<ApplicationCtx> = (c) => (c.isCurrentHolder === false ? "This application is not in your worklist today." : null);

export const applicationMachine: Machine<ApplicationStatus, ApplicationEvent, ApplicationCtx> = {
  name: "application",
  label: "application",
  statusLabels: {
    DRAFT: "Saved, not submitted",
    IN_PROGRESS: "In progress",
    AWAITING_CITIZEN: "Waiting for information from the citizen",
    HELD: "On hold: time limit passed",
    DELIVERED: "Service delivered",
    DELIVERED_CONFIRMED: "Delivered and received",
    REJECTED: "Rejected",
    CLOSED: "Closed",
  },
  transitions: [
    { from: ["DRAFT"], event: "submit", to: "IN_PROGRESS", roles: ["CITIZEN", "CALL_CENTRE"], guard: (c) => (c.docsComplete ? null : "Please attach every required document before submitting. The time limit starts only when the application is complete.") },
    {
      from: ["IN_PROGRESS"], event: "raiseQuery", to: "AWAITING_CITIZEN", roles: ["DPS", "LINK_OFFICER", "DEALING_ASSISTANT"],
      guard: (c) =>
        holderOnly(c) ??
        (!c.queryItems?.length ? "List everything you need from the citizen in this one request." : null) ??
        (c.maxQueries != null && (c.queryCount ?? 0) >= c.maxQueries ? `This application has already been reverted ${c.maxQueries} times, the most the notification allows. Decide on the record.` : null) ??
        (c.maxQueries == null && (c.queryCount ?? 0) >= 1 && !needText(c.secondQueryReason) ? "A second request for information needs a recorded reason. All questions should normally go in one request." : null),
    },
    { from: ["AWAITING_CITIZEN"], event: "respondQuery", to: "IN_PROGRESS", roles: ["CITIZEN", "CALL_CENTRE"] },
    { from: ["IN_PROGRESS", "AWAITING_CITIZEN", "HELD"], event: "deliver", to: "DELIVERED", roles: ["DPS", "LINK_OFFICER"], guard: (c) => holderOnly(c) ?? c.stageWaiting ?? (needText(c.deliveryRef, 3) ? null : "Please enter the certificate or document reference.") },
    { from: ["IN_PROGRESS", "AWAITING_CITIZEN"], event: "reject", to: "REJECTED", roles: ["DPS", "LINK_OFFICER"], guard: (c) => holderOnly(c) ?? c.stageWaiting ?? (needText(c.reasons, 10) ? null : "Please give the reasons for rejection. The citizen will see them.") },
    { from: ["HELD"], event: "reject", to: "REJECTED", roles: ["DPS", "LINK_OFFICER"], guard: () => HELD_MESSAGE, refusalCode: "HELD_CLOSE_ATTEMPT" },
    { from: ["IN_PROGRESS", "AWAITING_CITIZEN"], event: "close", to: "CLOSED", roles: ["DPS", "LINK_OFFICER"], guard: (c) => holderOnly(c) ?? (needText(c.reasons, 10) ? null : "Please record why the application is being closed.") },
    { from: ["HELD"], event: "close", to: "CLOSED", roles: ["DPS", "LINK_OFFICER"], guard: () => HELD_MESSAGE, refusalCode: "HELD_CLOSE_ATTEMPT" },
    { from: ["IN_PROGRESS"], event: "breach", to: "HELD", roles: ["SYSTEM"] },
    { from: ["HELD"], event: "release", to: "IN_PROGRESS", roles: ["SYSTEM"] },
    {
      from: ["HELD"], event: "release", to: "IN_PROGRESS", roles: ["HEAD_OF_OFFICE"],
      guard: (c) => (c.appealPossibleOrOpen ? "The citizen can still appeal, or an appeal is open, so the application stays on hold." : null) ?? (needText(c.reasons) ? null : "Please record the reason for releasing the application."),
    },
    { from: ["DELIVERED"], event: "confirm", to: "DELIVERED_CONFIRMED", roles: ["CITIZEN", "CALL_CENTRE", "SYSTEM"] },
    // An order setting the rejection aside puts the application back on hold until it is delivered.
    { from: ["REJECTED"], event: "setAside", to: "HELD", roles: ["SYSTEM"] },
  ],
};

// ---------------- Appeal ----------------

export type AppealStatus =
  | "DRAFT" | "DECLINED" | "LAPSED" | "FILED_LATE" | "SCRUTINY" | "RETURNED" | "UNDER_REVIEW" | "HEARING_SCHEDULED"
  | "ORDER_DRAFTED" | "AWAITING_AUTHENTICATION" | "COMPLIANCE" | "AWAITING_CONFIRMATION" | "CLOSED" | "ESCALATED";

export type AppealEvent =
  | "file" | "decline" | "lapse" | "acceptLate" | "refuseLate" | "admit" | "return" | "rejectScrutiny" | "refile"
  | "scheduleHearing" | "recordHearing" | "draftOrder" | "editOrder" | "sign" | "authenticate" | "deliveryRecorded" | "confirm"
  | "dispute" | "directionMissed" | "escalate" | "extend" | "reopenOnRemand" | "remandMissed";

export type AppealCtx = {
  currentStatus?: AppealStatus;
  level?: "FAA" | "SAA" | "TAA";
  isLate?: boolean;
  lateReason?: string | null;
  windowNotAllowedMessage?: string | null;
  isAuthority?: boolean;
  reasons?: string | null;
  hasDirection?: boolean;
  penaltyDecided?: boolean;
  penaltyError?: string | null;
  noticeError?: string | null;
  inPersonError?: string | null;
  extensionError?: string | null;
  votesComplete?: boolean;
  liveAppealExists?: boolean;
  serviceDelivered?: boolean;
};

const authorityOnly: Guard<AppealCtx> = (c) => (c.isAuthority === false ? "This appeal is not assigned to you." : null);

const afterFiling = (c: AppealCtx): AppealStatus => (c.isLate && c.level !== "TAA" ? "FILED_LATE" : c.level === "TAA" ? "SCRUTINY" : "UNDER_REVIEW");
const afterDecision = (c: AppealCtx): AppealStatus => (c.hasDirection ? "COMPLIANCE" : "CLOSED");

export const appealMachine: Machine<AppealStatus, AppealEvent, AppealCtx> = {
  name: "appeal",
  label: "appeal",
  statusLabels: {
    DRAFT: "Draft ready for the citizen",
    DECLINED: "Declined by the citizen",
    LAPSED: "Draft link expired",
    FILED_LATE: "Filed late: reason awaiting decision",
    SCRUTINY: "With the Registrar for scrutiny",
    RETURNED: "Returned to the citizen for correction",
    UNDER_REVIEW: "Being considered",
    HEARING_SCHEDULED: "Hearing scheduled",
    ORDER_DRAFTED: "Order being prepared",
    AWAITING_AUTHENTICATION: "Order signed, awaiting authentication by the Registrar",
    COMPLIANCE: "Order issued: waiting for delivery",
    AWAITING_CONFIRMATION: "Delivered: waiting for the citizen to confirm",
    CLOSED: "Closed",
    ESCALATED: "Moved to the next level (deadline missed)",
  },
  transitions: [
    {
      from: ["DRAFT", "LAPSED", "DECLINED"], event: "file", to: afterFiling, roles: ["CITIZEN", "CALL_CENTRE"],
      guard: (c) => c.liveAppealExists ? "An appeal at this level is already open for this application." : c.windowNotAllowedMessage ?? (c.isLate && !needText(c.lateReason, 10) ? "The filing window has passed. Please explain why the appeal is late." : null),
    },
    { from: ["DRAFT"], event: "decline", to: "DECLINED", roles: ["CITIZEN", "CALL_CENTRE"] },
    { from: ["DRAFT"], event: "lapse", to: "LAPSED", roles: ["SYSTEM"] },
    { from: ["FILED_LATE"], event: "acceptLate", to: "UNDER_REVIEW", roles: ["FAA", "SAA"], guard: authorityOnly },
    { from: ["FILED_LATE"], event: "refuseLate", to: "CLOSED", roles: ["FAA", "SAA"], guard: (c) => authorityOnly(c) ?? (needText(c.reasons, 10) ? null : "Please give reasons for not accepting the late appeal.") },
    { from: ["SCRUTINY"], event: "admit", to: "UNDER_REVIEW", roles: ["REGISTRAR"] },
    { from: ["SCRUTINY"], event: "return", to: "RETURNED", roles: ["REGISTRAR"], guard: (c) => (needText(c.reasons) ? null : "Please say what the citizen needs to correct.") },
    { from: ["SCRUTINY"], event: "rejectScrutiny", to: "CLOSED", roles: ["REGISTRAR"], guard: (c) => (needText(c.reasons, 10) ? null : "Please give reasons for not admitting the appeal.") },
    { from: ["RETURNED"], event: "refile", to: "SCRUTINY", roles: ["CITIZEN", "CALL_CENTRE"] },
    { from: ["UNDER_REVIEW", "HEARING_SCHEDULED"], event: "scheduleHearing", to: "HEARING_SCHEDULED", roles: ["FAA", "SAA", "REGISTRAR"], guard: (c) => authorityOnly(c) ?? c.noticeError ?? c.inPersonError ?? null },
    { from: ["HEARING_SCHEDULED"], event: "recordHearing", to: "UNDER_REVIEW", roles: ["FAA", "SAA", "COMMISSIONER", "CHIEF_COMMISSIONER"], guard: authorityOnly },
    { from: ["UNDER_REVIEW", "HEARING_SCHEDULED"], event: "draftOrder", to: "ORDER_DRAFTED", roles: ["FAA", "SAA", "COMMISSIONER", "CHIEF_COMMISSIONER"], guard: (c) => authorityOnly(c) ?? (c.level === "TAA" && !c.votesComplete ? "Every bench member must vote before the order is drafted." : null) },
    { from: ["ORDER_DRAFTED"], event: "editOrder", to: "ORDER_DRAFTED", roles: ["FAA", "SAA", "COMMISSIONER", "CHIEF_COMMISSIONER"], guard: authorityOnly },
    {
      from: ["ORDER_DRAFTED"], event: "sign", to: (c) => (c.level === "TAA" ? "AWAITING_AUTHENTICATION" : afterDecision(c)), roles: ["FAA", "SAA", "COMMISSIONER", "CHIEF_COMMISSIONER"],
      guard: (c) => authorityOnly(c) ?? (needText(c.reasons, 20) ? null : "An order cannot be issued without reasons.") ?? c.penaltyError ?? (c.penaltyDecided ? null : "Please decide on a penalty: impose one, or record why none is imposed."),
    },
    { from: ["AWAITING_AUTHENTICATION"], event: "authenticate", to: afterDecision, roles: ["REGISTRAR"] },
    { from: ["COMPLIANCE"], event: "deliveryRecorded", to: "AWAITING_CONFIRMATION", roles: ["DPS", "LINK_OFFICER"] },
    { from: ["AWAITING_CONFIRMATION"], event: "confirm", to: "CLOSED", roles: ["CITIZEN", "CALL_CENTRE"] },
    { from: ["AWAITING_CONFIRMATION"], event: "dispute", to: "UNDER_REVIEW", roles: ["CITIZEN", "CALL_CENTRE"], guard: (c) => (needText(c.reasons) ? null : "Please tell us what is wrong with the delivery.") },
    { from: ["COMPLIANCE"], event: "directionMissed", to: "UNDER_REVIEW", roles: ["SYSTEM"] },
    { from: ["UNDER_REVIEW", "HEARING_SCHEDULED", "ORDER_DRAFTED", "FILED_LATE"], event: "escalate", to: "ESCALATED", roles: ["SYSTEM"], guard: (c) => (c.level === "TAA" ? "The Commission's time is a target; its appeals are not moved." : null) },
    { from: ["UNDER_REVIEW", "HEARING_SCHEDULED"], event: "extend", to: (c) => c.currentStatus ?? "UNDER_REVIEW", roles: ["SAA"], guard: (c) => authorityOnly(c) ?? (c.level !== "SAA" ? "Only a second appeal can be extended." : c.extensionError ?? null) },
    { from: ["CLOSED", "ESCALATED", "COMPLIANCE", "UNDER_REVIEW"], event: "reopenOnRemand", to: "UNDER_REVIEW", roles: ["SYSTEM"] },
    { from: ["UNDER_REVIEW", "HEARING_SCHEDULED", "ORDER_DRAFTED"], event: "remandMissed", to: "ESCALATED", roles: ["SYSTEM"] },
  ],
};

// ---------------- Smaller machines ----------------

export type HearingStatus = "SCHEDULED" | "HELD" | "ADJOURNED" | "CANCELLED";
export const hearingMachine: Machine<HearingStatus, "hold" | "adjourn" | "cancel", { isAuthority?: boolean }> = {
  name: "hearing",
  label: "hearing",
  statusLabels: { SCHEDULED: "Scheduled", HELD: "Held", ADJOURNED: "Adjourned", CANCELLED: "Cancelled" },
  transitions: [
    { from: ["SCHEDULED"], event: "hold", to: "HELD", roles: ["FAA", "SAA", "COMMISSIONER", "CHIEF_COMMISSIONER"], guard: (c) => (c.isAuthority === false ? "This hearing is not yours." : null) },
    { from: ["SCHEDULED"], event: "adjourn", to: "ADJOURNED", roles: ["FAA", "SAA", "COMMISSIONER", "CHIEF_COMMISSIONER", "REGISTRAR"] },
    { from: ["SCHEDULED"], event: "cancel", to: "CANCELLED", roles: ["FAA", "SAA", "REGISTRAR", "SYSTEM"] },
  ],
};

export type DirectionStatus = "OPEN" | "MET" | "MISSED" | "SUPERSEDED";
export const directionMachine: Machine<DirectionStatus, "meet" | "miss" | "supersede", { deliveryRef?: string | null }> = {
  name: "direction",
  label: "direction",
  statusLabels: { OPEN: "Open", MET: "Complied with", MISSED: "Not complied with in time", SUPERSEDED: "Replaced by a later order" },
  transitions: [
    { from: ["OPEN", "MISSED"], event: "meet", to: "MET", roles: ["DPS", "LINK_OFFICER", "FAA", "SAA"], guard: (c) => (needText(c.deliveryRef, 3) ? null : "Please enter the certificate or document reference.") },
    { from: ["OPEN"], event: "miss", to: "MISSED", roles: ["SYSTEM"] },
    { from: ["OPEN", "MISSED"], event: "supersede", to: "SUPERSEDED", roles: ["SYSTEM"] },
  ],
};

export type OrderStatus = "DRAFT" | "SIGNED" | "AUTHENTICATED";
