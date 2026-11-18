"use server";

import { attempt, safeBack, str } from "@/lib/action";
import { actorOf, requireUser } from "@/lib/session";
import {
  acknowledgeTask, adjustPenalty, closeUnmatchedPayment, decideWriteOff, liftStay, recordManualRecovery, recordRefund, recordStay,
  requestWriteOff, resumeException, simulateUnmatchedPayment, updateStaffRecord, type OrderDocs,
} from "@/services/exceptions";

const RECORDERS = ["SEWA_SETU_DDO", "REGISTRAR", "COMMISSIONER", "CHIEF_COMMISSIONER"] as const;
const REVIEWERS = [...RECORDERS, "FAA", "SAA"] as const;

/** An order is evidenced by its reference and an uploaded copy; the POC keeps the file name only. */
function orderDocs(fd: FormData): OrderDocs {
  const file = fd.get("document");
  return {
    authority: (str(fd, "authority") || "COURT") as OrderDocs["authority"],
    orderRef: str(fd, "orderRef"),
    documentName: file instanceof File && file.size > 0 ? file.name : "",
  };
}

export async function stay(fd: FormData) {
  const u = await requireUser([...RECORDERS]);
  await attempt(safeBack(fd.get("back")), async () => {
    await recordStay(actorOf(u), str(fd, "penaltyId"), orderDocs(fd));
    return "Stay recorded. The QR code is off, the ticket line is on hold and Finance has been told to stop deductions.";
  });
}

export async function lift(fd: FormData) {
  const u = await requireUser([...RECORDERS]);
  await attempt(safeBack(fd.get("back")), async () => {
    const d = orderDocs(fd);
    await liftStay(actorOf(u), str(fd, "penaltyId"), { orderRef: d.orderRef, documentName: d.documentName });
    return "Stay lifted. The penalty resumes where it was.";
  });
}

export async function adjust(fd: FormData) {
  const u = await requireUser([...REVIEWERS]);
  const kind = str(fd, "kind") === "SET_ASIDE" ? "SET_ASIDE" : "REDUCED";
  await attempt(safeBack(fd.get("back")), async () => {
    await adjustPenalty(actorOf(u), str(fd, "penaltyId"), { ...orderDocs(fd), kind, newAmount: Number(str(fd, "newAmount")) });
    return kind === "SET_ASIDE" ? "Penalty set aside. Anything already collected will be refunded." : "Penalty reduced. Anything collected above the new amount will be refunded.";
  });
}

export async function refund(fd: FormData) {
  const u = await requireUser(["FINANCE_NODAL"]);
  await attempt(safeBack(fd.get("back")), async () => {
    await recordRefund(actorOf(u), str(fd, "refundId"), str(fd, "reference"));
    return "Refund recorded. The officer has been told.";
  });
}

export async function manual(fd: FormData) {
  const u = await requireUser(["SEWA_SETU_DDO"]);
  const proof = fd.get("proof");
  await attempt(safeBack(fd.get("back")), async () => {
    await recordManualRecovery(actorOf(u), str(fd, "exceptionId"), {
      letterRef: str(fd, "letterRef"), letterOn: str(fd, "letterOn"), replyRef: str(fd, "replyRef"), replyOn: str(fd, "replyOn"),
      proofFile: proof instanceof File && proof.size > 0 ? proof.name : "", voucherNo: str(fd, "voucherNo"), amount: Number(str(fd, "amount")),
    });
    return "Recovery through the paying authority recorded. The credit will be checked against the treasury feed.";
  });
}

export async function resume(fd: FormData) {
  const u = await requireUser(["SEWA_SETU_DDO"]);
  await attempt(safeBack(fd.get("back")), async () => {
    await resumeException(actorOf(u), str(fd, "exceptionId"), { note: str(fd, "note"), correctEmployeeId: str(fd, "employeeId") || undefined });
    return "Recovery resumed.";
  });
}

export async function closeUnmatched(fd: FormData) {
  const u = await requireUser(["SEWA_SETU_DDO"]);
  await attempt(safeBack(fd.get("back")), async () => {
    await closeUnmatchedPayment(actorOf(u), str(fd, "exceptionId"), str(fd, "note"));
    return "Unmatched payment resolved.";
  });
}

export async function writeOffRequest(fd: FormData) {
  const u = await requireUser(["SEWA_SETU_DDO"]);
  await attempt(safeBack(fd.get("back")), async () => {
    await requestWriteOff(actorOf(u), str(fd, "penaltyId"), str(fd, "reason"));
    return "Write-off requested. The Competent Authority has been asked to approve it.";
  });
}

export async function writeOffDecide(fd: FormData) {
  const u = await requireUser(["COMPETENT_AUTHORITY"]);
  const approve = str(fd, "decision") === "approve";
  await attempt(safeBack(fd.get("back")), async () => {
    await decideWriteOff(actorOf(u), str(fd, "writeOffId"), approve, str(fd, "note"));
    return approve ? "Write-off approved and e-signed." : "Write-off not approved. The case returns to the exceptions queue.";
  });
}

export async function taskDone(fd: FormData) {
  const u = await requireUser(["FINANCE_NODAL"]);
  await attempt(safeBack(fd.get("back")), async () => {
    await acknowledgeTask(actorOf(u), str(fd, "taskId"));
    return "Noted: deduction stopped.";
  });
}

export async function staffSave(fd: FormData) {
  const u = await requireUser(["ADMIN"]);
  await attempt(safeBack(fd.get("back")), async () => {
    await updateStaffRecord(actorOf(u), str(fd, "employeeId"), {
      name: str(fd, "name"), designation: str(fd, "designation"), office: str(fd, "office"), monthlyPay: Number(str(fd, "monthlyPay")),
      payrollType: str(fd, "payrollType"), retirementOn: str(fd, "retirementOn"), status: str(fd, "status"),
    });
    return "Staff record updated (demo). Recovery follows the employee ID; changes take effect from the next scheduler run.";
  });
}

export async function unmatchedDemo(fd: FormData) {
  const u = await requireUser(["ADMIN"]);
  await attempt(safeBack(fd.get("back")), async () => {
    const grn = await simulateUnmatchedPayment(actorOf(u), str(fd, "reference"), Number(str(fd, "amount")));
    return `Demo: challan ${grn} with an unknown reference. It goes to the exceptions queue when it settles.`;
  });
}
