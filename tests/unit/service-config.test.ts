import { describe, expect, it } from "vitest";
import { governmentRecords } from "@/adapters";
import { checklistStatus, nextStep, totalFee, type DocItem } from "@/domain/service-config";
import { SCHEDULED_CASTE_CERTIFICATE } from "@/seed/masters";

const docs = SCHEDULED_CASTE_CERTIFICATE.documents as DocItem[];
const [photo, dob, residence, fatherCert, recommendation] = docs.map((d) => d.name);
const status = (r: ReturnType<typeof checklistStatus>, name: string) => r.rows.find((x) => x.item.name === name)?.status;

describe("Scheduled Caste Certificate checklist", () => {
  it("needs no uploads when Government records confirm everything; only the live photo", () => {
    const check = { sources: { DOB: "Aadhaar", RESIDENCE: "Aadhaar", FATHER_SC_CERT: "e-District", RELATIONSHIP: "Aadhaar" }, notes: [] };
    expect(checklistStatus(docs, check, new Set()).complete).toBe(false);
    const r = checklistStatus(docs, check, new Set([photo]));
    expect(r.complete).toBe(true);
    expect([status(r, dob), status(r, residence), status(r, fatherCert), status(r, recommendation)]).toEqual(["FETCHED", "FETCHED", "FETCHED", "NOT_NEEDED"]);
  });

  it("asks for what could not be fetched, and either the father's certificate or a recommendation", () => {
    const none = checklistStatus(docs, { sources: {}, notes: [] }, new Set([photo]));
    expect([status(none, dob), status(none, fatherCert), status(none, recommendation)]).toEqual(["MISSING", "MISSING", "MISSING"]);
    const withRec = checklistStatus(docs, { sources: {}, notes: [] }, new Set([photo, dob, residence, recommendation]));
    expect(withRec.complete).toBe(true);
    expect(status(withRec, fatherCert)).toBe("NOT_NEEDED");
    expect(status(withRec, docs[5].name)).toBe("OPTIONAL");
  });

  it("follows one workflow and charges the notified fees", () => {
    const wf = SCHEDULED_CASTE_CERTIFICATE.workflow as ("DA_VERIFY" | "DPS_DECISION")[];
    expect(SCHEDULED_CASTE_CERTIFICATE.timeLimitWorkingDays).toBe(30);
    expect(nextStep(wf, "DA_VERIFY")).toBe("DPS_DECISION");
    expect(nextStep(wf, "DPS_DECISION")).toBeNull();
    expect(totalFee(SCHEDULED_CASTE_CERTIFICATE.fees)).toBe(40);
  });
});

describe("system check against Government records (mock)", () => {
  it("confirms facts only where the records match", () => {
    expect(governmentRecords.check("9000000001", { fatherName: "Ramen Kalita", fatherCertNo: "sc/kmm/2019/004512" }).sources).toEqual({
      DOB: "Aadhaar", RESIDENCE: "Aadhaar", FATHER_SC_CERT: "e-District certificate repository (SC/KMM/2019/004512)", RELATIONSHIP: "Aadhaar",
    });
    const wrongFather = governmentRecords.check("9000000001", { fatherName: "Someone Else", fatherCertNo: "SC/KMM/2019/004512" });
    expect(wrongFather.sources.FATHER_SC_CERT).toBeUndefined();
    expect(governmentRecords.check("9000000004", { fatherName: "Anyone" }).sources).toEqual({});
  });
});
