// Loads the simulated "today", the rules and the working-day calendar.

import { makeCalendar, type Calendar } from "@/domain/calendar";
import { mergeSettings, type Settings } from "@/domain/settings";
import { type Db, parseJson, prisma } from "./db";

export type RuleContext = { today: string; settings: Settings; cal: Calendar };

export async function getToday(db: Db = prisma): Promise<string> {
  const c = await db.clockState.findUnique({ where: { id: 1 } });
  return c?.today ?? "2026-11-02";
}

export async function getSettings(db: Db = prisma): Promise<Settings> {
  const rows = await db.setting.findMany();
  const stored: Record<string, unknown> = {};
  for (const r of rows) stored[r.key] = parseJson(r.value, undefined);
  return mergeSettings(stored);
}

export async function getCalendar(db: Db = prisma, settings?: Settings): Promise<Calendar> {
  const s = settings ?? (await getSettings(db));
  const holidays = await db.holiday.findMany({ select: { date: true } });
  return makeCalendar(holidays.map((h) => h.date), s.offSaturdays);
}

export async function getRuleContext(db: Db = prisma): Promise<RuleContext> {
  const settings = await getSettings(db);
  const [today, cal] = await Promise.all([getToday(db), getCalendar(db, settings)]);
  return { today, settings, cal };
}
