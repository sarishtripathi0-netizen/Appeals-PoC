// Editing rules and switches (AMS-127, AMS-128). Changes apply to new calculations only and are audited.

import { SETTING_DEFS, type SettingDef } from "@/domain/settings";
import { audit, type Actor } from "@/lib/audit";
import { getToday } from "@/lib/context";
import { parseJson, prisma } from "@/lib/db";
import { DomainError } from "./errors";

/** Turns the text from the form into the stored value, or explains what is wrong. */
export function parseSettingValue(def: SettingDef, raw: string): unknown {
  const text = raw.trim();
  switch (def.kind) {
    case "number": {
      const n = Number(text);
      if (!text || !Number.isFinite(n) || n < 0) throw new DomainError(`${def.label}: enter a number of zero or more.`);
      return n;
    }
    case "basis":
    case "option": {
      const opt = def.options?.find((o) => String(o.value) === text);
      if (!opt) throw new DomainError(`${def.label}: choose one of the options.`);
      return opt.value;
    }
    case "json": {
      const v = parseJson<unknown>(text, undefined);
      if (v === undefined) throw new DomainError(`${def.label}: this is not valid. Keep the same format as the current value.`);
      return v;
    }
    case "text":
      if (!text) throw new DomainError(`${def.label}: this cannot be empty.`);
      return text;
  }
}

export async function updateSetting(actor: Actor, key: string, raw: string) {
  if (actor.role !== "ADMIN") throw new DomainError("Only the administrator can change rules and switches.");
  const def = SETTING_DEFS.find((d) => d.key === key);
  if (!def) throw new DomainError("Unknown setting.");
  const value = parseSettingValue(def, raw);
  const before = await prisma.setting.findUnique({ where: { key } });
  const today = await getToday();
  await prisma.setting.update({ where: { key }, data: { value: JSON.stringify(value) } });
  await audit(prisma, today, { actor, action: "setting.change", entityType: "setting", entityId: key, before: before?.value ?? null, after: JSON.stringify(value), details: { label: def.label } });
  return def;
}
