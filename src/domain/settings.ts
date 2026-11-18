// Rules held as settings (AMS-127) and the open-point switches (AMS-128).
// Defaults here are used by the seed and as a fallback when a key is missing.

import type { DayBasis } from "./calendar";

export type Level = "FAA" | "SAA" | "TAA";
export type PenaltyTarget = "DPS" | "FAA" | "SAA";
export type Range = [number, number];

export type Settings = {
  faaDecisionDays: number;
  saaDecisionDays: number;
  saaMaxExtendedDays: number;
  commissionTargetDays: number;
  remandDays: number;
  defaultDirectionDays: number;
  replyDays: number;
  appealDecisionBasis: DayBasis;
  directionBasis: DayBasis;
  firstAppealWindowDays: number;
  secondAppealWindowDays: number;
  thirdAppealWindowDays: number;
  thirdAppealHardCapDays: number;
  windowBasis: DayBasis;
  draftLinkValidityDays: 30 | 45;
  draftOnRejection: boolean;
  escalationMode: "NEXT_LEVEL" | "STRAIGHT_TO_COMMISSION";
  onDeclineOrLapse: "HOLD_FLAG_HOO" | "RELEASE_TO_DPS";
  hearingNoticeClearDays: number;
  penaltyRanges: Record<Level, Partial<Record<PenaltyTarget, Range>>>;
  paymentPeriodDays: number;
  paymentBasis: DayBasis;
  reminderDays: number[];
  egrasSettlementLagDays: number;
  settlementWaitDays: number;
  recoveryDirectionMode: "STANDING" | "PER_CASE";
  standingOrderRef: string;
  centralRecoveryNotificationRef: string;
  instalmentThreshold: number;
  maxInstalments: number;
  nodalGraceDays: number;
  creditWindowDays: number;
  creditEscalationDays: number;
  pensionRecovery: boolean;
  retirementAlertMonths: number;
  treasuryCreditLagDays: number;
  headOfAccount: string;
  repeatedDelayThreshold: number;
  repeatedDelayWindowDays: number;
  repeatedDelayMinCases: number;
  bulkDisposalThreshold: number;
  reminderFractions: number[];
  reminderDaysBefore: number;
  offSaturdays: number[];
  confirmationFollowUpDays: number;
};

export type SettingDef = {
  key: keyof Settings;
  category: "Time limits" | "Filing windows" | "Open points (switches)" | "Hearings" | "Penalty payment and recovery" | "Flags and reminders" | "Calendar";
  label: string;
  description: string;
  isSwitch?: boolean;
  options?: { value: unknown; label: string }[];
  kind: "number" | "basis" | "option" | "json" | "text";
};

export const DEFAULT_SETTINGS: Settings = {
  faaDecisionDays: 30,
  saaDecisionDays: 60,
  saaMaxExtendedDays: 75,
  commissionTargetDays: 90,
  remandDays: 15,
  defaultDirectionDays: 15,
  replyDays: 5,
  appealDecisionBasis: "WORKING",
  directionBasis: "WORKING",
  firstAppealWindowDays: 45,
  secondAppealWindowDays: 60,
  thirdAppealWindowDays: 90,
  thirdAppealHardCapDays: 120,
  windowBasis: "CALENDAR",
  draftLinkValidityDays: 30,
  draftOnRejection: false,
  escalationMode: "NEXT_LEVEL",
  onDeclineOrLapse: "HOLD_FLAG_HOO",
  hearingNoticeClearDays: 7,
  penaltyRanges: {
    FAA: { DPS: [100, 5000] },
    SAA: { DPS: [100, 7000] },
    TAA: { DPS: [100, 10000], FAA: [500, 5000], SAA: [1000, 5000] },
  },
  paymentPeriodDays: 30,
  paymentBasis: "CALENDAR",
  reminderDays: [20, 27],
  egrasSettlementLagDays: 1,
  settlementWaitDays: 3,
  recoveryDirectionMode: "STANDING",
  standingOrderRef: "Standing Recovery Direction No. ____ dated ____ (placeholder)",
  centralRecoveryNotificationRef: "Notification No. ____ dated ____ designating the Finance nodal officer and the Sewa Setu DDO for recovery of ARTPS penalties (placeholder)",
  instalmentThreshold: 10000,
  maxInstalments: 3,
  nodalGraceDays: 5,
  creditWindowDays: 15,
  creditEscalationDays: 7,
  pensionRecovery: false,
  retirementAlertMonths: 3,
  treasuryCreditLagDays: 5,
  headOfAccount: "0070-XX-XXX-XX (placeholder, to be confirmed by Finance)",
  repeatedDelayThreshold: 0.25,
  repeatedDelayWindowDays: 182,
  repeatedDelayMinCases: 4,
  bulkDisposalThreshold: 10,
  reminderFractions: [0.5, 0.8],
  reminderDaysBefore: 3,
  offSaturdays: [2, 4],
  confirmationFollowUpDays: 7,
};

