// Demo-grade session: a signed cookie holding the user id (COM-01 to COM-04).

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import type { Role } from "@/domain/state-machines";
import type { Actor } from "./audit";
import { prisma } from "./db";

const COOKIE = "ss_session";
const secret = () => process.env.SESSION_SECRET ?? "sewa-setu-poc";

function sign(v: string) {
  return createHmac("sha256", secret()).update(v).digest("base64url");
}

export async function setSession(userId: string) {
  (await cookies()).set(COOKIE, `${userId}.${sign(userId)}`, { httpOnly: true, sameSite: "lax", path: "/" });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function getSessionUser(): Promise<User | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  const id = raw.slice(0, i);
  const mac = raw.slice(i + 1);
  const expected = sign(id);
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return prisma.user.findUnique({ where: { id } });
}

export async function requireUser(roles?: Role[]): Promise<User> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  if (roles && !roles.includes(u.role as Role)) redirect(homeFor(u.role));
  return u;
}

export function actorOf(u: User): Actor {
  return { id: u.id, name: u.name, role: u.role };
}

export function homeFor(role: string): string {
  switch (role) {
    case "CITIZEN": return "/citizen";
    case "DPS":
    case "LINK_OFFICER": return "/dps";
    case "FAA":
    case "SAA": return "/authority";
    case "REGISTRAR":
    case "COMMISSIONER":
    case "CHIEF_COMMISSIONER": return "/commission";
    case "SEWA_SETU_DDO": return "/recovery";
    case "FINANCE_NODAL": return "/finance";
    case "FINANCE_SENIOR": return "/finance/escalations";
    case "COMPETENT_AUTHORITY": return "/competent";
    case "HEAD_OF_OFFICE": return "/hoo";
    case "CALL_CENTRE": return "/callcentre";
    case "DEALING_ASSISTANT": return "/verify";
    case "ADMIN": return "/admin";
    default: return "/";
  }
}

export const ROLE_LABELS: Record<string, string> = {
  CITIZEN: "Citizen",
  DPS: "Designated Public Servant (DPS)",
  LINK_OFFICER: "Link Officer",
  FAA: "First Appellate Authority (FAA)",
  SAA: "Second Appellate Authority (SAA)",
  REGISTRAR: "Registrar, RTPS Commission",
  COMMISSIONER: "Commissioner, RTPS Commission",
  CHIEF_COMMISSIONER: "Chief Commissioner, RTPS Commission",
  SEWA_SETU_DDO: "Sewa Setu Drawing and Disbursing Officer (DDO)",
  FINANCE_NODAL: "Finance nodal officer (ARTPS penalties)",
  FINANCE_SENIOR: "Finance senior officer",
  COMPETENT_AUTHORITY: "Competent Authority",
  HEAD_OF_OFFICE: "Head of Office",
  CALL_CENTRE: "Call Centre",
  DEALING_ASSISTANT: "Dealing Assistant",
  ADMIN: "Administrator",
  SYSTEM: "System",
};
