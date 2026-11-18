"use server";

import { attempt, safeBack, str } from "@/lib/action";
import { actorOf, requireUser } from "@/lib/session";
import { attachDocument, completeStep, configOf, confirmReceipt, createDraft, officerDecision, raiseQuery, respondQuery, submitApplication } from "@/services/applications";
import { prisma } from "@/lib/db";
import { recordHandover } from "@/services/ledger";

export async function startApplication(fd: FormData) {
  const u = await requireUser(["CITIZEN", "CALL_CENTRE"]);
  const serviceCode = str(fd, "serviceCode");
  let id = "";
  await attempt(`/citizen/apply/${serviceCode}`, async () => {
    const service = await prisma.service.findUniqueOrThrow({ where: { code: serviceCode } });
    const extra = Object.fromEntries(configOf(service).formFields.map((f) => [f.key, str(fd, f.key)]));
    const app = await createDraft(actorOf(u), u.id, serviceCode, str(fd, "district"), {
      applicantName: str(fd, "applicantName"),
      address: str(fd, "address"),
      purpose: str(fd, "purpose"),
      ...extra,
    });
    id = app.id;
    return "Saved. Now attach the documents.";
  }, () => `/citizen/applications/${id}`);
}

export async function addDocument(fd: FormData) {
  const u = await requireUser(["CITIZEN", "CALL_CENTRE"]);
  const back = safeBack(fd.get("back"));
  const file = fd.get("file");
  const fileName = file instanceof File && file.size > 0 ? file.name : undefined;
  await attempt(back, async () => {
    await attachDocument(actorOf(u), str(fd, "applicationId"), str(fd, "name"), (["DIGILOCKER_MOCK", "LIVE_CAPTURE"].includes(str(fd, "source")) ? str(fd, "source") : "UPLOAD") as "UPLOAD" | "DIGILOCKER_MOCK" | "LIVE_CAPTURE", fileName);
    return "Document attached.";
  });
}

export async function submit(fd: FormData) {
  const u = await requireUser(["CITIZEN", "CALL_CENTRE"]);
  const id = str(fd, "applicationId");
  await attempt(safeBack(fd.get("back")), async () => {
    const a = await submitApplication(actorOf(u), id);
    return `Application submitted. Your Unique Identification Number (UIN) is ${a.uin}.`;
  }, () => `/ack/${id}`);
}

export async function replyToQuery(fd: FormData) {
  const u = await requireUser(["CITIZEN", "CALL_CENTRE"]);
  await attempt(safeBack(fd.get("back")), async () => {
    await respondQuery(actorOf(u), str(fd, "applicationId"), str(fd, "response"));
    return "Reply sent. The time limit has started again.";
  });
}

export async function officerQuery(fd: FormData) {
  const u = await requireUser(["DPS", "LINK_OFFICER", "DEALING_ASSISTANT"]);
  const items = str(fd, "items").split("\n").map((s) => s.trim()).filter(Boolean);
  await attempt(safeBack(fd.get("back")), async () => {
    await raiseQuery(actorOf(u), str(fd, "applicationId"), items, str(fd, "secondReason"));
    return "Request sent to the citizen. The time limit is paused until they reply.";
  });
}

export async function officerAct(fd: FormData) {
  const u = await requireUser(["DPS", "LINK_OFFICER"]);
  const event = str(fd, "event") as "deliver" | "reject" | "close";
  await attempt(safeBack(fd.get("back")), async () => {
    await officerDecision(actorOf(u), str(fd, "applicationId"), event, str(fd, "text"));
    return event === "deliver" ? "Delivery recorded. The citizen has been told." : event === "reject" ? "Rejection recorded with reasons." : "Application closed.";
  });
}

export async function citizenConfirm(fd: FormData) {
  const u = await requireUser(["CITIZEN", "CALL_CENTRE"]);
  await attempt(safeBack(fd.get("back")), async () => {
    await confirmReceipt(actorOf(u), str(fd, "applicationId"));
    return "Thank you. Receipt confirmed.";
  });
}

export async function handover(fd: FormData) {
  const u = await requireUser(["HEAD_OF_OFFICE"]);
  await attempt(safeBack(fd.get("back")), async () => {
    await recordHandover(actorOf(u), {
      fromDpsId: str(fd, "fromDpsId"), toLinkOfficerId: str(fd, "toLinkOfficerId"),
      startOn: str(fd, "startOn"), endOn: str(fd, "endOn"), reason: str(fd, "reason"),
    });
    return "Handover recorded. The responsibility ledger has been updated.";
  });
}

export async function stepDone(fd: FormData) {
  const u = await requireUser(["DEALING_ASSISTANT"]);
  await attempt(safeBack(fd.get("back"), "/verify"), async () => {
    await completeStep(actorOf(u), str(fd, "applicationId"), { note: str(fd, "note") });
    return "Document check recorded. The application is now with the DPS for decision.";
  }, () => "/verify");
}
