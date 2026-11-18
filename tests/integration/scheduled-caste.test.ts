// Scheduled Caste Certificate as notified: system check, live photo, alternatives, fee, one 30-working-day workflow
// (Dealing Assistant, then DPS), at most two reverts, and the District / Co-District authorities.
import { beforeEach, describe, expect, it } from "vitest";
import { SYSTEM_ACTOR } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { advanceClockTo } from "@/scheduler";
import { seedBaseline } from "@/seed";
import { attachDocument, completeStep, createDraft, officerDecision, raiseQuery, respondQuery, submitApplication } from "@/services/applications";
import { SCHEDULED_CASTE_CERTIFICATE as SCC } from "@/seed/masters";

const actor = (id: string, role: string) => ({ id, name: id, role });
const rina = actor("u-cit-1", "CITIZEN");
const abdul = actor("u-cit-4", "CITIZEN");
const daKmm = actor("u-da-kmm", "DEALING_ASSISTANT");
const daSnp = actor("u-da-snp", "DEALING_ASSISTANT");
const dpsKmm = actor("u-dps-sw-kmm", "DPS");
const [photo, dob, residence, , recommendation] = SCC.documents.map((d) => d.name);

beforeEach(async () => {
  await seedBaseline(prisma); // Mon 2 Nov 2026
});

describe("Scheduled Caste Certificate", () => {
  it("fetches what records confirm, needs a live photo, and runs one 30-day workflow through the Dealing Assistant", async () => {
    const draft = await createDraft(rina, rina.id, "SCC", "KMM", { applicantName: "Rina Kalita", fatherName: "Ramen Kalita", fatherCertNo: "SC/KMM/2019/004512", address: "Beltola", purpose: "Admission" });
    expect(JSON.parse(draft.systemCheck!).sources).toMatchObject({ DOB: "Aadhaar", RESIDENCE: "Aadhaar", RELATIONSHIP: "Aadhaar" });
    await expect(submitApplication(rina, draft.id)).rejects.toThrow(/required document/);
    await expect(attachDocument(rina, draft.id, photo, "UPLOAD")).rejects.toThrow(/captured live/);
    await attachDocument(rina, draft.id, photo, "LIVE_CAPTURE");

    const app = await submitApplication(rina, draft.id);
    expect(app).toMatchObject({
      uin: expect.stringMatching(/^RTPS-SCC\/2026\//), timeLimitDays: 30, dueOn: "2026-12-11", stage: "DA_VERIFY",
      dpsId: "u-dps-sw-kmm", faaId: "u-dc-kmm", saaId: "u-saa-sje", daId: "u-da-kmm", feeRef: expect.stringMatching(/^GRN-/),
    });

    await expect(officerDecision(dpsKmm, app.id, "deliver", "SC/KMM/2026/0001")).rejects.toThrow(/Dealing Assistant/);
    await expect(completeStep(daSnp, app.id, { note: "Checked all documents" })).rejects.toThrow(/not assigned/);
    expect(await completeStep(daKmm, app.id, { note: "Father's certificate verified in e-District" })).toBe("DPS_DECISION");
    await officerDecision(dpsKmm, app.id, "deliver", "SC/KMM/2026/0001");
    expect((await prisma.application.findUniqueOrThrow({ where: { id: app.id } })).status).toBe("DELIVERED");
  });

  it("goes to the co-district office, accepts a recommendation instead of the father's certificate, and allows two reverts only", async () => {
    const draft = await createDraft(abdul, abdul.id, "SCC", "SNP", { applicantName: "Abdul Karim", fatherName: "Late Karim Uddin", address: "Sonapur", purpose: "Job" });
    expect(JSON.parse(draft.systemCheck!).sources).toEqual({});
    for (const name of [dob, residence, recommendation]) await attachDocument(abdul, draft.id, name, "UPLOAD");
    await attachDocument(abdul, draft.id, photo, "LIVE_CAPTURE");
    const app = await submitApplication(abdul, draft.id);
    expect(app).toMatchObject({ timeLimitDays: 30, dpsId: "u-dps-sw-snp", faaId: "u-cdc-snp", daId: "u-da-snp", stage: "DA_VERIFY" });

    await raiseQuery(daSnp, app.id, ["Recommendation is not in the standard format."]);
    await respondQuery(abdul, app.id, "Uploaded the standard format.");
    await raiseQuery(daSnp, app.id, ["Date of birth proof is not legible."]); // no recorded reason needed under this notification
    await respondQuery(abdul, app.id, "Uploaded a clear copy.");
    await expect(raiseQuery(daSnp, app.id, ["One more thing"])).rejects.toThrow(/at most 2|reverted 2 times/);
    const after = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(after).toMatchObject({ queryCount: 2, status: "IN_PROGRESS" });
  });

  it("refuses an application without the father's name", async () => {
    await expect(createDraft(rina, rina.id, "SCC", "KMM", { applicantName: "Rina Kalita", address: "Beltola" })).rejects.toThrow(/Father's full name/);
  });

  it("is held after 30 working days and the first appeal lies to the District Commissioner", async () => {
    const draft = await createDraft(rina, rina.id, "SCC", "KMM", { applicantName: "Rina Kalita", fatherName: "Ramen Kalita", fatherCertNo: "SC/KMM/2019/004512", address: "Beltola", purpose: "Admission" });
    await attachDocument(rina, draft.id, photo, "LIVE_CAPTURE");
    const app = await submitApplication(rina, draft.id);
    await advanceClockTo(SYSTEM_ACTOR, "2026-12-12");
    expect((await prisma.application.findUniqueOrThrow({ where: { id: app.id } })).status).toBe("HELD");
    expect(await prisma.appeal.findFirstOrThrow({ where: { applicationId: app.id } })).toMatchObject({ status: "DRAFT", authorityId: "u-dc-kmm" });
  }, 120_000);
});
