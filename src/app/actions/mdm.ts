"use server";

import { attempt, safeBack, str } from "@/lib/action";
import { actorOf, requireUser } from "@/lib/session";
import { registerWithMdm, syncMdm } from "@/services/mdm";

export async function mdmSync(fd: FormData) {
  const u = await requireUser(["ADMIN"]);
  await attempt(safeBack(fd.get("back"), "/admin/mdm"), async () => {
    const r = await syncMdm(actorOf(u));
    return r.mode === "UP_TO_DATE"
      ? `The copy is already at MDM version ${r.toVersion}.`
      : `Synchronised with MDM: ${r.applied} record(s) ${r.mode === "SNAPSHOT" ? "loaded from snapshots" : "changed"}, now at version ${r.toVersion}.`;
  });
}

export async function mdmRegister(fd: FormData) {
  const u = await requireUser(["ADMIN"]);
  await attempt(safeBack(fd.get("back"), "/admin/mdm"), async () => {
    await registerWithMdm(actorOf(u), str(fd, "usageUrl"));
    return "AMS is registered with MDM as a consumer.";
  });
}
