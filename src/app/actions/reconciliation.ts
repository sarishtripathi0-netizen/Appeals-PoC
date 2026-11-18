"use server";

import { attempt, safeBack, str } from "@/lib/action";
import { actorOf, requireUser } from "@/lib/session";
import { dropCredit, followUpCredit } from "@/services/reconciliation";

export async function drop(fd: FormData) {
  const u = await requireUser(["SEWA_SETU_DDO", "ADMIN"]);
  await attempt(safeBack(fd.get("back")), async () => {
    await dropCredit(actorOf(u), str(fd, "entryId"));
    return "Demo: the treasury will not report this credit.";
  });
}

export async function followUp(fd: FormData) {
  const u = await requireUser(["FINANCE_NODAL"]);
  await attempt(safeBack(fd.get("back")), async () => {
    await followUpCredit(actorOf(u), str(fd, "taskId"), str(fd, "note"));
    return "Follow-up recorded. The treasury will re-send the credit (demo: it arrives tomorrow).";
  });
}
