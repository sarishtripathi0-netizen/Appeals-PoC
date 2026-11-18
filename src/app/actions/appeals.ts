"use server";

import { attempt, safeBack, str } from "@/lib/action";
import { formatDate } from "@/domain/dates";
import { actorOf, requireUser } from "@/lib/session";
import {
  declineDraft, decideLateFiling, fileAppeal, recordHearing, releaseHeld, scheduleHearing, submitReply, type Ground,
} from "@/services/appeals";
import { admitAppeal, castCastingVote, castVote, refileAppeal, rejectAtScrutiny, returnAppeal } from "@/services/commission";
import { extendSaa } from "@/services/escalation";
import { authenticateOrder, saveOrderDraft, signOrder } from "@/services/orders";
import type { Level } from "@/domain/settings";

export async function file(fd: FormData) {
  const u = await requireUser(["CITIZEN", "CALL_CENTRE"]);
  let id = "";
  await attempt(safeBack(fd.get("back")), async () => {
    const a = await fileAppeal(actorOf(u), {
      applicationId: str(fd, "applicationId"),
      level: (str(fd, "level") || "FAA") as Level,
      ground: (str(fd, "ground") || undefined) as Ground | undefined,
      groundsText: str(fd, "groundsText") || undefined,
      reliefSought: str(fd, "reliefSought") || undefined,
      lateReason: str(fd, "lateReason") || undefined,
    });
    id = a.id;
    return a.status === "FILED_LATE"
      ? `Appeal ${a.appealNo} filed. It is late, so the authority will first decide on your reason.`
      : `Appeal ${a.appealNo} filed. It should be decided by ${formatDate(a.deadlineOn)}.`;
  }, () => (u.role === "CITIZEN" ? `/citizen/appeals/${id}` : safeBack(fd.get("back"))));
}

export async function decline(fd: FormData) {
  const u = await requireUser(["CITIZEN", "CALL_CENTRE"]);
  await attempt(safeBack(fd.get("back")), async () => {
    await declineDraft(actorOf(u), str(fd, "appealId"), str(fd, "reason"));
    return "You have declined the draft appeal. You can still file an appeal while the filing window is open.";
  });
}

export async function lateDecision(fd: FormData) {
  const u = await requireUser(["FAA", "SAA"]);
  const accept = str(fd, "decision") === "accept";
  await attempt(safeBack(fd.get("back")), async () => {
    await decideLateFiling(actorOf(u), str(fd, "appealId"), accept, str(fd, "reasons"));
    return accept ? "Late filing accepted. The DPS has been asked to reply." : "Late appeal not accepted. The citizen has been told the reasons.";
  });
}

export async function reply(fd: FormData) {
  const u = await requireUser(["DPS", "LINK_OFFICER"]);
  await attempt(safeBack(fd.get("back")), async () => {
    await submitReply(actorOf(u), str(fd, "appealId"), str(fd, "text"));
    return "Reply sent to the appellate authority.";
  });
}

export async function hearing(fd: FormData) {
  const u = await requireUser(["FAA", "SAA", "REGISTRAR"]);
  await attempt(safeBack(fd.get("back")), async () => {
    const h = await scheduleHearing(actorOf(u), str(fd, "appealId"), {
      date: str(fd, "date"),
      timeSlot: str(fd, "timeSlot"),
      mode: str(fd, "mode") === "IN_PERSON" ? "IN_PERSON" : "ONLINE",
      inPersonReason: str(fd, "inPersonReason") || undefined,
      shortNoticeReason: str(fd, "shortNoticeReason") || undefined,
    });
    return `Hearing fixed for ${formatDate(h.scheduledOn, true)}. Notice served on the citizen and the DPS.`;
  });
}

export async function hearingRecord(fd: FormData) {
  const u = await requireUser(["FAA", "SAA", "COMMISSIONER", "CHIEF_COMMISSIONER"]);
  await attempt(safeBack(fd.get("back")), async () => {
    await recordHearing(actorOf(u), str(fd, "hearingId"), { citizen: fd.get("citizen") === "on", dps: fd.get("dps") === "on", notes: str(fd, "notes") });
    return "Hearing recorded.";
  });
}

