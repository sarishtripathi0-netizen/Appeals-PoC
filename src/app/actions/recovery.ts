"use server";

import { attempt, safeBack, str } from "@/lib/action";
import { actorOf, requireUser } from "@/lib/session";
import { confirmUnpaid, recordDeduction, returnDeduction, setLeave, signDirection, verifyDeduction } from "@/services/recovery";

export async function confirm(fd: FormData) {
  const u = await requireUser(["SEWA_SETU_DDO"]);
  await attempt(safeBack(fd.get("back")), async () => {
    await confirmUnpaid(actorOf(u), str(fd, "penaltyId"));
    return "Confirmed as not paid. The QR code is switched off and the officer has been told that recovery from salary will follow.";
  });
}

export async function sign(fd: FormData) {
  const u = await requireUser(["COMPETENT_AUTHORITY"]);
  await attempt(safeBack(fd.get("back")), async () => {
    await signDirection(actorOf(u), str(fd, "directionId"));
    return "Recovery Direction signed. The penalty has gone to the Finance nodal officer for recovery.";
  });
}

export async function deduct(fd: FormData) {
  const u = await requireUser(["FINANCE_NODAL"]);
  const file = fd.get("proof");
  await attempt(safeBack(fd.get("back")), async () => {
    await recordDeduction(actorOf(u), {
      lineId: str(fd, "lineId"),
      payrollRef: str(fd, "payrollRef"),
      salaryMonth: str(fd, "salaryMonth"),
      amount: Number(str(fd, "amount")),
      voucherNo: str(fd, "voucherNo"),
      // The POC keeps the file name as the proof; the file itself is not stored.
      proofFile: file instanceof File && file.size > 0 ? file.name : str(fd, "proofName"),
    });
    return "Deduction recorded. The Sewa Setu DDO will verify the proof.";
  });
}

export async function verify(fd: FormData) {
  const u = await requireUser(["SEWA_SETU_DDO"]);
  await attempt(safeBack(fd.get("back")), async () => {
    const r = await verifyDeduction(actorOf(u), str(fd, "deductionId"));
    return r.to === "RECOVERED" ? "Verified. The penalty is recovered, and the officer has been sent the deduction message." : "Verified. The officer has been sent the deduction message.";
  });
}

export async function returnIt(fd: FormData) {
  const u = await requireUser(["SEWA_SETU_DDO"]);
  await attempt(safeBack(fd.get("back")), async () => {
    await returnDeduction(actorOf(u), str(fd, "deductionId"), str(fd, "reason"));
    return "Returned to the Finance nodal officer with your reason.";
  });
}

export async function leave(fd: FormData) {
  const u = await requireUser(["FINANCE_NODAL"]);
  await attempt(safeBack(fd.get("back")), async () => {
    const r = await setLeave(actorOf(u), str(fd, "onLeave") === "1");
    return `${str(fd, "onLeave") === "1" ? "Marked on leave." : "Marked back at work."}${r.moved ? ` ${r.moved} ticket(s) moved.` : ""}${r.bothOnLeave ? " Both nodal officers are now on leave." : ""}`;
  });
}
