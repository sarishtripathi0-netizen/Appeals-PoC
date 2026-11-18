import { headers } from "next/headers";

/** Current path + query, without the flash parameters. */
export async function currentUrl(): Promise<string> {
  const raw = (await headers()).get("x-url") ?? "/";
  const [base, q = ""] = raw.split("?");
  const p = new URLSearchParams(q);
  p.delete("ok");
  p.delete("err");
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}
