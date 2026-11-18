// Intake from a service system (fake client): rejected and overdue applications become AMS cases with the officers
// the Rule Engine named, the citizen can appeal to that FAA, and the persons are checked against MDM and HR.
import { beforeEach, describe, expect, it } from "vitest";
import { HrError, type HrClient } from "@/adapters/hr";
import { hrChairOf, type Person, type ServiceSystemClient, type Snapshot } from "@/adapters/service-systems";
import { prisma } from "@/lib/db";
import { seedBaseline } from "@/seed";
import { fileAppeal } from "@/services/appeals";
import { crossCheck, importExternal } from "@/services/intake";

const person = (roleCode: string, code: string | null, name: string | null, office: string, desig: string, slaDays: number | null = null): Person => ({
  roleCode, roleName: roleCode, category: "AUTHORITY", stage: null, slaDays, returnSlaDays: null, status: code ? "RESOLVED" : "UNRESOLVED",
  office: { code: office, name: `Office ${office}` }, designation: { code: desig, name: desig.replaceAll("_", " ") }, post: `${office}:${desig}:1`,
  employeeCode: code, employeeName: name, via: "REGULAR", reason: code ? null : "No officer holds the post", candidates: null, resolutionId: `res-${roleCode}`,
});

function snapshot(o: { no?: string; status?: string; grounds?: string[]; faaCode?: string | null } = {}): Snapshot {
  const dps = person("DPS", "EMP-0141", "Bornali Medhi", "DC_KMM", "ADC", 2);
  const faa = person("FAA", o.faaCode === undefined ? "EMP-0139" : o.faaCode, o.faaCode === null ? null : "Jayanta Phukan", "DC_KMM", "DISTRICT_COMMISSIONER", 30);
  const saa = person("SAA", "EMP-0210", "Rina Ahmed", "SEC_WMD", "SR_MOST_SECRETARY", 60);
  const rejected = (o.grounds ?? ["REJECTED"]).includes("REJECTED");
  return {
    application: {
      applicationNo: o.no ?? "MCC-2026-000002", service: { code: "100031", name: "Application for Minority Community Certificate", department: "Welfare of Minorities and Development Department", timelineDays: 30, locationLevel: "DISTRICT" },
      status: o.status ?? "REJECTED", channel: "ONLINE", submittedOn: "2026-09-01", dueDate: "2026-10-14", rule: { code: "GENERAL", name: "All other areas", version: 3, resolutionId: "rule-1" }, engineMessage: null, mdmVersion: 756,
      decision: rejected ? { status: "REJECTED", at: "", on: "2026-10-31", reason: "Address proof does not match the stated address", by: { employeeCode: "EMP-0141", name: "Bornali Medhi", roleCode: "DPS", actingAs: "PRIMARY" } } : null,
      sla: { timelineDays: 30, submittedOn: "2026-09-01", dueDate: "2026-10-14", workingDaysUsed: 0, workingDaysLeft: null, overdue: !rejected, state: rejected ? "DISPOSED_ON_TIME" : "OVERDUE" },
    },
    applicant: { name: "Mary Das", fatherName: "Karim Uddin", gender: "FEMALE", mobile: "9876500001", email: null, addressLine: "House 12, Ward 3", locationCode: "V-AZARA-01", location: { district: { code: "KMM", name: "Kamrup Metropolitan" }, circle: { code: "CIR-AZARA", name: "Azara" }, village: { code: "V-AZARA-01", name: "Azara" }, ward: null } },
    documents: [{ docType: "IDENTITY", docKind: "AADHAAR", fileName: "aadhaar.pdf", uploadedAt: "" }],
    certificate: null,
    designatedPersons: { dps, linkOfficer: dps, actingDps: { ...dps, actingAs: "PRIMARY" }, appellate: [faa, saa], workflow: [], all: [dps, faa, saa] },
    timeline: { statutory: {} as never, steps: [], appealLevels: [{ roleCode: "FAA", roleName: "FAA", slaDays: 30 }, { roleCode: "SAA", roleName: "SAA", slaDays: 60 }, { roleCode: "TAA", roleName: "TAA", slaDays: null }] },
    appeal: { eligible: (o.grounds ?? ["REJECTED"]).length > 0, grounds: o.grounds ?? ["REJECTED"], nextAuthority: faa, levels: [faa, saa] },
  };
}
const client = (s: Snapshot): ServiceSystemClient => ({ list: async () => [], snapshot: async () => s });
const admin = { id: "u-admin", name: "Admin", role: "ADMIN" };

beforeEach(async () => {
  await seedBaseline(prisma);
  await prisma.mdmRecord.deleteMany();
});

