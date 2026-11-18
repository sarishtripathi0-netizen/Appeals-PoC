// Notification log standing in for SMS, email and dashboard alerts (COM-08, AMS-130).

import { messagingGateway } from "@/adapters";
import { type Db, nextSeq } from "./db";

export type Channel = "SMS" | "EMAIL" | "DASHBOARD";

export type NotifyOpts = {
  channels?: Channel[];
  entityType?: string;
  entityId?: string;
  caseRef?: string | null;
};

export async function notifyUser(db: Db, today: string, userId: string, text: string, opts: NotifyOpts = {}) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const channels = opts.channels ?? ["DASHBOARD", "SMS", "EMAIL"];
  for (const channel of channels) {
    const address = channel === "SMS" ? user.mobile : channel === "EMAIL" ? user.email : null;
    if (channel !== "DASHBOARD" && !address) continue;
    if (channel !== "DASHBOARD") await messagingGateway.send({ channel, address: address!, text });
    await db.notification.create({
      data: {
        recipientId: user.id,
        recipientLabel: `${user.name}${user.designation ? `, ${user.designation}` : ""}`,
        channel,
        address,
        text,
        sentOn: today,
        seq: await nextSeq(db, "notification"),
        entityType: opts.entityType,
        entityId: opts.entityId,
        caseRef: opts.caseRef ?? null,
      },
    });
  }
}

/** A message to an office mailbox rather than a person (e.g. a copy of an order to the public authority). */
export async function notifyAddress(db: Db, today: string, label: string, address: string, text: string, opts: NotifyOpts = {}) {
  await messagingGateway.send({ channel: "EMAIL", address, text });
  await db.notification.create({
    data: {
      recipientId: null, recipientLabel: label, channel: "EMAIL", address, text, sentOn: today, seq: await nextSeq(db, "notification"),
      entityType: opts.entityType, entityId: opts.entityId, caseRef: opts.caseRef ?? null,
    },
  });
}

export async function notifyMany(db: Db, today: string, userIds: (string | null | undefined)[], text: string, opts: NotifyOpts = {}) {
  const unique = [...new Set(userIds.filter((u): u is string => !!u))];
  for (const id of unique) await notifyUser(db, today, id, text, opts);
}
