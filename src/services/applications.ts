// Application use-cases (AMS-03 to AMS-13), including notified particulars held on the service master:
// documents fetched from Government records, a live photograph, fees, a revert cap and internal workflow steps
// (e.g. the Scheduled Caste Certificate).

import type { Service } from "@prisma/client";
import { digiLocker, governmentRecords, paymentGateway } from "@/adapters";
import { workingDaysBetween } from "@/domain/calendar";
import { formatDate } from "@/domain/dates";
import { formatUin } from "@/domain/numbering";
import { serviceDueDate } from "@/domain/rules";
import { checklistStatus, nextStep, STEPS, totalFee, type DocItem, type Fee, type FormField, type StepCode, type SystemCheck } from "@/domain/service-config";
import { applicationMachine, type ApplicationCtx, type ApplicationEvent } from "@/domain/state-machines";
import { audit, type Actor } from "@/lib/audit";
import { getRuleContext } from "@/lib/context";
import { nextSeq, parseJson, prisma } from "@/lib/db";
import { notifyMany, notifyUser } from "@/lib/notify";
import { rupees } from "@/lib/view";
import { createDraftAppeal } from "./appeals";
import { onConfirmed, onDelivered } from "./orders";
import { DomainError } from "./errors";
import { currentHolderId, rebuildLedger } from "./ledger";
import { check } from "./transition";

/** The notified particulars of a service, parsed from the master. */
export function configOf(service: Service) {
  return {
    docs: parseJson<DocItem[]>(service.documents, []),
    workflow: parseJson<StepCode[]>(service.workflow, []),
    fees: parseJson<Fee[]>(service.fees, []),
    formFields: parseJson<FormField[]>(service.formFields, []),
    eligibility: parseJson<string[]>(service.eligibility, []),
  };
}

export async function resolveAuthorities(serviceCode: string, districtCode: string, today: string) {
  const m = await prisma.authorityMapping.findFirst({
    where: { serviceCode, office: { districtCode }, validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] },
    include: { office: true },
  });
  if (!m) throw new DomainError("This service is not yet available in the selected district.");
  return m;
}

export async function createDraft(actor: Actor, citizenId: string, serviceCode: string, districtCode: string, formData: Record<string, string>) {
  const { today } = await getRuleContext();
  const m = await resolveAuthorities(serviceCode, districtCode, today);
  const service = await prisma.service.findUniqueOrThrow({ where: { code: serviceCode } });
  const cfg = configOf(service);
  const missing = cfg.formFields.find((f) => f.required && !formData[f.key]?.trim());
  if (missing) throw new DomainError(`Please fill in: ${missing.label}.`);
  // The system checks Government records before any officer sees the application, so the citizen uploads only what cannot be fetched.
  const citizen = await prisma.user.findUniqueOrThrow({ where: { id: citizenId } });
  const systemCheck: SystemCheck | null = cfg.docs.some((d) => d.fetch) ? governmentRecords.check(citizen.mobile ?? "", formData) : null;
  const app = await prisma.application.create({
    data: {
      serviceCode, citizenId, officeId: m.officeId, formData: JSON.stringify(formData), status: "DRAFT", createdOn: today,
      dpsId: m.dpsId, linkOfficerId: m.linkOfficerId, faaId: m.faaId, saaId: m.saaId,
      daId: m.daId,
      timeLimitDays: service.timeLimitWorkingDays, systemCheck: systemCheck ? JSON.stringify(systemCheck) : null,
    },
  });
  await audit(prisma, today, { actor, action: "application.createDraft", entityType: "application", entityId: app.id, after: "DRAFT", details: systemCheck ? { systemCheck } : undefined });
  return app;
}

