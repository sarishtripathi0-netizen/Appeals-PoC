// Demo scenarios for the penalty module (brief, "Seed data and demo scenarios"). Each one reseeds the baseline,
// builds its starting point through the real services, and leaves the clock where the presenter should begin.
// Every penalty is imposed on the demo start date (Mon 2 Nov 2026), so its last date is Wed 2 Dec 2026.

import type { PrismaClient } from "@prisma/client";
import { addDays } from "@/domain/dates";
import { appealNumber } from "@/domain/numbering";
import { SYSTEM_ACTOR } from "@/lib/audit";
import { getRuleContext } from "@/lib/context";
import { advanceClockTo } from "@/scheduler";
import { dropCredit } from "@/services/reconciliation";
import { confirmUnpaid, recordDeduction, verifyDeduction } from "@/services/recovery";
import { imposePenalty } from "@/services/penalties";
import { demoCalendar, seedBaseline } from "./index";
import { stageApplication } from "./helpers";
import { DEMO_START } from "./masters";

export type Step = { text: string; userId?: string; href?: string };
export type Scenario = { id: number; title: string; covers: string; summary: string; steps: Step[]; stage: (db: PrismaClient) => Promise<void> };

const DDO = { id: "u-ss-ddo", name: "Sewa Setu DDO (demo set-up)", role: "SEWA_SETU_DDO" };
const NODAL = { id: "u-fin-nodal", name: "Finance nodal officer (demo set-up)", role: "FINANCE_NODAL" };

type Case = { officerId: string; amount: number; level: "FAA" | "SAA" | "TAA"; authorityId: string; capacity?: string };

/** A decided appeal with a signed order imposing the given penalties, on a fresh application (so each has its own UIN). */
async function stageOrder(db: PrismaClient, cases: Case[], citizenId = "u-cit-2") {
  const cal = demoCalendar();
  const level = cases[0].level;
  const app = await stageApplication(db, cal, { serviceCode: "INC", citizenId, district: "KMM", submittedOn: addDays(DEMO_START, -60), status: "DELIVERED", heldOn: addDays(DEMO_START, -38), deliveredOn: addDays(DEMO_START, -2), deliveryRef: "INC/DPR/2026/0450" });
  const appealNo = appealNumber(app.uin!, level);
  const appeal = await db.appeal.create({
    data: {
      appealNo, applicationId: app.id, level, ground: "DELAY", origin: "CITIZEN", status: "CLOSED", authorityId: level === "TAA" ? null : cases[0].authorityId,
      filedOn: addDays(DEMO_START, -35), groundsText: "The certificate was delivered long after the time limit.", reliefSought: "Act under the Act on the delay.",
      windowStartOn: addDays(DEMO_START, -37), windowEndsOn: addDays(DEMO_START, 8), deadlineOn: DEMO_START, decidedOn: DEMO_START, closedOn: DEMO_START,
    },
  });
  const order = await db.order.create({
    data: {
      orderNo: `${appealNo}/ORD-1`, appealId: appeal.id, level, templateCode: "ALLOW_DELIVER", outcome: "ALLOWED",
      findings: "The service was delivered well after the notified time limit.", reasons: "No sufficient and reasonable cause was shown for the delay.",
      penaltyPlan: JSON.stringify(cases.map((c) => ({ officerId: c.officerId, capacity: c.capacity ?? "DPS", amount: c.amount }))),
      status: level === "TAA" ? "AUTHENTICATED" : "SIGNED", draftedById: cases[0].authorityId, draftedOn: DEMO_START, signedById: cases[0].authorityId, signedOn: DEMO_START,
      esignRef: `ESIGN-${DEMO_START.replaceAll("-", "")}-DEMO${Math.floor(Math.random() * 1e6)}`, authenticatedById: level === "TAA" ? "u-registrar" : null, authenticatedOn: level === "TAA" ? DEMO_START : null,
    },
  });
  const { today, settings, cal: rc } = await getRuleContext(db);
  const out = [];
  for (const c of cases) {
    out.push(await imposePenalty(db, { order, appeal, app, line: { officerId: c.officerId, capacity: c.capacity ?? "DPS", amount: c.amount }, delayDays: 6, imposedById: c.authorityId }, today, settings, rc));
  }
  return out;
}

