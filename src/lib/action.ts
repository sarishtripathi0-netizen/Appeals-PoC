// Runs a server action and redirects back with a plain-language message (?ok= or ?err=).

import { redirect } from "next/navigation";
import { DomainError } from "@/services/errors";

export function safeBack(v: FormDataEntryValue | null, fallback = "/"): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : fallback;
}

export function withParam(path: string, key: string, value: string): string {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.delete("ok");
  params.delete("err");
  params.set(key, value);
  return `${base}?${params.toString()}`;
}

export async function attempt(back: string, fn: () => Promise<string | void>, nextPath?: (ok: string) => string): Promise<never> {
  let target: string;
  try {
    const ok = (await fn()) || "Done.";
    target = withParam(nextPath ? nextPath(ok) : back, "ok", ok);
  } catch (e) {
    if (e instanceof DomainError) target = withParam(back, "err", e.message);
    else throw e;
  }
  redirect(target);
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}