export async function attachDocument(actor: Actor, applicationId: string, name: string, source: "UPLOAD" | "DIGILOCKER_MOCK" | "LIVE_CAPTURE", fileName?: string) {
  const { today } = await getRuleContext();
  const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, include: { service: true } });
  if (app.status !== "DRAFT") throw new DomainError("Documents can only be added before the application is submitted.");
  const item = configOf(app.service).docs.find((d) => d.name === name);
  if (item?.live && source !== "LIVE_CAPTURE") throw new DomainError("The photograph is captured live at the time of application; it cannot be uploaded.");
  if (!item?.live && source === "LIVE_CAPTURE") throw new DomainError("Only the photograph is captured live.");
  const citizen = await prisma.user.findUniqueOrThrow({ where: { id: app.citizenId } });
  const file =
    source === "LIVE_CAPTURE" ? `live-photo-${today}.jpg` :
    source === "DIGILOCKER_MOCK" ? digiLocker.fetch(name, citizen.mobile ?? "0000").fileName :
    fileName || `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.pdf`;
  await prisma.applicationDocument.deleteMany({ where: { applicationId, name } });
  await prisma.applicationDocument.create({ data: { applicationId, name, fileName: file, source } });
}

export async function submitApplication(actor: Actor, applicationId: string) {
  const { today, cal } = await getRuleContext();
  const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, include: { service: true, documents: true } });
  const cfg = configOf(app.service);
  const sysCheck = parseJson<SystemCheck | null>(app.systemCheck, null);
  const attached = new Set(app.documents.map((d) => d.name));
  const { complete } = checklistStatus(cfg.docs, sysCheck, attached);
  const to = await check(applicationMachine, app, "submit", actor, { docsComplete: complete }, today);

  // Every application of the service follows the same workflow and time limit, whatever documents were submitted.
  const timeLimitDays = app.service.timeLimitWorkingDays;
  const stage = cfg.workflow[0] ?? null;
  const fee = totalFee(cfg.fees);

  return prisma.$transaction(async (tx) => {
    const year = Number(today.slice(0, 4));
    const uin = formatUin(app.serviceCode, year, await nextSeq(tx, `uin:${app.serviceCode}:${year}`));
    const dueOn = serviceDueDate(today, timeLimitDays, 0, cal);
    const feeRef = fee ? paymentGateway.confirm(paymentGateway.createChallan(app.id, fee).ref).treasuryRef : null;
    const updated = await tx.application.update({ where: { id: app.id }, data: { status: to, uin, submittedOn: today, dueOn, timeLimitDays, stage, feeRef } });
    await rebuildLedger(tx, app.id);
    await audit(tx, today, { actor, action: "application.submit", entityType: "application", entityId: app.id, caseRef: uin, before: app.status, after: to, details: { dueOn, timeLimitDays, stage, fee, feeRef } });
    await notifyUser(tx, today, app.citizenId,
      `Sewa Setu: Your application for ${app.service.name} is received. UIN ${uin}. It is due by ${formatDate(dueOn)} (${timeLimitDays} working days).${fee ? ` Fee of ${rupees(fee)} paid (ref. ${feeRef}).` : ""} Track it on Sewa Setu.`,
      { entityType: "application", entityId: app.id, caseRef: uin });
    await notifyUser(tx, today, app.dpsId, `New application ${uin} (${app.service.name}) is in your worklist. Due by ${formatDate(dueOn)}.`,
      { channels: ["DASHBOARD"], entityType: "application", entityId: app.id, caseRef: uin });
    if (stage) await notifyStep(tx, today, { ...app, uin }, stage, dueOn);
    return updated;
  });
}

/** Tells whoever acts at an internal step that the application is waiting for them. */
async function notifyStep(db: Parameters<typeof notifyUser>[0], today: string, app: { id: string; uin: string | null; dpsId: string; daId: string | null }, step: StepCode, dueOn: string | null) {
  const who = step === "DA_VERIFY" ? app.daId : app.dpsId;
  await notifyMany(db, today, [who], `Application ${app.uin}: ${STEPS[step].label.toLowerCase()} is now with you. The service is due by ${formatDate(dueOn)}.`,
    { channels: ["DASHBOARD"], entityType: "application", entityId: app.id, caseRef: app.uin });
}

async function loadForOfficer(applicationId: string, actor: Actor, today: string) {
  const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, include: { service: true } });
  const holder = await currentHolderId(prisma, app.id, today);
  // The Dealing Assistant acts on the case only while it is at the document check.
  const isCurrentHolder = actor.role === "DEALING_ASSISTANT" ? app.stage === "DA_VERIFY" && app.daId === actor.id : holder === actor.id;
  return { app, isCurrentHolder, caseRef: app.uin };
}

