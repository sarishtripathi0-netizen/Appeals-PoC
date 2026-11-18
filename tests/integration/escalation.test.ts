// Escalation, the SAA and the Commission, driven through the simulated clock.
import { beforeEach, describe, expect, it } from "vitest";
import { addDays } from "@/domain/dates";
import { SYSTEM_ACTOR } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { advanceClockBy, advanceClockTo } from "@/scheduler";
import { seedBaseline } from "@/seed";
import { fileAppeal } from "@/services/appeals";
import { admitAppeal, castCastingVote, castVote, refileAppeal, returnAppeal } from "@/services/commission";
import { extendSaa } from "@/services/escalation";
import { authenticateOrder, saveOrderDraft, signOrder } from "@/services/orders";

const actor = (id: string, role: string) => ({ id, name: id, role });
const rina = actor("u-cit-1", "CITIZEN");
const bikash = actor("u-cit-2", "CITIZEN");
const faa = actor("u-faa-kmm", "FAA");
const saa = actor("u-saa-rev", "SAA");
const registrar = actor("u-registrar", "REGISTRAR");
const cc = actor("u-cc", "CHIEF_COMMISSIONER");
const com1 = actor("u-com1", "COMMISSIONER");
const com2 = actor("u-com2", "COMMISSIONER");

const LONG = 180_000;
const setSetting = (key: string, value: unknown) => prisma.setting.update({ where: { key }, data: { value: JSON.stringify(value) } });
/** The seeded appeal with the FAA (Bikash's caste certificate). */
const seededFaa = () => prisma.appeal.findFirstOrThrow({ where: { level: "FAA", status: "UNDER_REVIEW", application: { citizenId: bikash.id } } });
const atLevel = (applicationId: string, level: string) => prisma.appeal.findFirstOrThrow({ where: { applicationId, level } });
const order = { findings: "Not delivered within the time limit at any level.", reasons: "No cause shown at any level for a delay of many months.", directionDays: 7 };

beforeEach(async () => {
  await seedBaseline(prisma);
});

describe("escalation chain (next level)", () => {
  it("moves FAA to SAA to Commission on missed deadlines; a split bench decides and penalises all three", async () => {
    const first = await seededFaa();
    await advanceClockTo(SYSTEM_ACTOR, addDays(first.deadlineOn!, 1));
    expect((await seededFaa().catch(() => null))).toBeNull();
    expect(await prisma.appeal.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ status: "ESCALATED" });
    const second = await atLevel(first.applicationId, "SAA");
    expect(second).toMatchObject({ status: "UNDER_REVIEW", origin: "AUTO_ESCALATED", authorityId: saa.id, parentAppealId: first.id });
    expect(await prisma.missedDeadline.findFirstOrThrow({ where: { appealId: first.id } })).toMatchObject({ authorityId: faa.id, deadlineOn: first.deadlineOn, escalatedToAppealId: second.id });

    await expect(extendSaa(saa, second.id, 80, "Records awaited from the circle office")).rejects.toThrow(/at most 75/);
    await expect(extendSaa(faa, second.id, 75, "Records awaited from the circle office")).rejects.toThrow(/role/);
    const until = await extendSaa(saa, second.id, 75, "Records awaited from the circle office");
    await expect(extendSaa(saa, second.id, 70, "Again")).rejects.toThrow(/already been extended/);

    await advanceClockTo(SYSTEM_ACTOR, addDays(until, 1));
    expect((await prisma.appeal.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("ESCALATED");
    const third = await atLevel(first.applicationId, "TAA");
    expect(third).toMatchObject({ status: "SCRUTINY", origin: "AUTO_ESCALATED", authorityId: null });
    expect(await prisma.missedDeadline.count({ where: { appeal: { applicationId: first.applicationId } } })).toBe(2);

    await expect(admitAppeal(registrar, third.id, [com1.id, com2.id], com1.id)).rejects.toThrow(/one or three/);
    await admitAppeal(registrar, third.id, [com1.id, com2.id, cc.id], com1.id);
    await castVote(com1, third.id, "ALLOW", "");
    await expect(saveOrderDraft(com1, third.id, { templateCode: "ALLOW_DELIVER", ...order, penalties: [] })).rejects.toThrow(/Every bench member must vote/);
    await castVote(com2, third.id, "ALLOW", "");
    const tally = await castVote(cc, third.id, "DISMISS", "The delay was caused by a records backlog across the circle.");
    expect(tally).toMatchObject({ decided: "ALLOW", needsCasting: false });
    await expect(castCastingVote(cc, third.id, "DISMISS", "")).rejects.toThrow(/evenly divided/);

    await expect(saveOrderDraft(com1, third.id, { templateCode: "DISMISS", ...order, penalties: [] })).rejects.toThrow(/decided to allow/);
    await expect(saveOrderDraft(com2, third.id, { templateCode: "ALLOW_DELIVER", ...order, penalties: [] })).rejects.toThrow(/not assigned/);
    const penalties = [
      { officerId: "u-dps-kmm", capacity: "DPS", amount: 5000 },
      { officerId: faa.id, capacity: "FAA", amount: 2000 },
      { officerId: saa.id, capacity: "SAA", amount: 1000 },
    ];
    const draft = await saveOrderDraft(com1, third.id, { templateCode: "ALLOW_DELIVER", ...order, penalties });
    expect(draft.dissent).toContain("records backlog");
    expect(await signOrder(com1, draft.id)).toMatchObject({ to: "AWAITING_AUTHENTICATION" });
    expect(await prisma.penalty.count({ where: { appealId: third.id } })).toBe(0);

    await expect(authenticateOrder(com1, draft.id)).rejects.toThrow(/role/);
    const done = await authenticateOrder(registrar, draft.id);
    expect(done.to).toBe("COMPLIANCE");
    const imposed = await prisma.penalty.findMany({ where: { appealId: third.id }, orderBy: { amount: "desc" } });
    expect(imposed.map((p) => [p.officerId, p.capacity, p.amount, p.imposedByLevel])).toEqual([
      ["u-dps-kmm", "DPS", 5000, "TAA"], [faa.id, "FAA", 2000, "TAA"], [saa.id, "SAA", 1000, "TAA"],
    ]);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ status: "AUTHENTICATED", authenticatedById: registrar.id });
  }, LONG);
});

