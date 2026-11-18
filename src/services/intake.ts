// Intake from service systems: an application decided in a service system (with the officers the Rule Engine
// resolved) becomes an AMS case that the citizen can appeal. The service system owns the application; AMS keeps the
// snapshot it imported. See docs/rule-engine-integration.md.

import { hrHttp, HrError, officeHoursOn, type HrClient } from "@/adapters/hr";
import { hrChairOf, serviceSystemClient, systemByCode, type Person, type ServiceSystemClient, type Snapshot } from "@/adapters/service-systems";
import { addDays } from "@/domain/dates";
import { buildLedger } from "@/domain/ledger";
import { audit, type Actor } from "@/lib/audit";
import { getToday } from "@/lib/context";
import { prisma } from "@/lib/db";
import { DomainError } from "./errors";
import { mdmRecord } from "./mdm";

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z]+/g, " ").trim();

export type PersonCheck = {
  role: string; person: Person;
  mdm: "OK" | "NOT_IN_MDM" | "NAME_DIFFERS" | "UNRESOLVED"; mdmName: string | null;
  hr: "SAME" | "DIFFERENT" | "VACANT" | "NOT_IN_HR" | "UNRESOLVED" | "ERROR"; hrHolders: string[];
};

/** The persons the Rule Engine named, checked against the MDM employee copy and the HR Utility's chair holder. */
export async function crossCheck(s: Snapshot, hr: HrClient = hrHttp): Promise<PersonCheck[]> {
  const at = officeHoursOn(s.application.decision?.on ?? (await getToday()));
  const dp = s.designatedPersons;
  const people: [string, Person | null][] = [
    ["DPS", dp.dps],
    ...(dp.actingDps && dp.actingDps.employeeCode !== dp.dps?.employeeCode ? [["Acting DPS", dp.actingDps] as [string, Person]] : []),
    ["Link Officer", dp.linkOfficer],
    ...dp.workflow.map((w) => [w.roleName, w] as [string, Person]),
    ...dp.appellate.map((a) => [a.roleCode, a] as [string, Person]),
  ];
  const out: PersonCheck[] = [];
  for (const [role, p] of people) {
    if (!p) continue;
    if (!p.employeeCode) { out.push({ role, person: p, mdm: "UNRESOLVED", mdmName: null, hr: "UNRESOLVED", hrHolders: [] }); continue; }
    const m = await mdmRecord("employee", p.employeeCode);
    const mdm = !m ? "NOT_IN_MDM" : norm(String(m.name)) === norm(p.employeeName) ? "OK" : "NAME_DIFFERS";
    let hrState: PersonCheck["hr"] = "ERROR";
    let hrHolders: string[] = [];
    const chair = hrChairOf(p.post);
    if (!chair || !hr.chairHolder) hrState = "NOT_IN_HR";
    else {
      try {
        const r = (await hr.chairHolder(chair, at)).body;
        hrHolders = r.holders.map((h) => `${h.name} (${h.employee_id})`);
        hrState = r.holders.length === 0 ? "VACANT" : r.holders.some((h) => h.employee_id === p.employeeCode) ? "SAME" : "DIFFERENT";
      } catch (e) {
        hrState = e instanceof HrError && e.status === 404 ? "NOT_IN_HR" : "ERROR";
      }
    }
    out.push({ role, person: p, mdm, mdmName: m ? String(m.name) : null, hr: hrState, hrHolders });
  }
  return out;
}

const ROLE_FOR: Record<string, string> = { DPS: "DPS", LINK: "LINK_OFFICER", FAA: "FAA", SAA: "SAA", DA: "DEALING_ASSISTANT" };

/** A local stand-in user for an officer the Rule Engine named, keyed by role and employee code (one AMS role per user). */
async function shadowOfficer(p: Person, officeId: string | null) {
  const role = ROLE_FOR[p.roleCode] ?? "DPS";
  const id = `ext-${role.toLowerCase()}-${p.employeeCode}`;
  const designation = [p.designation?.name, p.office?.name].filter(Boolean).join(", ");
  await prisma.user.upsert({
    where: { id },
    create: { id, name: p.employeeName ?? p.employeeCode!, role, designation, officeId },
    update: { name: p.employeeName ?? p.employeeCode!, designation },
  });
  return id;
}

