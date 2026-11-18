"use server";

import { attempt, safeBack, str } from "@/lib/action";
import { formatDate } from "@/domain/dates";
import { actorOf, requireUser } from "@/lib/session";
import { rupees } from "@/lib/view";
import { forceGrnFailure, payPenalty } from "@/services/penalties";

export async function pay(fd: FormData) {
  const u = await requireUser();
  const channel = str(fd, "channel") === "CHALLAN" ? "CHALLAN" : "QR";
  await attempt(safeBack(fd.get("back")), async () => {
    const amount = Number(str(fd, "amount"));
    const r = await payPenalty({ ...actorOf(u), employeeId: u.employeeId }, str(fd, "ref"), { amount, channel });
    return `eGRAS received ${rupees(amount)}. Receipt number (GRN) ${r.grn}; it will be confirmed by ${formatDate(r.settlesOn)}.`;
  });
}

export async function forceFail(fd: FormData) {
  const u = await requireUser();
  await attempt(safeBack(fd.get("back")), async () => {
    await forceGrnFailure(actorOf(u), str(fd, "grn"));
    return "Demo: this receipt will fail when it settles.";
  });
}