/** The internal step still pending before the DPS can issue or reject, if any. */
function stageWaiting(app: { stage: string | null }): string | null {
  if (!app.stage || app.stage === "DPS_DECISION") return null;
  return `${STEPS[app.stage as StepCode]?.waitingText ?? "An internal step is pending"}. The DPS can issue or reject once it is done.`;
}

export async function raiseQuery(actor: Actor, applicationId: string, items: string[], secondQueryReason?: string) {
  const { today } = await getRuleContext();
  const { app, isCurrentHolder } = await loadForOfficer(applicationId, actor, today);
  const ctx: ApplicationCtx = { isCurrentHolder, queryItems: items.filter((i) => i.trim()), queryCount: app.queryCount, secondQueryReason, maxQueries: app.service.maxReverts };
  const to = await check(applicationMachine, { ...app, caseRef: app.uin }, "raiseQuery", actor, ctx, today);
  await prisma.$transaction(async (tx) => {
    await tx.infoRequest.create({ data: { applicationId, raisedById: actor.id, raisedOn: today, items: JSON.stringify(ctx.queryItems), secondRequestReason: secondQueryReason || null } });
    await tx.application.update({ where: { id: applicationId }, data: { status: to, queryCount: { increment: 1 } } });
    await audit(tx, today, { actor, action: "application.raiseQuery", entityType: "application", entityId: applicationId, caseRef: app.uin, before: app.status, after: to, details: { items: ctx.queryItems, secondQueryReason, stage: app.stage } });
    await notifyUser(tx, today, app.citizenId,
      `Sewa Setu: The office needs more information for application ${app.uin}. The time limit is paused until you reply. Please reply on Sewa Setu.`,
      { entityType: "application", entityId: applicationId, caseRef: app.uin });
  });
}

export async function respondQuery(actor: Actor, applicationId: string, response: string) {
  const { today, cal } = await getRuleContext();
  const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, include: { service: true, infoRequests: true } });
  if (actor.role === "CITIZEN" && app.citizenId !== actor.id) throw new DomainError("This is not your application.");
  if (!response.trim()) throw new DomainError("Please write your reply.");
  const to = await check(applicationMachine, { ...app, caseRef: app.uin }, "respondQuery", actor, {}, today);
  const open = app.infoRequests.find((r) => !r.respondedOn);
  const paused = open ? workingDaysBetween(open.raisedOn, today, cal) : 0;
  const pausedWorkingDays = app.pausedWorkingDays + paused;
  const dueOn = serviceDueDate(app.submittedOn!, app.timeLimitDays ?? app.service.timeLimitWorkingDays, pausedWorkingDays, cal);
  await prisma.$transaction(async (tx) => {
    if (open) await tx.infoRequest.update({ where: { id: open.id }, data: { respondedOn: today, response } });
    await tx.application.update({ where: { id: applicationId }, data: { status: to, pausedWorkingDays, dueOn } });
    await audit(tx, today, { actor, action: "application.respondQuery", entityType: "application", entityId: applicationId, caseRef: app.uin, before: app.status, after: to, details: { pausedWorkingDays: paused, newDueOn: dueOn } });
    await notifyMany(tx, today, [app.dpsId, open?.raisedById], `The citizen has replied on ${app.uin}. The time limit has resumed; new due date ${formatDate(dueOn)}.`, { channels: ["DASHBOARD"], entityType: "application", entityId: applicationId, caseRef: app.uin });
  });
}

export type StepInput = { note: string };