export async function importExternal(actor: Actor, source: string, applicationNo: string, client?: ServiceSystemClient) {
  if (actor.role !== "ADMIN") throw new DomainError("Only the administrator can bring applications in from a service system.");
  const sys = systemByCode(source);
  const s = await (client ?? serviceSystemClient(sys)).snapshot(applicationNo);
  const a = s.application;
  if (!s.appeal.eligible) throw new DomainError(`${applicationNo} is not appeal-eligible (status ${a.status}, within its time limit).`);
  const dp = s.designatedPersons;
  const faa = dp.appellate.find((x) => x.roleCode === "FAA");
  const saa = dp.appellate.find((x) => x.roleCode === "SAA");
  const dps = dp.actingDps ?? dp.dps;
  for (const [label, p] of [["DPS", dps], ["First Appellate Authority", faa], ["Second Appellate Authority", saa]] as const) {
    if (!p?.employeeCode) throw new DomainError(`The Rule Engine has not named the ${label} for ${applicationNo}${p?.reason ? `: ${p.reason}` : ""}. It cannot be appealed in AMS yet.`);
  }
  const today = await getToday();
  const now = new Date().toISOString();
  const keep = {
    status: a.status, appealGrounds: JSON.stringify(s.appeal.grounds), refreshedAt: now, snapshot: JSON.stringify(s),
    resolutionIds: JSON.stringify([...new Set(dp.all.map((x) => x.resolutionId).filter(Boolean))]), ruleCode: a.rule?.code ?? null, ruleVersion: a.rule?.version ?? null, mdmVersion: a.mdmVersion,
  };

  const existing = await prisma.externalApplication.findUnique({ where: { source_externalNo: { source, externalNo: applicationNo } } });
  if (existing) {
    await prisma.externalApplication.update({ where: { applicationId: existing.applicationId }, data: keep });
    return { applicationId: existing.applicationId, created: false };
  }

  // Masters AMS needs locally, keyed by their MDM codes.
  const mdmService = await mdmRecord("service", a.service.code);
  const departmentCode = String(mdmService?.departmentCode ?? "EXT");
  await prisma.department.upsert({ where: { code: departmentCode }, create: { code: departmentCode, name: a.service.department }, update: {} });
  const district = s.applicant.location.district;
  await prisma.district.upsert({ where: { code: district.code }, create: { code: district.code, name: district.name }, update: {} });
  const levelDays = (code: string) => s.timeline.appealLevels.find((l) => l.roleCode === code)?.slaDays ?? null;
  await prisma.service.upsert({
    where: { code: a.service.code },
    create: {
      code: a.service.code, name: a.service.name, purpose: String(mdmService?.description ?? a.service.name), timeLimitWorkingDays: a.service.timelineDays,
      documents: "[]", departmentCode, notificationRef: (mdmService?.notificationNo as string | undefined) ?? null, faaDays: levelDays("FAA"), saaDays: levelDays("SAA"),
    },
    update: {},
  });
  const officeId = dps!.office!.code;
  await prisma.office.upsert({ where: { id: officeId }, create: { id: officeId, name: dps!.office!.name, districtCode: district.code, departmentCode }, update: {} });

  const dpsId = await shadowOfficer(dps!, officeId);
  const link = dp.linkOfficer?.employeeCode && dp.linkOfficer.employeeCode !== dps!.employeeCode ? await shadowOfficer(dp.linkOfficer, officeId) : null;
  const faaId = await shadowOfficer(faa!, null);
  const saaId = await shadowOfficer(saa!, null);
  const citizen = (await prisma.user.findFirst({ where: { role: "CITIZEN", mobile: s.applicant.mobile } }))
    ?? (await prisma.user.create({ data: { id: `ext-cit-${s.applicant.mobile}`, name: s.applicant.name, role: "CITIZEN", mobile: s.applicant.mobile, email: s.applicant.email } }));

  const rejected = s.appeal.grounds.includes("REJECTED");
  const heldOn = rejected ? null : addDays(a.dueDate, 1);
  const app = await prisma.application.create({
    data: {
      uin: a.applicationNo, serviceCode: a.service.code, citizenId: citizen.id, officeId,
      formData: JSON.stringify({ applicantName: s.applicant.name, fatherName: s.applicant.fatherName, address: s.applicant.addressLine, location: s.applicant.locationCode, source: `${sys.name}, ${a.applicationNo}` }),
      status: rejected ? "REJECTED" : "HELD", createdOn: a.submittedOn, submittedOn: a.submittedOn, dueOn: a.dueDate, timeLimitDays: a.service.timelineDays,
      rejectedOn: rejected ? a.decision?.on ?? today : null, rejectionReasons: rejected ? a.decision?.reason ?? "Rejected in the service system." : null, heldOn,
      dpsId, linkOfficerId: link, faaId, saaId, daId: null, scenario: `EXTERNAL:${source}`,
    },
  });
  if (s.documents.length) {
    await prisma.applicationDocument.createMany({ data: s.documents.map((d) => ({ applicationId: app.id, name: `${d.docType} (${d.docKind.replaceAll("_", " ").toLowerCase()})`, fileName: d.fileName, source: "UPLOAD" })) });
  }
  const spans = buildLedger(dpsId, a.submittedOn, rejected ? app.rejectedOn : null, []);
  await prisma.ledgerEntry.createMany({ data: spans.map((x) => ({ ...x, applicationId: app.id })) });
  await prisma.externalApplication.create({ data: { applicationId: app.id, source, externalNo: applicationNo, importedAt: now, importedById: actor.id, ...keep } });
  await audit(prisma, today, { actor, action: "intake.import", entityType: "application", entityId: app.id, caseRef: a.applicationNo, after: app.status, details: { source, grounds: s.appeal.grounds, rule: a.rule, mdmVersion: a.mdmVersion } });
  return { applicationId: app.id, created: true };
}
