// UIN and appeal numbers. Appeal number = UIN + level code (AMS-27).

import type { Level } from "./settings";

export function formatUin(serviceCode: string, year: number, seq: number): string {
  return `RTPS-${serviceCode}/${year}/${String(seq).padStart(6, "0")}`;
}

export function appealNumber(uin: string, level: Level): string {
  return `${uin}-${level}`;
}

export function orderNumber(appealNo: string, seq: number): string {
  return `${appealNo}/ORD-${seq}`;
}

export const LEVEL_NAMES: Record<Level, string> = {
  FAA: "First appeal (First Appellate Authority)",
  SAA: "Second appeal (Second Appellate Authority)",
  TAA: "Third appeal (RTPS Commission)",
};
