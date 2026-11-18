"use server";

import { attempt, safeBack, str } from "@/lib/action";
import { actorOf, requireUser } from "@/lib/session";
import { updateSetting } from "@/services/settings";

export async function saveSetting(fd: FormData) {
  const u = await requireUser(["ADMIN"]);
  await attempt(safeBack(fd.get("back"), "/admin/settings"), async () => {
    const def = await updateSetting(actorOf(u), str(fd, "key"), str(fd, "value"));
    return `Saved: ${def.label}. New calculations will use the new value.`;
  });
}