describe("bringing a service-system application into AMS", () => {
  it("creates a rejected case with the Rule Engine's officers, and the citizen appeals to that FAA", async () => {
    const r = await importExternal(admin, "MCC", "MCC-2026-000002", client(snapshot()));
    const app = await prisma.application.findUniqueOrThrow({ where: { id: r.applicationId }, include: { service: true, documents: true, ledger: true } });
    expect(app).toMatchObject({ uin: "MCC-2026-000002", status: "REJECTED", rejectedOn: "2026-10-31", officeId: "DC_KMM", dpsId: "ext-dps-EMP-0141", faaId: "ext-faa-EMP-0139", saaId: "ext-saa-EMP-0210", linkOfficerId: null });
    expect(app.service).toMatchObject({ code: "100031", timeLimitWorkingDays: 30, faaDays: 30, saaDays: 60 });
    expect(app.documents).toHaveLength(1);
    expect(app.ledger).toMatchObject([{ officerId: "ext-dps-EMP-0141", capacity: "DPS", fromOn: "2026-09-01", toOn: "2026-10-31" }]);
    const citizen = await prisma.user.findUniqueOrThrow({ where: { id: app.citizenId } });
    expect(citizen).toMatchObject({ role: "CITIZEN", mobile: "9876500001" });

    const appeal = await fileAppeal({ id: citizen.id, name: citizen.name, role: "CITIZEN" }, { applicationId: app.id, groundsText: "The address proof matches.", reliefSought: "Issue the certificate." } as never);
    expect(await prisma.appeal.findUniqueOrThrow({ where: { id: appeal.id } })).toMatchObject({ appealNo: "MCC-2026-000002-FAA", ground: "REJECTION", authorityId: "ext-faa-EMP-0139" });
  });

  it("holds an application still open after its due date, so a delay appeal can be filed", async () => {
    const r = await importExternal(admin, "MCC", "MCC-2026-000009", client(snapshot({ no: "MCC-2026-000009", status: "IN_PROCESS", grounds: ["OVERDUE"] })));
    expect(await prisma.application.findUniqueOrThrow({ where: { id: r.applicationId } })).toMatchObject({ status: "HELD", heldOn: "2026-10-15", rejectedOn: null });
  });

  it("refreshes instead of duplicating, and keeps the snapshot with the Rule Engine's resolution ids", async () => {
    const first = await importExternal(admin, "MCC", "MCC-2026-000002", client(snapshot()));
    expect(await importExternal(admin, "MCC", "MCC-2026-000002", client(snapshot()))).toEqual({ applicationId: first.applicationId, created: false });
    const x = await prisma.externalApplication.findUniqueOrThrow({ where: { applicationId: first.applicationId } });
    expect(JSON.parse(x.resolutionIds)).toEqual(["res-DPS", "res-FAA", "res-SAA"]);
    expect(x).toMatchObject({ ruleCode: "GENERAL", ruleVersion: 3, mdmVersion: 756 });
  });

  it("refuses when not eligible, when the Rule Engine has not named the FAA, or for anyone but the administrator", async () => {
    await expect(importExternal(admin, "MCC", "X", client(snapshot({ status: "IN_PROCESS", grounds: [] })))).rejects.toThrow(/not appeal-eligible/);
    await expect(importExternal(admin, "MCC", "X", client(snapshot({ faaCode: null })))).rejects.toThrow(/not named the First Appellate Authority/);
    await expect(importExternal({ ...admin, role: "FAA" }, "MCC", "X", client(snapshot()))).rejects.toThrow(/administrator/);
  });
});

describe("cross-check of the Rule Engine's persons", () => {
  it("flags codes missing in MDM, a different holder in HR, and offices HR does not cover", async () => {
    await prisma.mdmRecord.create({ data: { id: "e1", entityType: "employee", code: "EMP-0141", name: "Bornali Medhi", isActive: true, mdmVersion: 1, payload: JSON.stringify({ code: "EMP-0141", name: "Bornali Medhi" }), syncedAt: "" } });
    const hr = {
      chairHolder: async (chair: string) => {
        if (chair.startsWith("SEC_")) throw new HrError(`Office is not in MDM`, 404);
        const id = chair === "DC_KMM-ADC-01" ? "EMP-0141" : "EMP-0008";
        return { body: { sanctioned_post_id: chair, status: "HELD", holders: [{ employee_id: id, name: `Name ${id}`, charge_type: "SUBSTANTIVE", is_demo: false }] }, mdmVersion: 1, mdmStale: false };
      },
    } as unknown as HrClient;
    const checks = await crossCheck(snapshot(), hr);
    const by = (role: string) => checks.find((c) => c.role === role)!;
    expect(by("DPS")).toMatchObject({ mdm: "OK", hr: "SAME" });
    expect(by("FAA")).toMatchObject({ mdm: "NOT_IN_MDM", hr: "DIFFERENT", hrHolders: ["Name EMP-0008 (EMP-0008)"] });
    expect(by("SAA")).toMatchObject({ hr: "NOT_IN_HR" });
  });

  it("maps Rule Engine posts to HR chairs", () => {
    expect(hrChairOf("DC_KMM:ADC:2")).toBe("DC_KMM-ADC-02");
    expect(hrChairOf("SDO_KMM-GUW:SDO_SADAR:1")).toBe("SDO_KMM-GUW-SDO_SADAR-01");
    expect(hrChairOf(null)).toBeNull();
  });
});
