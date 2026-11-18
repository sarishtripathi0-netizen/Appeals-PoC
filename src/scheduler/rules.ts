// Scheduler rules, run in this order every simulated day. Each rule is idempotent and returns how many records it changed.

import type { RuleContext } from "@/lib/context";
import { breachRule, deadlineReminderRule, draftLapseRule, escalationRule, replyOverdueRule } from "./appeal-rules";
import { penaltyRemindersJob, settleGrnsJob } from "@/services/penalties";
import { creditMissingJob, monthlyStatementJob, treasuryFeedJob } from "@/services/reconciliation";
import { directionRemindersJob, overdueJob, ticketDeadlineJob } from "@/services/recovery";
import { staffStatusJob } from "@/services/exceptions";
import { refreshDelayFlags } from "./delay-flags";

export type SchedulerRule = { name: string; run: (ctx: RuleContext) => Promise<number> };

export const RULES: SchedulerRule[] = [
  { name: "Time limit passed (held, appeal drafted)", run: breachRule },
  { name: "Draft appeal links expired", run: draftLapseRule },
  { name: "Deadlines missed (moved up or back to the Commission)", run: escalationRule },
  { name: "DPS replies overdue", run: replyOverdueRule },
  { name: "Deadline reminders", run: deadlineReminderRule },
  // Penalty payment and recovery (PLAN.md Part 2, §P5)
  { name: "eGRAS receipts settled", run: settleGrnsJob },
  { name: "Penalty reminders", run: penaltyRemindersJob },
  { name: "Penalties past the last date", run: overdueJob },
  { name: "Recovery Direction reminders", run: directionRemindersJob },
  { name: "Retirements and changes in staff records", run: staffStatusJob },
  { name: "Treasury credits received", run: treasuryFeedJob },
  { name: "Credits missing or escalated", run: creditMissingJob },
  { name: "Recovery tickets past their deadline", run: ticketDeadlineJob },
  { name: "Monthly penalty statement", run: monthlyStatementJob },
  { name: "Repeated-delay flags", run: refreshDelayFlags },
];
