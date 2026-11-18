"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { otpProvider, secondFactor } from "@/adapters";
import { safeBack, str, withParam } from "@/lib/action";
import { audit } from "@/lib/audit";
import { getToday } from "@/lib/context";
import { prisma } from "@/lib/db";
import { actorOf, clearSession, homeFor, setSession } from "@/lib/session";

export async function sendOtp(fd: FormData) {
  const mobile = str(fd, "mobile").replace(/\D/g, "");
  if (!/^[6-9]\d{9}$/.test(mobile)) redirect(withParam("/login", "err", "Please enter a 10-digit mobile number."));
  redirect(`/login?mobile=${mobile}&sent=1`);
}

export async function verifyOtp(fd: FormData) {
  const mobile = str(fd, "mobile");
  const otp = str(fd, "otp");
  const today = await getToday();
  if (!otpProvider.verify(mobile, today, otp)) redirect(withParam(`/login?mobile=${mobile}&sent=1`, "err", "That OTP is not correct. Please check and try again."));
  let user = await prisma.user.findFirst({ where: { mobile, role: "CITIZEN" } });
  if (!user) user = await prisma.user.create({ data: { id: `u-cit-${mobile}`, name: `Citizen ${mobile.slice(-4)}`, role: "CITIZEN", mobile } });
  await setSession(user.id);
  await audit(prisma, today, { actor: actorOf(user), action: "session.signIn", entityType: "user", entityId: user.id, details: { method: "OTP (mock)" } });
  redirect(homeFor(user.role));
}

export async function officerPassword(fd: FormData) {
  const username = str(fd, "username");
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || user.password !== str(fd, "password")) redirect(withParam("/login/officer", "err", "The username or password is not correct."));
  redirect(`/login/officer?username=${encodeURIComponent(username)}&step=2`);
}

export async function officerSecondFactor(fd: FormData) {
  const username = str(fd, "username");
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !secondFactor.verify(username, str(fd, "code")))
    redirect(withParam(`/login/officer?username=${encodeURIComponent(username)}&step=2`, "err", "That code is not correct."));
  await setSession(user.id);
  await audit(prisma, await getToday(), { actor: actorOf(user), action: "session.signIn", entityType: "user", entityId: user.id, details: { method: "Password + second factor (mock)" } });
  redirect(homeFor(user.role));
}

/** Demo role switcher (COM-06): jump straight to any seeded user. */
export async function switchUser(fd: FormData) {
  const id = str(fd, "userId");
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) redirect("/");
  await setSession(user.id);
  redirect(safeBack(fd.get("target"), homeFor(user.role)));
}

export async function signOut() {
  await clearSession();
  redirect("/login");
}

export async function setLanguage(fd: FormData) {
  (await cookies()).set("lang", str(fd, "lang") === "as" ? "as" : "en", { path: "/" });
  redirect(safeBack(fd.get("back")));
}

export async function toggleFeatureRefs(fd: FormData) {
  const store = await cookies();
  store.set("fref", store.get("fref")?.value === "off" ? "on" : "off", { path: "/" });
  redirect(safeBack(fd.get("back")));
}