async function confirmAll(db: PrismaClient, ids: string[]) {
  for (const id of ids) await confirmUnpaid(DDO, id);
}

async function deduct(db: PrismaClient, penaltyId: string, amount: number, voucherNo: string, verify: boolean) {
  const line = await db.ticketLine.findFirstOrThrow({ where: { penaltyId } });
  await recordDeduction(NODAL, { lineId: line.id, payrollRef: "", salaryMonth: "2026-12", amount, voucherNo, proofFile: "salary-deduction-dec-2026.pdf" });
  if (verify) {
    const d = await db.deduction.findFirstOrThrow({ where: { penaltyId, voucherNo } });
    await verifyDeduction(DDO, d.id);
  }
}

const go = (db: PrismaClient, date: string) => advanceClockTo(SYSTEM_ACTOR, date);

export const PENALTY_SCENARIOS: Scenario[] = [
  {
    id: 1, title: "Paid by QR", covers: "Steps 1–2",
    summary: "An FAA penalty of Rs. 2,000 on a DPS (Anjali Baruah) is paid through eGRAS on day 10. The receipt is matched and the penalty closes, with no ticket.",
    steps: [
      { text: "As the DPS, open My penalties: the card shows the UIN, appeal number, authority, amount, last date and QR code.", userId: "u-dps-kmm", href: "/penalties" },
      { text: "Press Pay through eGRAS, then Pay Rs. 2,000 (scan QR). The receipt (GRN) is pending." },
      { text: "Press +1 day in the yellow bar. The receipt settles, is matched by reference and the penalty closes." },
      { text: "As the Sewa Setu DDO, see no ticket and nothing to confirm.", userId: "u-ss-ddo", href: "/recovery?tab=all" },
    ],
    stage: async (db) => {
      await stageOrder(db, [{ officerId: "u-dps-kmm", amount: 2000, level: "FAA", authorityId: "u-faa-kmm" }]);
      await go(db, "2026-11-12");
    },
  },
  {
    id: 2, title: "Unpaid to closed (main flow)", covers: "Steps 3–8",
    summary: "An SAA penalty of Rs. 4,000 on Anjali Baruah goes unpaid past the last date (2 Dec). The clock is on 3 Dec.",
    steps: [
      { text: "As the Sewa Setu DDO, Confirm unpaid → Confirm not paid. The QR is switched off, the standing Recovery Direction is attached and a ticket goes to Finance.", userId: "u-ss-ddo", href: "/recovery?tab=confirm" },
      { text: "As the Finance nodal officer, open the ticket and record the December deduction: Rs. 4,000, a treasury voucher and the proof file.", userId: "u-fin-nodal", href: "/finance" },
      { text: "As the Sewa Setu DDO, Verify proof → Proof checked. The officer receives the deduction message.", userId: "u-ss-ddo", href: "/recovery?tab=verify" },
      { text: "Go to 8 Dec: the treasury credit arrives and the credit is confirmed. Then go to 1 Jan 2027: the December statement is generated and the penalty closes.", userId: "u-ss-ddo", href: "/recovery?tab=statement" },
    ],
    stage: async (db) => {
      await stageOrder(db, [{ officerId: "u-dps-kmm", amount: 4000, level: "SAA", authorityId: "u-saa-rev" }]);
      await go(db, "2026-12-03");
    },
  },
  {
    id: 3, title: "Commission penalises an FAA and a DPS", covers: "Section 9: Commission on FAA and DPS",
    summary: "One authenticated Commission order imposes Rs. 2,000 on the FAA (Rituraj Bora) for a missed deadline and Rs. 5,000 on the DPS (Nilakshi Gogoi).",
    steps: [
      { text: "As the FAA, open My penalties and pay Rs. 2,000 by QR. Press +1 day: it closes.", userId: "u-faa-jrt", href: "/penalties" },
      { text: "Go to 3 Dec. As the Sewa Setu DDO, confirm the DPS's penalty unpaid; it goes to Finance for recovery from salary.", userId: "u-ss-ddo", href: "/recovery?tab=confirm" },
      { text: "As the Commission (Registrar), see both penalties in the ledger.", userId: "u-registrar", href: "/commission/penalties" },
    ],
    stage: async (db) => {
      await stageOrder(db, [
        { officerId: "u-faa-jrt", amount: 2000, level: "TAA", authorityId: "u-com1", capacity: "FAA" },
        { officerId: "u-dps-jrt", amount: 5000, level: "TAA", authorityId: "u-com1" },
      ]);
      await go(db, "2026-11-12");
    },
  },
  {
    id: 4, title: "Pending payment on day 30 (E1)", covers: "E1",
    summary: "Rs. 2,000 on Anjali Baruah; today (2 Dec) is the last date.",
    steps: [
      { text: "As the DPS, pay by QR. The receipt is pending until tomorrow.", userId: "u-dps-kmm", href: "/penalties" },
      { text: "Press +1 day: the receipt settles first, the penalty closes and no ticket is raised (the Sewa Setu DDO has nothing to confirm)." },
      { text: "Variant: restart, pay, then on the eGRAS page press Make this receipt fail. Press +1 day: the receipt fails, the penalty is overdue and the Sewa Setu DDO confirms it unpaid.", userId: "u-ss-ddo", href: "/recovery?tab=confirm" },
    ],
    stage: async (db) => {
      await stageOrder(db, [{ officerId: "u-dps-kmm", amount: 2000, level: "FAA", authorityId: "u-faa-kmm" }]);
      await go(db, "2026-12-02");
    },
  },
  {
    id: 5, title: "Late payment and double recovery (E2, E3)", covers: "E2, E3",
    summary: "Two officers are already with Finance: Anjali Baruah (Rs. 3,000, nothing deducted yet) and Pallab Dutta (Rs. 2,500, already deducted from December salary).",
    steps: [
      { text: "As Anjali Baruah, pay Rs. 3,000 by eGRAS challan (the QR is off after confirmation).", userId: "u-dps-kmm", href: "/penalties" },
      { text: "As Pallab Dutta, follow the eGRAS challan link and pay Rs. 2,500, although it was already deducted from salary.", userId: "u-dps-two", href: "/penalties" },
      { text: "Press +1 day. Anjali's line is removed from the ticket and Finance is told to stop: the penalty closes on the eGRAS route. Pallab's is flagged as double recovery with a refund due." },
      { text: "As the Finance nodal officer, record the refund with its reference; see the stop-deduction task.", userId: "u-fin-nodal", href: "/finance" },
      { text: "As the Commission, see the double recovery in the ledger.", userId: "u-registrar", href: "/commission/penalties" },
    ],
    stage: async (db) => {
      const [p1] = await stageOrder(db, [{ officerId: "u-dps-kmm", amount: 3000, level: "FAA", authorityId: "u-faa-kmm" }]);
      const [p2] = await stageOrder(db, [{ officerId: "u-dps-two", amount: 2500, level: "FAA", authorityId: "u-faa-kmm" }], "u-cit-3");
      await go(db, "2026-12-03");
      await confirmAll(db, [p1.id, p2.id]);
      await deduct(db, p2.id, 2500, "TV/2026/12/0525", false);
    },
  },
  {
    id: 6, title: "Stay, then set aside (E5, E6)", covers: "E5, E6",
    summary: "Pallab Dutta has two SAA penalties (Rs. 7,000 and Rs. 6,000) on one ticket in 3 instalments; Rs. 2,500 has been deducted on the Rs. 7,000 penalty.",
    steps: [
      { text: "As the Sewa Setu DDO, open the Rs. 7,000 penalty (All penalties) → Record a stay (court order and a copy). The line goes on hold and Finance is told to stop.", userId: "u-ss-ddo", href: "/recovery?tab=all" },
      { text: "As the Finance nodal officer, see the line on hold and the stop-deduction task; the other penalty continues.", userId: "u-fin-nodal", href: "/finance" },
      { text: "As the Sewa Setu DDO, on the same penalty → Set the penalty aside (court order). Rs. 2,500 becomes a refund due.", userId: "u-ss-ddo", href: "/recovery?tab=refunds" },
      { text: "As the Finance nodal officer, record the refund. The penalty ends as set aside.", userId: "u-fin-nodal", href: "/finance" },
    ],
    stage: async (db) => {
      const [p1, p2] = await stageOrder(db, [
        { officerId: "u-dps-two", amount: 7000, level: "SAA", authorityId: "u-saa-rev" },
        { officerId: "u-dps-two", amount: 6000, level: "SAA", authorityId: "u-saa-rev" },
      ]);
      await go(db, "2026-12-03");
      await confirmAll(db, [p1.id, p2.id]);
      await deduct(db, p1.id, 2500, "TV/2026/12/0610", true);
      await go(db, "2026-12-10");
    },
  },
  {
    id: 7, title: "Two penalties, instalments, partial deduction (E12, E13)", covers: "E12, E13",
    summary: "Rs. 5,000 (FAA) and Rs. 8,000 (SAA) on Pallab Dutta are on one ticket: Rs. 13,000, split into 3 monthly instalments.",
    steps: [
      { text: "As the Finance nodal officer, open the ticket: one line per UIN, total Rs. 13,000, plan of 4,333 / 4,333 / 4,334.", userId: "u-fin-nodal", href: "/finance" },
      { text: "Record only Rs. 2,000 for December (salary not enough). The penalty shows partly deducted and the plan re-spreads the balance over January and February." },
      { text: "Go to 7 Jan 2027: nothing is escalated, because December had a deduction; the balance has carried forward." },
    ],
    stage: async (db) => {
      const [p1] = await stageOrder(db, [{ officerId: "u-dps-two", amount: 5000, level: "FAA", authorityId: "u-faa-kmm" }]);
      const [p2] = await stageOrder(db, [{ officerId: "u-dps-two", amount: 8000, level: "SAA", authorityId: "u-saa-rev" }], "u-cit-3");
      await go(db, "2026-12-03");
      await confirmAll(db, [p1.id, p2.id]);
    },
  },
  {
    id: 8, title: "Outside the State payroll (E8)", covers: "E8",
    summary: "Rakesh Pegu is on deputation to a public sector undertaking. His Rs. 1,500 penalty cannot be deducted through the State payroll.",
    steps: [
      { text: "As the Sewa Setu DDO, open Exceptions: the case is there with its reason.", userId: "u-ss-ddo", href: "/recovery?tab=exceptions" },
      { text: "Record recovery through the paying authority: our letter, their reply, the voucher and the proof. The penalty is recovered and the credit will be checked." },
    ],
    stage: async (db) => {
      const [p] = await stageOrder(db, [{ officerId: "u-dps-dep", amount: 1500, level: "FAA", authorityId: "u-faa-jrt" }]);
      await go(db, "2026-12-03");
      await confirmAll(db, [p.id]);
    },
  },
  {
    id: 9, title: "Retirement and write-off (E9, E18)", covers: "E9, E18",
    summary: "Gitanjali Bora retires on 31 Dec 2026 with Rs. 3,000 unpaid. Her ticket is first in the queue. Recovery from pension is off.",
    steps: [
      { text: "As the Finance nodal officer, see the ticket marked retiring soon at the top.", userId: "u-fin-nodal", href: "/finance" },
      { text: "Go to 1 Jan 2027: she has retired, so the case moves to the exceptions queue." },
      { text: "As the Sewa Setu DDO, open the penalty → Request a write-off with the reason.", userId: "u-ss-ddo", href: "/recovery?tab=exceptions" },
      { text: "As the Competent Authority (Madhurima Kakati), approve with e-Sign. The write-off shows in the Commission's ledger and the next statement.", userId: "u-ca-pers", href: "/competent" },
    ],
    stage: async (db) => {
      const [p] = await stageOrder(db, [{ officerId: "u-dps-ret", amount: 3000, level: "FAA", authorityId: "u-faa-kmm" }]);
      await go(db, "2026-12-03");
      await confirmAll(db, [p.id]);
    },
  },
  {
    id: 10, title: "Credit missing (E15)", covers: "E15",
    summary: "Rs. 4,000 was deducted from Anjali Baruah's December salary and verified on 3 Dec, but the treasury credit has been dropped (demo).",
    steps: [
      { text: "Go to 19 Dec: no credit after 15 days. The penalty shows credit missing and the Finance nodal officer gets a follow-up task.", userId: "u-fin-nodal", href: "/finance" },
      { text: "Go to 27 Dec: still missing, so it is escalated to the Finance senior officer and the Commission.", userId: "u-fin-senior", href: "/finance/escalations" },
      { text: "Go to 1 Jan 2027: the December statement shows the difference.", userId: "u-ss-ddo", href: "/recovery?tab=statement" },
      { text: "As the Finance nodal officer, Record follow-up. Press +1 day: the credit arrives and is confirmed.", userId: "u-fin-nodal", href: "/finance" },
    ],
    stage: async (db) => {
      const [p] = await stageOrder(db, [{ officerId: "u-dps-kmm", amount: 4000, level: "SAA", authorityId: "u-saa-rev" }]);
      await go(db, "2026-12-03");
      await confirmAll(db, [p.id]);
      await deduct(db, p.id, 4000, "TV/2026/12/1001", true);
      const c = await db.creditFeedEntry.findFirstOrThrow({ where: { voucherNo: "TV/2026/12/1001" } });
      await dropCredit(DDO, c.id);
    },
  },
  {
    id: 11, title: "Nodal officer misses the deadline (E14)", covers: "E14",
    summary: "Both Finance nodal officers are on leave. Nilakshi Gogoi's Rs. 2,500 ticket is due by 6 Jan 2027 (pay date plus 5 working days).",
    steps: [
      { text: "As the Finance senior officer, nothing is overdue yet.", userId: "u-fin-senior", href: "/finance/escalations" },
      { text: "Go to 7 Jan 2027: nothing was deducted, so the ticket is escalated (noting both nodal officers on leave) and the amount moves to January's salary." },
      { text: "As the Commission, see it under overdue recoveries.", userId: "u-registrar", href: "/commission/penalties" },
    ],
    stage: async (db) => {
      await db.user.updateMany({ where: { role: "FINANCE_NODAL" }, data: { onLeave: true } });
      const [p] = await stageOrder(db, [{ officerId: "u-dps-jrt", amount: 2500, level: "FAA", authorityId: "u-faa-jrt" }]);
      await go(db, "2026-12-03");
      await confirmAll(db, [p.id]);
    },
  },
  {
    id: 12, title: "“I never got the order” (E17)", covers: "E17",
    summary: "Anjali Baruah says she never received the order for her Rs. 2,000 penalty, now overdue.",
    steps: [
      { text: "As the Sewa Setu DDO, open the penalty: Proof of service shows the dashboard posting, the SMS and email sent, and when she first opened it.", userId: "u-ss-ddo", href: "/recovery?tab=confirm" },
      { text: "The messages log shows the same SMS and email.", userId: "u-admin", href: "/notifications" },
    ],
    stage: async (db) => {
      const [p] = await stageOrder(db, [{ officerId: "u-dps-kmm", amount: 2000, level: "FAA", authorityId: "u-faa-kmm" }]);
      await db.penalty.update({ where: { id: p.id }, data: { firstViewedOn: "2026-11-04", firstViewedAt: "2026-11-04T10:42:13.000Z" } });
      await db.auditEvent.create({ data: { simDate: "2026-11-04", realTs: "2026-11-04T10:42:13.000Z", actorId: "u-dps-kmm", actorName: "Anjali Baruah (Demo)", actorRole: "DPS", action: "penalty.firstView", entityType: "penalty", entityId: p.id, caseRef: p.uin, outcome: "OK" } });
      await go(db, "2026-12-03");
    },
  },
];

export async function stagePenaltyScenario(db: PrismaClient, id: number) {
  const s = PENALTY_SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown scenario ${id}`);
  await seedBaseline(db);
  await s.stage(db);
  return s;
}
