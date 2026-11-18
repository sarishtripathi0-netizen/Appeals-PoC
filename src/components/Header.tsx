import { cookies } from "next/headers";
import Link from "next/link";
import { signOut, toggleFeatureRefs } from "@/app/actions/session";
import { BrandName, GovStrip } from "@/components/Brand";
import { getT, type Key } from "@/i18n";
import { getSessionUser, homeFor, ROLE_LABELS } from "@/lib/session";
import { currentUrl } from "@/lib/url";

type NavItem = { href: string; label: string };

function navFor(role: string, t: (k: Key) => string): NavItem[] {
  switch (role) {
    case "CITIZEN":
      return [{ href: "/citizen", label: t("nav.home") }, { href: "/citizen/services", label: t("nav.services") }];
    case "DPS":
    case "LINK_OFFICER":
      return [{ href: "/dps", label: "Worklist" }, { href: "/dps/appeals", label: "Appeals and directions" }, { href: "/penalties", label: "My penalties" }];
    case "FAA":
    case "SAA":
      return [{ href: "/authority", label: "Dashboard" }, { href: "/authority/worklist", label: "Appeals worklist" }, { href: "/authority/hearings", label: "Hearings calendar" }, { href: "/penalties", label: "My penalties" }];
    case "REGISTRAR":
    case "COMMISSIONER":
    case "CHIEF_COMMISSIONER":
      return [{ href: "/commission", label: "Dashboard" }, { href: "/commission/cases", label: "Cases" }, { href: "/commission/register", label: "Register for review" }, { href: "/commission/penalties", label: "Penalty ledger" }];
    case "HEAD_OF_OFFICE":
      return [{ href: "/hoo", label: "Dashboard" }, { href: "/hoo/handover", label: "Link Officer handover" }];
    case "SEWA_SETU_DDO":
      return [{ href: "/recovery", label: "Recovery workbench" }];
    case "FINANCE_NODAL":
      return [{ href: "/finance", label: "Recovery tickets" }];
    case "FINANCE_SENIOR":
      return [{ href: "/finance/escalations", label: "Escalations" }];
    case "COMPETENT_AUTHORITY":
      return [{ href: "/competent", label: "For signature" }];
    case "CALL_CENTRE":
      return [{ href: "/callcentre", label: "Call centre" }];
    case "DEALING_ASSISTANT":
      return [{ href: "/verify", label: "Document checks" }];
    case "ADMIN":
      return [{ href: "/admin", label: "Clock" }, { href: "/admin/settings", label: "Rules and switches" }, { href: "/admin/masters", label: "Masters" }, { href: "/admin/staff", label: "Staff records (demo)" }, { href: "/admin/mdm", label: "Master data (MDM)" }, { href: "/admin/hr", label: "Officers (HR)" }, { href: "/admin/intake", label: "Appeals intake" }];
    default:
      return [];
  }
}

export async function Header() {
  const [{ lang, t }, user, back, store] = await Promise.all([getT(), getSessionUser(), currentUrl(), cookies()]);
  const frefOff = store.get("fref")?.value === "off";
  const nav = user ? navFor(user.role, t) : [];
  // The signed-out front page draws its own header over the hero image.
  if (!user && back.split("?")[0] === "/") return <GovStrip lang={lang} back={back} />;
  return (
    <header className="no-print bg-brand-800 text-white">
      <GovStrip lang={lang} back={back} />
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4">
        <Link href={user ? homeFor(user.role) : "/"} className="min-w-0">
          <BrandName subtitle={`${t("brand.subtitle")} · Appeal Management (POC)`} />
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <form action={toggleFeatureRefs}>
            <input type="hidden" name="back" value={back} />
            <button className="cursor-pointer rounded border border-brand-100/40 px-2 py-1 hover:bg-brand-700">{frefOff ? t("fref.show") : t("fref.hide")}</button>
          </form>
          {user ? (
            <form action={signOut}>
              <button className="cursor-pointer rounded border border-brand-100/40 px-2 py-1 hover:bg-brand-700">{t("nav.signout")}</button>
            </form>
          ) : (
            <Link href="/login" className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-600">Login/ Register</Link>
          )}
        </div>
      </div>
      {user ? (
        <div className="border-t border-brand-700">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-sm sm:px-4">
            <nav className="-mx-1 flex gap-1 overflow-x-auto">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className="rounded px-2 py-1 whitespace-nowrap hover:bg-brand-700">{n.label}</Link>
              ))}
            </nav>
            <div className="text-xs text-brand-100">
              {user.name} · {ROLE_LABELS[user.role]}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
