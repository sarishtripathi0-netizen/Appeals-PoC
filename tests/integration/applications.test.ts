// Application use-cases against a real (test) database: completeness, UIN, pause, hold refusal, handover, audit.
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { seedBaseline } from "@/seed";
import { attachDocument, createDraft, officerDecision, raiseQuery, respondQuery, submitApplication } from "@/services/applications";
import { DomainError } from "@/services/errors";
import { recordHandover } from "@/services/ledger";

const citizen = { id: "u-cit-1", name: "Rina Kalita (Demo)", role: "CITIZEN" };
const dps = { id: "u-dps-kmm", name: "Anjali Baruah (Demo)", role: "DPS" };
const link = { id: "u-link-kmm", name: "Ripunjoy Kalita (Demo)", role: "LINK_OFFICER" };
const hoo = { id: "u-hoo-kmm", name: "Mitali Das (Demo)", role: "HEAD_OF_OFFICE" };

const setToday = (today: string) => prisma.clockState.update({ where: { id: 1 }, data: { today } });

async function submittedPrc() {
  const draft = await createDraft(citizen, citizen.id, "PRC", "KMM", { applicantName: "Rina Kalita", address: "Beltola", purpose: "Admission" });
  const svc = await prisma.service.findUniqueOrThrow({ where: { code: "PRC" } });
  for (const d of JSON.parse(svc.documents) as { name: string; mandatory: boolean }[]) if (d.mandatory) await attachDocument(citizen, draft.id, d.name, "DIGILOCKER_MOCK");
  return submitApplication(citizen, draft.id);
}

beforeEach(async () => {
  await seedBaseline(prisma); // clock at Mon 2 Nov 2026
});

describe("applications", () => {
  it("issues no UIN until every required document is attached, and logs the refusal", async () => {
    const draft = await createDraft(citizen, citizen.id, "PRC", "KMM", {});
    await expect(submitApplication(citizen, draft.id)).rejects.toBeInstanceOf(DomainError);
    expect((await prisma.application.findUniqueOrThrow({ where: { id: draft.id } })).uin).toBeNull();
    expect(await prisma.auditEvent.count({ where: { entityId: draft.id, outcome: "REFUSED" } })).toBe(1);
  });

  it("issues a UIN, starts the timer and tells the citizen", async () => {
    const app = await submittedPrc();
    expect(app.uin).toMatch(/^RTPS-PRC\/2026\/\d{6}$/);
    expect(app.status).toBe("IN_PROGRESS");
    expect(app.dueOn).toBe("2026-11-21"); // 15 working days
    expect(await prisma.notification.count({ where: { recipientId: citizen.id, channel: "SMS", caseRef: app.uin } })).toBe(1);
    expect(await prisma.ledgerEntry.findMany({ where: { applicationId: app.id } })).toMatchObject([{ officerId: dps.id, toOn: null }]);
  });

  it("pauses the timer while waiting for the citizen and moves the due date", async () => {
    const app = await submittedPrc();
    await raiseQuery(dps, app.id, ["Clear copy of the land document"]);
    await expect(raiseQuery(dps, app.id, ["Another thing"])).rejects.toThrow(); // not IN_PROGRESS any more
    await setToday("2026-11-05");
    await respondQuery(citizen, app.id, "Uploaded a clear copy.");
    const after = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(after).toMatchObject({ status: "IN_PROGRESS", pausedWorkingDays: 3, dueOn: "2026-11-26" });
  });

  it("refuses to close or reject a held application, logs it, and still allows delivery", async () => {
    const app = await submittedPrc();
    await prisma.application.update({ where: { id: app.id }, data: { status: "HELD", heldOn: "2026-11-23" } });
    for (const event of ["close", "reject"] as const) {
      await expect(officerDecision(dps, app.id, event, "Applicant is not eligible")).rejects.toMatchObject({ code: "HELD_CLOSE_ATTEMPT" });
    }
    expect(await prisma.auditEvent.count({ where: { entityId: app.id, outcome: "REFUSED", details: { contains: "HELD_CLOSE_ATTEMPT" } } })).toBe(2);
    await officerDecision(dps, app.id, "deliver", "PRC/DPR/2026/0001");
    expect((await prisma.application.findUniqueOrThrow({ where: { id: app.id } })).status).toBe("DELIVERED");
  });

  it("moves the case to the Link Officer for the handover dates only", async () => {
    const app = await submittedPrc();
    await expect(officerDecision(link, app.id, "deliver", "PRC/1")).rejects.toThrow(/not in your worklist/);
    await recordHandover(hoo, { fromDpsId: dps.id, toLinkOfficerId: link.id, startOn: "2026-11-02", endOn: "2026-11-06", reason: "Earned leave" });
    await expect(officerDecision(dps, app.id, "deliver", "PRC/1")).rejects.toThrow(/not in your worklist/);
    await officerDecision(link, app.id, "deliver", "PRC/1");
    expect(await prisma.ledgerEntry.findMany({ where: { applicationId: app.id } })).toMatchObject([{ officerId: link.id, capacity: "LINK_OFFICER", toOn: "2026-11-02" }]);
  });

  it("keeps the audit log append-only", async () => {
    await submittedPrc();
    await expect(prisma.auditEvent.updateMany({ data: { action: "tampered" } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditEvent.deleteMany({})).rejects.toThrow(/append-only/);
  });
});