export async function orderSave(fd: FormData) {
  const u = await requireUser(["FAA", "SAA", "COMMISSIONER", "CHIEF_COMMISSIONER"]);
  const impose = str(fd, "penaltyChoice") === "impose";
  // Up to three penalty lines: the Commission can penalise the DPS and the authorities that missed deadlines.
  const penalties = impose
    ? [0, 1, 2]
        .map((i) => ({ key: str(fd, `penaltyOfficer_${i}`), amount: str(fd, `amount_${i}`) }))
        .filter((l) => l.key && l.amount)
        .map((l) => {
          const [officerId, capacity] = l.key.split("|");
          return { officerId, capacity, amount: Number(l.amount) };
        })
    : [];
  let orderId = "";
  await attempt(safeBack(fd.get("back")), async () => {
    const o = await saveOrderDraft(actorOf(u), str(fd, "appealId"), {
      templateCode: str(fd, "templateCode"),
      findings: str(fd, "findings"),
      reasons: str(fd, "reasons"),
      directionDays: str(fd, "directionDays") ? Number(str(fd, "directionDays")) : undefined,
      penalties,
      noPenaltyReason: impose ? undefined : str(fd, "noPenaltyReason"),
      disciplinaryRecommendation: str(fd, "disciplinary"),
    });
    orderId = o.id;
    return "Draft saved. Check the preview, then sign with e-Sign.";
  }, () => `/doc/order/${orderId}`);
}

export async function orderSign(fd: FormData) {
  const u = await requireUser(["FAA", "SAA", "COMMISSIONER", "CHIEF_COMMISSIONER"]);
  await attempt(safeBack(fd.get("back")), async () => {
    const r = await signOrder(actorOf(u), str(fd, "orderId"));
    if (r.to === "AWAITING_AUTHENTICATION") return "Order signed. It takes effect when the Registrar authenticates it.";
    return r.direction
      ? `Order signed and issued. Delivery is due by ${formatDate(r.direction.dueOn)}. Copies sent to all parties.`
      : "Order signed and issued. Copies sent to all parties.";
  });
}

export async function release(fd: FormData) {
  const u = await requireUser(["HEAD_OF_OFFICE"]);
  await attempt(safeBack(fd.get("back")), async () => {
    await releaseHeld(actorOf(u), str(fd, "applicationId"), str(fd, "reason"));
    return "Application released back to the DPS.";
  });
}

export async function extend(fd: FormData) {
  const u = await requireUser(["SAA"]);
  await attempt(safeBack(fd.get("back")), async () => {
    const until = await extendSaa(actorOf(u), str(fd, "appealId"), Number(str(fd, "totalDays")), str(fd, "reason"));
    return `Time to decide extended to ${formatDate(until)}. The citizen and the DPS have been told.`;
  });
}

export async function scrutiny(fd: FormData) {
  const u = await requireUser(["REGISTRAR"]);
  const decision = str(fd, "decision");
  const appealId = str(fd, "appealId");
  await attempt(safeBack(fd.get("back")), async () => {
    if (decision === "admit") {
      const members = fd.getAll("members").filter((m): m is string => typeof m === "string" && !!m);
      await admitAppeal(actorOf(u), appealId, members, str(fd, "presidingId"));
      return "Appeal admitted and placed before the bench.";
    }
    if (decision === "return") {
      await returnAppeal(actorOf(u), appealId, str(fd, "reasons"));
      return "Appeal returned to the citizen for correction.";
    }
    await rejectAtScrutiny(actorOf(u), appealId, str(fd, "reasons"));
    return "Appeal not admitted. The citizen has been told the reasons.";
  });
}

export async function refile(fd: FormData) {
  const u = await requireUser(["CITIZEN", "CALL_CENTRE"]);
  await attempt(safeBack(fd.get("back")), async () => {
    await refileAppeal(actorOf(u), str(fd, "appealId"), str(fd, "groundsText"));
    return "Appeal filed again for scrutiny.";
  });
}

export async function vote(fd: FormData) {
  const u = await requireUser(["COMMISSIONER", "CHIEF_COMMISSIONER"]);
  const casting = str(fd, "casting") === "1";
  await attempt(safeBack(fd.get("back")), async () => {
    if (casting) {
      await castCastingVote(actorOf(u), str(fd, "appealId"), str(fd, "position"), str(fd, "note"));
      return "Casting vote recorded.";
    }
    const t = await castVote(actorOf(u), str(fd, "appealId"), str(fd, "position"), str(fd, "note"));
    return t.needsCasting ? "Vote recorded. The bench is evenly divided; the Chief Commissioner has been asked for a casting vote." : t.decided ? "Vote recorded. The bench has decided; the presiding member can draft the order." : "Vote recorded.";
  });
}

export async function authenticate(fd: FormData) {
  const u = await requireUser(["REGISTRAR"]);
  await attempt(safeBack(fd.get("back")), async () => {
    const r = await authenticateOrder(actorOf(u), str(fd, "orderId"));
    return r.direction ? `Order authenticated and issued. Delivery is due by ${formatDate(r.direction.dueOn)}.` : "Order authenticated and issued. Copies sent to all parties.";
  });
}
