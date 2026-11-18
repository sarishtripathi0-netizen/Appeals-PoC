// First-appeal journeys against the test database, driven through the simulated clock.
import { beforeEach, describe, expect, it } from "vitest";
import { SYSTEM_ACTOR } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { advanceClockBy, advanceClockTo } from "@/scheduler";
import { seedBaseline } from "@/seed";
import {
  decideLateFiling, declineDraft, fileAppeal, recordHearing, releaseHeld, scheduleHearing,
} from "@/services/appeals";
import { confirmReceipt, officerDecision } from "@/services/applications";
import { saveOrderDraft, signOrder } from "@/services/orders";

const rina = { id: "u-cit-1", name: "Rina Kalita (Demo)", role: "CITIZEN" };
const moonmoon = { id: "u-cit-3", name: "Moonmoon Saikia (Demo)", role: "CITIZEN" };
const dps = { id: "u-dps-kmm", name: "Anjali Baruah (Demo)", role: "DPS" };
const faa = { id: "u-faa-kmm", name: "Pranab Hazarika (Demo)", role: "FAA" };
const hoo = { id: "u-hoo-kmm", name: "Mitali Das (Demo)", role: "HEAD_OF_OFFICE" };

const setSetting = (key: string, value: unknown) => prisma.setting.update({ where: { key }, data: { value: JSON.stringify(value) } });
const rinasPrc = () => prisma.application.findFirstOrThrow({ where: { citizenId: rina.id, serviceCode: "PRC" } });
const faaAppeal = (applicationId: string) => prisma.appeal.findFirstOrThrow({ where: { applicationId, level: "FAA" } });

beforeEach(async () => {
  await seedBaseline(prisma); // Mon 2 Nov 2026; Rina's PRC is due today
});

describe("breach to closure", () => {
  it("holds, drafts, files, hears, orders, delivers and closes", async () => {
    await advanceClockBy(SYSTEM_ACTOR, 1);
    let app = await rinasPrc();
    expect(app).toMatchObject({ status: "HELD", heldOn: "2026-11-03" });
    let appeal = await faaAppeal(app.id);
    expect(appeal).toMatchObject({ status: "DRAFT", ground: "DELAY", appealNo: `${app.uin}-FAA`, linkExpiresOn: "2026-12-03", windowEndsOn: "2026-12-18" });
    const sms = await prisma.notification.findFirstOrThrow({ where: { recipientId: rina.id, channel: "SMS", entityId: appeal.id } });
    expect(sms.text).toContain(`/a/${appeal.linkToken}`);

    await expect(officerDecision(dps, app.id, "close", "Applicant did not visit the office")).rejects.toMatchObject({ code: "HELD_CLOSE_ATTEMPT" });

    appeal = await fileAppeal(rina, { applicationId: app.id });
    expect(appeal).toMatchObject({ status: "UNDER_REVIEW", filedOn: "2026-11-03", deadlineOn: "2026-12-14", isLate: false });
    expect(await prisma.respondentReply.count({ where: { appealId: appeal.id } })).toBe(1);
    await expect(fileAppeal(rina, { applicationId: app.id })).rejects.toThrow(/not available/);

    // 7 clear working days: notice on Tue 3 Nov, earliest hearing Fri 13 Nov.
    await expect(scheduleHearing(faa, appeal.id, { date: "2026-11-12", timeSlot: "11:00", mode: "ONLINE" })).rejects.toThrow(/clear working days/);
    await expect(scheduleHearing(faa, appeal.id, { date: "2026-11-13", timeSlot: "11:00", mode: "IN_PERSON" })).rejects.toThrow(/in-person/);
    const hearing = await scheduleHearing(faa, appeal.id, { date: "2026-11-13", timeSlot: "11:00", mode: "ONLINE" });
    await expect(recordHearing(faa, hearing.id, { citizen: true, dps: true, notes: "" })).rejects.toThrow(/on or after/);
    await advanceClockTo(SYSTEM_ACTOR, "2026-11-13");
    await recordHearing(faa, hearing.id, { citizen: true, dps: false, notes: "DPS absent" });

    const base = { templateCode: "ALLOW_DELIVER", findings: "Complete on the UIN date; not delivered in time.", reasons: "No reason was shown for the delay of eight working days.", directionDays: 7 };
    const draft = await saveOrderDraft(faa, appeal.id, { ...base, penalties: [] });
    await expect(signOrder(faa, draft.id)).rejects.toThrow(/decide on a penalty/);
    await saveOrderDraft(faa, appeal.id, { ...base, penalties: [{ officerId: dps.id, capacity: "DPS", amount: 6000 }] });
    await expect(signOrder(faa, draft.id)).rejects.toThrow(/between Rs. 100 and Rs. 5,000/);
    await saveOrderDraft(faa, appeal.id, { ...base, penalties: [{ officerId: faa.id, capacity: "DPS", amount: 2000 }] });
    await expect(signOrder(faa, draft.id)).rejects.toThrow(/responsibility ledger/);
    await saveOrderDraft(faa, appeal.id, { ...base, penalties: [{ officerId: dps.id, capacity: "DPS", amount: 2000 }] });
    await expect(signOrder(dps, draft.id)).rejects.toThrow(/role/);
    const signed = await signOrder(faa, draft.id);
    expect(signed).toMatchObject({ to: "COMPLIANCE", direction: { assigneeId: dps.id, dueOn: "2026-11-23" } });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ status: "SIGNED", esignRef: expect.stringMatching(/^ESIGN-/) });
    expect(await prisma.penalty.findFirstOrThrow({ where: { appealId: appeal.id } })).toMatchObject({ amount: 2000, status: "RAISED", serviceDate: "2026-11-13", dueOn: "2026-12-14", delayDaysAttributed: 9 });
    await expect(saveOrderDraft(faa, appeal.id, { ...base, penalties: [], noPenaltyReason: "Changed my mind entirely" })).rejects.toThrow(/not available/);

    await officerDecision(dps, app.id, "deliver", "PRC/DPR/2026/4411");
    expect((await faaAppeal(app.id)).status).toBe("AWAITING_CONFIRMATION");
    expect(await prisma.direction.findFirstOrThrow({ where: { appealId: appeal.id } })).toMatchObject({ status: "MET", metOn: "2026-11-13" });
    await confirmReceipt(rina, app.id);
    app = await rinasPrc();
    expect(app.status).toBe("DELIVERED_CONFIRMED");
    expect(await faaAppeal(app.id)).toMatchObject({ status: "CLOSED", closedOn: "2026-11-13" });
  });
});

