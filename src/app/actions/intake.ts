"use server";

import { attempt, safeBack, str } from "@/lib/action";
import { actorOf, requireUser } from "@/lib/session";
import { importExternal } from "@/services/intake";

export async function intakeImport(fd: FormData) {
  const u = await requireUser(["ADMIN"]);
  const no = str(fd, "applicationNo");
  await attempt(safeBack(fd.get("back"), "/admin/intake"), async () => {
    const r = await importExternal(actorOf(u), str(fd, "source"), no);
    return r.created
      ? `${no} is now in AMS. The citizen can sign in with the mobile number used in the service system and file the appeal.`
      : `${no} was already in AMS; its snapshot has been refreshed.`;
  });
}
