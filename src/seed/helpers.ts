// Helpers for building back-dated demo records directly (used by the baseline seed and the scenario stagers).

import type { PrismaClient } from "@prisma/client";
import { addPeriod, addWorkingDays, workingDaysBetween, type Calendar } from "@/domain/calendar";
import { addDays } from "@/domain/dates";
import { buildLedger, type HandoverSpan } from "@/domain/ledger";
import { appealNumber, formatUin } from "@/domain/numbering";
import { appealDeadline, serviceDueDate } from "@/domain/rules";
import { DEFAULT_SETTINGS } from "@/domain/settings";
import { nextSeq } from "@/lib/db";
import { MAPPINGS, OFFICES, SERVICES } from "./masters";

export const SEED_ACTOR = { id: "seed", name: "Demo data (seeded history)", role: "SYSTEM" };

export type StageApp = {
  serviceCode: string;
  citizenId: string;
  district: "KMM" | "JRT" | "SNP";
  submittedOn: string;
  status: string;
  query?: { raisedOn: string; respondedOn?: string; items: string[] };
  deliveredOn?: string;
  deliveryRef?: string;
  rejectedOn?: string;
  rejectionReasons?: string;
  heldOn?: string;
  confirmedOn?: string;
  scenario?: string;
  stage?: string;
  handovers?: HandoverSpan[];
  formData?: Record<string, string>;
};

export async function stageApplication(db: PrismaClient, cal: Calendar, s: StageApp) {
  const svc = SERVICES.find((x) => x.code === s.serviceCode)!;
  const officeIds = OFFICES.filter((o) => o.districtCode === s.district).map((o) => o.id);
  const m = MAPPINGS.find((x) => x.serviceCode === s.serviceCode && officeIds.includes(x.officeId))!;
  const year = Number(s.submittedOn.slice(0, 4));
  const uin = formatUin(s.serviceCode, year, await nextSeq(db, `uin:${s.serviceCode}:${year}`));
  const paused = s.query ? workingDaysBetween(s.query.raisedOn, s.query.respondedOn ?? s.query.raisedOn, cal) : 0;
  const timeLimitDays = svc.timeLimitWorkingDays;
  const dueOn = serviceDueDate(s.submittedOn, timeLimitDays, paused, cal);
  const citizen = await db.user.findUniqueOrThrow({ where: { id: s.citizenId } });

  const app = await db.application.create({
    data: {
      uin, serviceCode: s.serviceCode, citizenId: s.citizenId, officeId: m.officeId, status: s.status,
      formData: JSON.stringify(s.formData ?? { applicantName: citizen.name.replace(" (Demo)", ""), address: s.district === "KMM" ? "House 12, Survey, Beltola, Guwahati" : "Ward 5, Na-Ali, Jorhat", purpose: "Higher studies" }),
      createdOn: s.submittedOn, submittedOn: s.submittedOn, dueOn, timeLimitDays, stage: s.stage, daId: m.daId ?? null, pausedWorkingDays: paused, queryCount: s.query ? 1 : 0,
      heldOn: s.heldOn, deliveredOn: s.deliveredOn, deliveryRef: s.deliveryRef, rejectedOn: s.rejectedOn, rejectionReasons: s.rejectionReasons,
      confirmedOn: s.confirmedOn, confirmedVia: s.confirmedOn ? "PORTAL" : null,
      dpsId: m.dpsId, linkOfficerId: m.linkOfficerId, faaId: m.faaId, saaId: m.saaId, scenario: s.scenario,
    },
  });
  await db.applicationDocument.createMany({
    data: (svc.documents as { name: string; mandatory: boolean; group?: string; live?: boolean }[])
      .filter((d, i, all) => d.mandatory || (d.group && all.findIndex((x) => x.group === d.group) === i))
      .map((d) => ({ applicationId: app.id, name: d.name, fileName: d.live ? `live-photo-${s.submittedOn}.jpg` : `${d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.pdf`, source: d.live ? "LIVE_CAPTURE" : "UPLOAD" })),
  });
  if (s.query) {
    await db.infoRequest.create({ data: { applicationId: app.id, raisedById: m.dpsId, raisedOn: s.query.raisedOn, items: JSON.stringify(s.query.items), respondedOn: s.query.respondedOn, response: s.query.respondedOn ? "Documents uploaded as requested." : null } });
  }
  const end = s.deliveredOn ?? s.rejectedOn ?? null;
  const spans = buildLedger(m.dpsId, s.submittedOn, end, s.handovers ?? []);
  await db.ledgerEntry.createMany({ data: spans.map((x) => ({ ...x, applicationId: app.id })) });
  await db.auditEvent.create({
    data: { simDate: s.submittedOn, realTs: new Date().toISOString(), actorId: s.citizenId, actorName: citizen.name, actorRole: "CITIZEN", action: "application.submit", entityType: "application", entityId: app.id, caseRef: uin, beforeStatus: "DRAFT", afterStatus: "IN_PROGRESS", outcome: "OK", details: JSON.stringify({ dueOn, seeded: true }) },
  });
  return app;
}

/** A first appeal on a held (or rejected) application, already filed and with the DPS asked to reply. */
export async function stageFirstAppeal(db: PrismaClient, cal: Calendar, app: { id: string; uin: string | null; citizenId: string; faaId: string; dpsId: string; heldOn: string | null; rejectedOn: string | null }, filedOn: string) {
  const s = DEFAULT_SETTINGS;
  const ground = app.rejectedOn ? "REJECTION" : "DELAY";
  const start = (app.heldOn ?? app.rejectedOn)!;
  const appealNo = appealNumber(app.uin!, "FAA");
  const appeal = await db.appeal.create({
    data: {
      appealNo, applicationId: app.id, level: "FAA", ground, origin: ground === "DELAY" ? "AUTO_DRAFT" : "CITIZEN", status: "UNDER_REVIEW", authorityId: app.faaId,
      draftCreatedOn: ground === "DELAY" ? start : null, linkExpiresOn: ground === "DELAY" ? addDays(start, s.draftLinkValidityDays) : null,
      filedOn, filedById: app.citizenId,
      groundsText: ground === "DELAY" ? "The certificate was not delivered within the notified time limit. I need it for a college admission." : "My application was rejected although all documents were in order.",
      reliefSought: ground === "DELAY" ? "Direct the office to deliver the service, and act under the Act on the delay." : "Set the rejection aside and direct the office to deliver the service.",
      windowStartOn: start, windowEndsOn: addPeriod(start, s.firstAppealWindowDays, s.windowBasis, cal), deadlineOn: appealDeadline("FAA", filedOn, s, cal),
    },
  });
  await db.respondentReply.create({ data: { appealId: appeal.id, dpsId: app.dpsId, requestedOn: filedOn, dueOn: addWorkingDays(filedOn, s.replyDays, cal) } });
  await db.auditEvent.create({
    data: { simDate: filedOn, realTs: new Date().toISOString(), actorId: app.citizenId, actorName: "Citizen", actorRole: "CITIZEN", action: "appeal.file", entityType: "appeal", entityId: appeal.id, caseRef: appealNo, beforeStatus: ground === "DELAY" ? "DRAFT" : null, afterStatus: "UNDER_REVIEW", outcome: "OK", details: JSON.stringify({ seeded: true }) },
  });
  return appeal;
}