const BASIS_OPTIONS = [
  { value: "WORKING", label: "Working days" },
  { value: "CALENDAR", label: "Calendar days" },
];

export const SETTING_DEFS: SettingDef[] = [
  { key: "draftLinkValidityDays", category: "Open points (switches)", kind: "option", isSwitch: true, label: "Draft appeal link validity", description: "How long the link to a draft first appeal stays open. 30 days follows Rule 8(1)(d); 45 days matches the first-appeal filing window.", options: [{ value: 30, label: "30 days (Rule 8(1)(d))" }, { value: 45, label: "45 days (match filing window)" }] },
  { key: "draftOnRejection", category: "Open points (switches)", kind: "option", isSwitch: true, label: "Draft an appeal when an application is rejected", description: "Off: the citizen starts the appeal. On: the portal prepares a draft for the citizen to file.", options: [{ value: false, label: "Off: citizen starts it" }, { value: true, label: "On: portal drafts it" }] },
  { key: "escalationMode", category: "Open points (switches)", kind: "option", isSwitch: true, label: "Where an appeal goes when an authority misses its deadline", description: "Next level: First Appellate Authority (FAA) to Second Appellate Authority (SAA), then to the Commission. Alternative: straight to the Commission (as in the earlier IGAMS FRS).", options: [{ value: "NEXT_LEVEL", label: "Next level" }, { value: "STRAIGHT_TO_COMMISSION", label: "Straight to Commission" }] },
  { key: "onDeclineOrLapse", category: "Open points (switches)", kind: "option", isSwitch: true, label: "If the citizen declines the draft or the link lapses", description: "Hold: the application stays on hold and is flagged to the Head of Office. Release: the application goes back to the Designated Public Servant (DPS).", options: [{ value: "HOLD_FLAG_HOO", label: "Stay on hold, flag to Head of Office" }, { value: "RELEASE_TO_DPS", label: "Release back to DPS" }] },

  { key: "faaDecisionDays", category: "Time limits", kind: "number", label: "First appeal: time to decide", description: "Days the First Appellate Authority (FAA) has to decide. Basis to be confirmed by the Department." },
  { key: "saaDecisionDays", category: "Time limits", kind: "number", label: "Second appeal: time to decide", description: "Days the Second Appellate Authority (SAA) has to decide." },
  { key: "saaMaxExtendedDays", category: "Time limits", kind: "number", label: "Second appeal: longest extended time", description: "The SAA may extend once, with a recorded reason, up to this many days in total." },
  { key: "commissionTargetDays", category: "Time limits", kind: "number", label: "Commission: target time", description: "Target only; not binding. Overdue cases are shown, not escalated." },
  { key: "remandDays", category: "Time limits", kind: "number", label: "Remand: time for the lower authority", description: "Days given to the authority a case is sent back to." },
  { key: "defaultDirectionDays", category: "Time limits", kind: "number", label: "Direction to deliver: default time", description: "Suggested time in an order directing delivery. The authority can change it." },
  { key: "replyDays", category: "Time limits", kind: "number", label: "DPS reply: time allowed", description: "Days the DPS has to reply to an appeal." },
  { key: "appealDecisionBasis", category: "Time limits", kind: "basis", label: "Count appeal deadlines in", description: "Applies to FAA, SAA, Commission and remand deadlines.", options: BASIS_OPTIONS },
  { key: "directionBasis", category: "Time limits", kind: "basis", label: "Count directions in", description: "Applies to directions to deliver.", options: BASIS_OPTIONS },

  { key: "firstAppealWindowDays", category: "Filing windows", kind: "number", label: "First appeal filing window", description: "From the date the time limit was missed, or the date of rejection." },
  { key: "secondAppealWindowDays", category: "Filing windows", kind: "number", label: "Second appeal filing window", description: "From the date of the FAA's order." },
  { key: "thirdAppealWindowDays", category: "Filing windows", kind: "number", label: "Third appeal filing window", description: "From the date of the SAA's order." },
  { key: "thirdAppealHardCapDays", category: "Filing windows", kind: "number", label: "Third appeal: never accepted after", description: "Late filing with a reason is possible until this limit only." },
  { key: "windowBasis", category: "Filing windows", kind: "basis", label: "Count filing windows in", description: "Calendar days by default.", options: BASIS_OPTIONS },

  { key: "hearingNoticeClearDays", category: "Hearings", kind: "number", label: "Hearing notice (clear working days)", description: "Shorter notice needs a recorded reason." },

  { key: "penaltyRanges", category: "Penalty payment and recovery", kind: "json", label: "Penalty ranges (Rs.), section 9", description: "Minimum and maximum by deciding level and the officer penalised." },
  { key: "paymentPeriodDays", category: "Penalty payment and recovery", kind: "number", label: "Time to pay through eGRAS", description: "Counted from deemed service (order on the dashboard and an SMS or email sent). In calendar days, a last date on a holiday moves to the next working day." },
  { key: "paymentBasis", category: "Penalty payment and recovery", kind: "basis", label: "Count the payment period in", description: "Calendar days by default.", options: BASIS_OPTIONS },
  { key: "reminderDays", category: "Penalty payment and recovery", kind: "json", label: "Reminder days", description: "Days after the service date on which the officer is reminded, e.g. [20, 27]." },
  { key: "egrasSettlementLagDays", category: "Penalty payment and recovery", kind: "number", label: "eGRAS settlement lag (working days)", description: "A payment receipt (GRN) is pending until then." },
  { key: "settlementWaitDays", category: "Penalty payment and recovery", kind: "number", label: "Settlement wait before confirming unpaid (working days)", description: "If a receipt is pending on the last date, the case waits this long before it can be confirmed unpaid." },
  { key: "recoveryDirectionMode", category: "Penalty payment and recovery", kind: "option", label: "Recovery Direction", description: "Standing: the standing order reference is attached automatically. Per case: the Competent Authority signs one for each penalty.", options: [{ value: "STANDING", label: "Standing order" }, { value: "PER_CASE", label: "Per case, signed by the Competent Authority" }] },
  { key: "standingOrderRef", category: "Penalty payment and recovery", kind: "text", label: "Standing order reference", description: "Attached to every recovery in standing mode." },
  { key: "centralRecoveryNotificationRef", category: "Penalty payment and recovery", kind: "text", label: "Government notification for central recovery", description: "Designates the Finance nodal officer and the Sewa Setu DDO (see PLAN.md, P-A1 on Rule 6(5))." },
  { key: "instalmentThreshold", category: "Penalty payment and recovery", kind: "number", label: "Instalment threshold (Rs.)", description: "A ticket total above this is recovered in monthly instalments." },
  { key: "maxInstalments", category: "Penalty payment and recovery", kind: "number", label: "Maximum instalments", description: "" },
  { key: "nodalGraceDays", category: "Penalty payment and recovery", kind: "number", label: "Nodal officer grace after pay date (working days)", description: "Salary is paid on the last working day of the month; the deduction must be recorded within this many working days." },
  { key: "creditWindowDays", category: "Penalty payment and recovery", kind: "number", label: "Credit confirmation window (days)", description: "A deduction not credited to the head of account within this time is marked credit missing." },
  { key: "creditEscalationDays", category: "Penalty payment and recovery", kind: "number", label: "Escalation after credit missing (days)", description: "Then it goes to the Finance senior officer and the Commission." },
  { key: "pensionRecovery", category: "Penalty payment and recovery", kind: "option", label: "Recovery from pension after retirement", description: "Off: retired officers go to the exceptions queue.", options: [{ value: false, label: "Off" }, { value: true, label: "On" }] },
  { key: "retirementAlertMonths", category: "Penalty payment and recovery", kind: "number", label: "Retirement alert (months before)", description: "Tickets of officers retiring within this time go to the front of the queue." },
  { key: "treasuryCreditLagDays", category: "Penalty payment and recovery", kind: "number", label: "Treasury credit lag (demo feed, days)", description: "How long after a deduction the mock treasury feed reports the credit." },
  { key: "headOfAccount", category: "Penalty payment and recovery", kind: "text", label: "Head of account", description: "Where penalties are credited. Never to the citizen." },

  { key: "repeatedDelayThreshold", category: "Flags and reminders", kind: "number", label: "Repeated delay: share of delayed cases", description: "A DPS is flagged at or above this share (0.25 = 25%)." },
  { key: "repeatedDelayWindowDays", category: "Flags and reminders", kind: "number", label: "Repeated delay: look-back period (days)", description: "182 days is about 6 months." },
  { key: "repeatedDelayMinCases", category: "Flags and reminders", kind: "number", label: "Repeated delay: minimum cases", description: "Officers with fewer cases in the period are not flagged." },
  { key: "bulkDisposalThreshold", category: "Flags and reminders", kind: "number", label: "Same-day disposals for review", description: "An authority disposing of this many appeals in one day is listed for review." },
  { key: "reminderFractions", category: "Flags and reminders", kind: "json", label: "Reminder points (share of time used)", description: "Reminders to the deciding authority, e.g. [0.5, 0.8]." },
  { key: "reminderDaysBefore", category: "Flags and reminders", kind: "number", label: "Final reminder (working days before deadline)", description: "" },
  { key: "confirmationFollowUpDays", category: "Flags and reminders", kind: "number", label: "Call-centre follow-up after delivery (days)", description: "If the citizen has not confirmed receipt by then, the case appears in the call-centre queue." },

  { key: "offSaturdays", category: "Calendar", kind: "json", label: "Saturdays that are holidays", description: "Which Saturdays of each month are off, e.g. [2, 4]. Sundays are always off." },
];

export function mergeSettings(stored: Record<string, unknown>): Settings {
  return { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings>) };
}