describe("escalation switch: straight to the Commission", () => {
  it("skips the SAA; the Registrar can return the appeal for correction", async () => {
    await setSetting("escalationMode", "STRAIGHT_TO_COMMISSION");
    const first = await seededFaa();
    await advanceClockTo(SYSTEM_ACTOR, addDays(first.deadlineOn!, 1));
    expect(await prisma.appeal.count({ where: { applicationId: first.applicationId, level: "SAA" } })).toBe(0);
    const third = await atLevel(first.applicationId, "TAA");
    expect(third).toMatchObject({ status: "SCRUTINY", parentAppealId: first.id });

    await returnAppeal(registrar, third.id, "Please attach the FAA hearing notice.");
    expect((await atLevel(first.applicationId, "TAA")).status).toBe("RETURNED");
    await refileAppeal(bikash, third.id, "Grounds as before. The FAA hearing notice was never served on me; I attach the SMS log.");
    expect((await atLevel(first.applicationId, "TAA")).status).toBe("SCRUTINY");
  }, LONG);
});

describe("remand", () => {
  it("breaks a tie with the casting vote, remands to the FAA, and returns to the Commission when the remand deadline is missed", async () => {
    await setSetting("escalationMode", "STRAIGHT_TO_COMMISSION");
    const first = await seededFaa();
    await advanceClockTo(SYSTEM_ACTOR, addDays(first.deadlineOn!, 1));
    const third = await atLevel(first.applicationId, "TAA");
    await admitAppeal(registrar, third.id, [com1.id, com2.id, cc.id], com2.id);
    await castVote(com1, third.id, "ALLOW", "");
    await castVote(com2, third.id, "DISMISS", "");
    const tie = await castVote(cc, third.id, "REMAND", "The FAA never heard the parties.");
    expect(tie).toMatchObject({ needsCasting: true, decided: null });
    await expect(castCastingVote(com1, third.id, "REMAND", "")).rejects.toThrow(/Chief Commissioner/);
    await castCastingVote(cc, third.id, "REMAND", "A hearing is needed first.");

    const draft = await saveOrderDraft(com2, third.id, { templateCode: "REMAND", ...order, penalties: [], noPenaltyReason: "Penalty to be considered after the remand decision." });
    await signOrder(com2, draft.id);
    await authenticateOrder(registrar, draft.id);
    expect((await atLevel(first.applicationId, "TAA")).status).toBe("CLOSED");
    const back = await prisma.appeal.findUniqueOrThrow({ where: { id: first.id } });
    expect(back).toMatchObject({ status: "UNDER_REVIEW", remandCycle: 1, decidedOn: null });
    expect(back.deadlineOn).toBe(back.remandDueOn);

    await advanceClockTo(SYSTEM_ACTOR, addDays(back.remandDueOn!, 1));
    expect((await prisma.appeal.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("ESCALATED");
    expect(await atLevel(first.applicationId, "TAA")).toMatchObject({ status: "UNDER_REVIEW", reopenCount: 1, decidedOn: null });
    expect(await prisma.vote.count({ where: { appealId: third.id } })).toBe(0);
    expect(await prisma.missedDeadline.findFirstOrThrow({ where: { appealId: first.id, deadlineOn: back.remandDueOn! } })).toMatchObject({ escalatedToAppealId: third.id });
  }, LONG);
});

describe("citizen's next appeal", () => {
  it("drafts a second appeal when the FAA dismisses and the service is still not delivered", async () => {
    await advanceClockBy(SYSTEM_ACTOR, 1);
    const app = await prisma.application.findFirstOrThrow({ where: { citizenId: rina.id, serviceCode: "PRC" } });
    await expect(fileAppeal(rina, { applicationId: app.id, level: "SAA" })).rejects.toThrow(/only after the First Appellate Authority has decided/);
    const first = await fileAppeal(rina, { applicationId: app.id });
    const o = await saveOrderDraft(faa, first.id, { templateCode: "DISMISS", findings: "The DPS reports the land record is under correction.", reasons: "The delay is due to a pending land-record correction outside the DPS's control.", penalties: [], noPenaltyReason: "Delay outside the DPS's control." });
    await signOrder(faa, o.id);
    const draft = await atLevel(app.id, "SAA");
    expect(draft).toMatchObject({ status: "DRAFT", origin: "AUTO_DRAFT", parentAppealId: first.id, authorityId: saa.id });
    const second = await fileAppeal(rina, { applicationId: app.id, level: "SAA" });
    expect(second).toMatchObject({ status: "UNDER_REVIEW", level: "SAA" });
    expect(await prisma.respondentReply.count({ where: { appealId: second.id } })).toBe(1);
  });
});