describe("decline or lapse switch", () => {
  it("keeps the application held and flags the Head of Office, who can release it only after the window", async () => {
    await advanceClockBy(SYSTEM_ACTOR, 1);
    await advanceClockTo(SYSTEM_ACTOR, "2026-12-04");
    const app = await rinasPrc();
    expect((await faaAppeal(app.id)).status).toBe("LAPSED");
    expect(app).toMatchObject({ status: "HELD", flaggedToHoO: true });
    await expect(releaseHeld(hoo, app.id, "Citizen not pursuing")).rejects.toThrow(/can still appeal/);
    await advanceClockTo(SYSTEM_ACTOR, "2026-12-19");
    await releaseHeld(hoo, app.id, "Citizen not pursuing; window closed");
    expect((await rinasPrc()).status).toBe("IN_PROGRESS");
  });

  it("releases the application to the DPS when the switch says so, without holding it again", async () => {
    await setSetting("onDeclineOrLapse", "RELEASE_TO_DPS");
    await advanceClockBy(SYSTEM_ACTOR, 1);
    await declineDraft(rina, (await faaAppeal((await rinasPrc()).id)).id, "No longer needed");
    await advanceClockBy(SYSTEM_ACTOR, 3);
    expect(await rinasPrc()).toMatchObject({ status: "IN_PROGRESS", releasedOn: "2026-11-03", flaggedToHoO: false });
  });
});

describe("rejection appeals", () => {
  const moonmoonsInc = () => prisma.application.findFirstOrThrow({ where: { citizenId: moonmoon.id, serviceCode: "INC", status: "REJECTED" } });

  it("lets the citizen start one (switch off); setting the rejection aside reopens the application for delivery", async () => {
    const app = await moonmoonsInc();
    expect(await prisma.appeal.count({ where: { applicationId: app.id } })).toBe(0);
    await expect(fileAppeal(moonmoon, { applicationId: app.id, ground: "DELAY", groundsText: "It was late and also rejected wrongly." })).rejects.toThrow(/only after the time limit/);
    const appeal = await fileAppeal(moonmoon, { applicationId: app.id, ground: "REJECTION", groundsText: "The countersignature was attached as page 2 of the declaration." });
    expect(appeal).toMatchObject({ status: "UNDER_REVIEW", ground: "REJECTION", origin: "CITIZEN" });
    const order = await saveOrderDraft(faa, appeal.id, {
      templateCode: "SET_ASIDE_REJECTION", findings: "The countersignature is on page 2.", reasons: "The rejection overlooked page 2 of the declaration, which is countersigned.",
      directionDays: 10, penalties: [], noPenaltyReason: "Honest oversight; no delay was caused before rejection.",
    });
    await signOrder(faa, order.id);
    expect(await prisma.application.findUniqueOrThrow({ where: { id: app.id } })).toMatchObject({ status: "HELD", rejectedOn: null });
    await officerDecision(dps, app.id, "deliver", "INC/DPR/2026/0091");
    expect((await faaAppeal(app.id)).status).toBe("AWAITING_CONFIRMATION");
  });

  it("drafts the appeal for the citizen when the switch is on", async () => {
    await setSetting("draftOnRejection", true);
    const live = await prisma.application.findFirstOrThrow({ where: { dpsId: dps.id, status: "IN_PROGRESS", serviceCode: "INC" } });
    await officerDecision(dps, live.id, "reject", "Applicant is not a resident of this revenue circle.");
    expect(await faaAppeal(live.id)).toMatchObject({ status: "DRAFT", ground: "REJECTION", origin: "AUTO_DRAFT" });
  });
});

describe("late filing", () => {
  it("needs a reason after the window, which the authority must accept", async () => {
    await advanceClockBy(SYSTEM_ACTOR, 1);
    const app = await rinasPrc();
    await declineDraft(rina, (await faaAppeal(app.id)).id, "");
    await advanceClockTo(SYSTEM_ACTOR, "2026-12-19");
    await expect(fileAppeal(rina, { applicationId: app.id })).rejects.toThrow(/explain why the appeal is late/);
    const appeal = await fileAppeal(rina, { applicationId: app.id, lateReason: "I was admitted to hospital for three weeks." });
    expect(appeal).toMatchObject({ status: "FILED_LATE", isLate: true });
    await expect(decideLateFiling(faa, appeal.id, false, "")).rejects.toThrow(/reasons/);
    await decideLateFiling(faa, appeal.id, true, "");
    expect((await faaAppeal(app.id)).status).toBe("UNDER_REVIEW");
  });
});
