"use server";

import { attempt, safeBack } from "@/lib/action";
import { actorOf, requireUser } from "@/lib/session";
import { pullHrEvents } from "@/services/hr";

export async function hrEvents(fd: FormData) {
  const u = await requireUser(["ADMIN"]);
  await attempt(safeBack(fd.get("back"), "/admin/hr"), async () => {
    const r = await pullHrEvents(actorOf(u));
    return r.received ? `${r.received} new HR event(s); last event id ${r.lastId}.` : `No new HR events (last event id ${r.lastId}).`;
  });
}