/** Completes the current internal step (the Dealing Assistant's document check) and moves to the next. */
export async function completeStep(actor: Actor, applicationId: string, input: StepInput) {
  const { today } = await getRuleContext();
  const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, include: { service: true } });
  const step = app.stage as StepCode | null;
  const workflow = configOf(app.service).workflow;
  if (!step || step === "DPS_DECISION" || !workflow.includes(step)) throw new DomainError("There is no pending step on this application.");
  if (!["IN_PROGRESS", "HELD"].includes(app.status)) throw new DomainError(app.status === "AWAITING_CITIZEN" ? "The application is waiting for the citizen's reply." : "This application is no longer being processed.");
  if (actor.id !== app.daId) {
    await audit(prisma, today, { actor, action: "application.step", entityType: "application", entityId: app.id, caseRef: app.uin, outcome: "REFUSED", details: { step, reason: "not assigned" } });
    throw new DomainError(`${STEPS[step].label} is not assigned to you.`);
  }
  if (input.note.trim().length < 5) throw new DomainError("Please record a short note of what was checked.");
  const next = nextStep(workflow, step);
  await prisma.$transaction(async (tx) => {
    await tx.application.update({ where: { id: app.id }, data: { stage: next } });
    await audit(tx, today, { actor, action: "application.step", entityType: "application", entityId: app.id, caseRef: app.uin, details: { step, next, note: input.note.trim() } });
    if (next) await notifyStep(tx, today, app, next, app.dueOn);
  });
  return next;
}

/** Deliver, reject or close (AMS-12, AMS-16). Held applications can be delivered but never closed or rejected. */
export async function officerDecision(actor: Actor, applicationId: string, event: Extract<ApplicationEvent, "deliver" | "reject" | "close">, text: string) {
  const { today, settings, cal } = await getRuleContext();
  const { app, isCurrentHolder } = await loadForOfficer(applicationId, actor, today);
  const ctx: ApplicationCtx = { isCurrentHolder, reasons: text, deliveryRef: text, appealPossibleOrOpen: app.status === "HELD", stageWaiting: stageWaiting(app) };
  const to = await check(applicationMachine, { ...app, caseRef: app.uin }, event, actor, ctx, today);
  await prisma.$transaction(async (tx) => {
    const data =
      event === "deliver" ? { status: to, deliveredOn: today, deliveryRef: text, stage: null } :
      event === "reject" ? { status: to, rejectedOn: today, rejectionReasons: text, stage: null } :
      { status: to, closedOn: today, closeReason: text, stage: null };
    await tx.application.update({ where: { id: applicationId }, data });
    await rebuildLedger(tx, applicationId);
    await audit(tx, today, { actor, action: `application.${event}`, entityType: "application", entityId: applicationId, caseRef: app.uin, before: app.status, after: to, details: { text } });
    const msg =
      event === "deliver" ? `Sewa Setu: Your ${app.service.name} (${app.uin}) has been issued. Reference: ${text}. Please confirm on Sewa Setu once you have received it.` :
      event === "reject" ? `Sewa Setu: Your application ${app.uin} for ${app.service.name} was rejected. Reasons: ${text}. You can appeal to the First Appellate Authority within the filing window.` :
      `Sewa Setu: Your application ${app.uin} has been closed. Reason: ${text}.`;
    await notifyMany(tx, today, [app.citizenId], msg, { entityType: "application", entityId: applicationId, caseRef: app.uin });
    if (event === "deliver") await onDelivered(tx, applicationId, text, actor, today);
    // Open-point switch: the portal drafts the appeal against rejection, or leaves it to the citizen.
    if (event === "reject" && settings.draftOnRejection) await createDraftAppeal(tx, { ...app, status: to, rejectedOn: today, rejectionReasons: text }, "REJECTION", today, settings, cal);
  });
}

export async function confirmReceipt(actor: Actor, applicationId: string) {
  const { today } = await getRuleContext();
  const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  if (actor.role === "CITIZEN" && app.citizenId !== actor.id) throw new DomainError("This is not your application.");
  const to = await check(applicationMachine, { ...app, caseRef: app.uin }, "confirm", actor, {}, today);
  await prisma.$transaction(async (tx) => {
    await tx.application.update({ where: { id: applicationId }, data: { status: to, confirmedOn: today, confirmedVia: actor.role === "CALL_CENTRE" ? "CALL_CENTRE" : "PORTAL" } });
    await audit(tx, today, { actor, action: "application.confirm", entityType: "application", entityId: applicationId, caseRef: app.uin, before: app.status, after: to });
    await onConfirmed(tx, applicationId, actor, today);
  });
}
