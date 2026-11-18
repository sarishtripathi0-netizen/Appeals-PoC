import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandName } from "@/components/Brand";
import { FeatureRef } from "@/components/ui";
import { prisma } from "@/lib/db";
import { getSessionUser, homeFor } from "@/lib/session";

const NAV = [
  { href: "/", label: "Home" },
  { href: "#about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "#officials", label: "Key Officials" },
];

/** A drop-down built on <details>, so it works without JavaScript. */
function Menu({ label, items, button }: { label: string; items: { href: string; label: string }[]; button?: boolean }) {
  return (
    <details className="relative">
      <summary className={`flex cursor-pointer list-none items-center gap-1 whitespace-nowrap ${button ? "rounded-md bg-accent-500 px-3 py-2 font-semibold shadow hover:bg-accent-600" : "px-1 py-2 hover:text-accent-400"}`}>
        {label} <span aria-hidden className="text-xs">▾</span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-60 rounded-md bg-white py-1 text-sm text-slate-800 shadow-xl">
        {items.map((i) => <Link key={i.label} href={i.href} className="block px-3 py-2 hover:bg-slate-100">{i.label}</Link>)}
      </div>
    </details>
  );
}

const DASHBOARDS = [
  { href: "/login", label: "Citizen dashboard" },
  { href: "/login/officer", label: "Officer dashboard" },
  { href: "/demo", label: "Demo scenarios" },
];
const LOGIN = [
  { href: "/login", label: "Citizen: mobile number and OTP" },
  { href: "/login/officer", label: "Officer: username and password" },
];

/** Illustrated heritage pavilion at dusk; stands in for a photograph. */
function HeroScene() {
  const arches = Array.from({ length: 7 }, (_, i) => 560 + i * 72);
  const upper = Array.from({ length: 5 }, (_, i) => 640 + i * 70);
  return (
    <svg aria-hidden viewBox="0 0 1600 700" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4d7698" />
          <stop offset="0.55" stopColor="#a9bccb" />
          <stop offset="1" stopColor="#e6d7b5" />
        </linearGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5f8a3f" />
          <stop offset="1" stopColor="#2c4d22" />
        </linearGradient>
        <linearGradient id="brick" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b06a48" />
          <stop offset="1" stopColor="#7d432c" />
        </linearGradient>
      </defs>
      <rect width="1600" height="700" fill="url(#sky)" />
      <g fill="#ffffff" opacity="0.35">
        <ellipse cx="300" cy="120" rx="160" ry="34" />
        <ellipse cx="1250" cy="90" rx="200" ry="40" />
        <ellipse cx="900" cy="170" rx="120" ry="24" />
      </g>
      <path d="M0 470 C120 420 220 440 320 430 S520 400 640 440 L960 440 C1080 405 1200 420 1320 410 S1520 430 1600 420 L1600 540 L0 540 Z" fill="#3f5f33" />
      <rect y="530" width="1600" height="170" fill="url(#ground)" />
      {/* Pavilion */}
      <g>
        <path d="M600 300 L1000 300 L1000 392 L600 392 Z" fill="url(#brick)" />
        <path d="M560 300 Q800 205 1040 300 Q800 270 560 300 Z" fill="#6f3a26" />
        <rect x="770" y="226" width="60" height="34" fill="#8d4f35" />
        <path d="M760 228 Q800 190 840 228 Z" fill="#6f3a26" />
        <path d="M540 392 L1060 392 L1060 545 L540 545 Z" fill="url(#brick)" />
        <rect x="530" y="384" width="540" height="12" fill="#6f3a26" />
        {arches.map((x) => <path key={x} d={`M${x} 545 L${x} 455 Q${x + 22} 420 ${x + 44} 455 L${x + 44} 545 Z`} fill="#2b1810" />)}
        {upper.map((x) => <path key={x} d={`M${x} 380 L${x} 335 Q${x + 15} 315 ${x + 30} 335 L${x + 30} 380 Z`} fill="#3a2015" />)}
        <path d="M1060 545 L1180 545 L1180 530 L1160 530 L1160 515 L1140 515 L1140 500 L1120 500 L1120 485 L1060 485 Z" fill="#9a6a52" />
      </g>
      {/* Trees */}
      <g fill="#24451d">
        <circle cx="120" cy="470" r="110" /><circle cx="250" cy="500" r="90" /><circle cx="40" cy="520" r="80" />
        <circle cx="1440" cy="470" r="105" /><circle cx="1330" cy="510" r="80" /><circle cx="1560" cy="500" r="90" />
      </g>
      <g fill="#355f28">
        <circle cx="190" cy="420" r="70" /><circle cx="1390" cy="420" r="70" /><circle cx="420" cy="540" r="55" /><circle cx="1240" cy="545" r="50" />
      </g>
      <rect x="160" y="520" width="16" height="70" fill="#3b2a1d" /><rect x="1420" y="520" width="16" height="70" fill="#3b2a1d" />
    </svg>
  );
}

export default async function Landing() {
  const u = await getSessionUser();
  if (u) redirect(homeFor(u.role));
  const [services, officials] = await Promise.all([
    prisma.service.findMany({ orderBy: { name: "asc" }, take: 6, include: { department: true } }),
    prisma.user.findMany({ where: { role: { in: ["CHIEF_COMMISSIONER", "COMMISSIONER", "REGISTRAR"] } }, orderBy: { role: "asc" } }),
  ]);
  const rank = (r: string) => ["CHIEF_COMMISSIONER", "COMMISSIONER", "REGISTRAR"].indexOf(r);
  officials.sort((a, b) => rank(a.role) - rank(b.role));

  return (
    <div className="-mt-5">
      {/* Full-width hero with the header laid over it */}
      <section className="relative left-1/2 -ml-[50vw] w-screen overflow-hidden text-white">
        <HeroScene />
        <div className="absolute inset-0 bg-black/45" />
        <div className="relative">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
            <Link href="/" aria-label="Sewa Setu home"><BrandName subtitle="A Comprehensive Citizen Platform" /></Link>
            <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-base font-medium sm:text-lg">
              {NAV.map((n) => <Link key={n.label} href={n.href} className="hidden py-2 hover:text-accent-400 lg:inline">{n.label}</Link>)}
              <span className="hidden lg:inline"><Menu label="Dashboard" items={DASHBOARDS} /></span>
              <span className="lg:hidden"><Menu label="Menu" items={[...NAV.slice(1).map((n) => ({ ...n })), ...DASHBOARDS]} /></span>
              <Menu label="Login/ Register" items={LOGIN} button />
            </nav>
          </div>
          <div className="mx-auto max-w-5xl px-4 pt-16 pb-24 text-center sm:pt-24 sm:pb-32">
            <h1 className="text-4xl leading-tight font-extrabold tracking-tight drop-shadow sm:text-6xl lg:text-7xl">
              Welcome to <span className="text-accent-500">Sewa Setu</span>
            </h1>
            <p className="mx-auto mt-4 max-w-3xl text-lg drop-shadow sm:text-2xl">Empowering Citizens of Assam with Seamless Access to Government Services</p>
            <form action="/services" className="mx-auto mt-10 flex max-w-4xl items-center overflow-hidden rounded-md border-2 border-white/70 bg-white shadow-lg" role="search">
              <label htmlFor="q" className="sr-only">Search services</label>
              <input id="q" name="q" placeholder="Looking for a particular service? Search here..." className="min-w-0 flex-1 px-5 py-4 text-base text-slate-800 placeholder:text-slate-500 focus:outline-none sm:text-lg" />
              <button aria-label="Search" className="cursor-pointer px-5 py-4 text-slate-600 hover:text-accent-600">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" /></svg>
              </button>
            </form>
          </div>
        </div>
      </section>

      <div className="mt-6"><FeatureRef ids={["COM-01", "COM-02", "COM-06"]} /></div>

      <section id="about" className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="text-2xl font-bold text-slate-900">Appeals under the Assam Right to Public Services Act</h2>
          <p className="mt-2 text-slate-700">
            If a notified service is not delivered within its time limit, or your application is rejected, you can appeal. Sewa Setu drafts the appeal for you
            when the time limit passes, and tracks it through the First and Second Appellate Authorities and the ARTPS Commission, up to delivery of the service
            and any penalty on the officer responsible.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Link href="/login" className="card border-t-4 border-t-accent-500 hover:shadow-md">
              <div className="h2">Citizen sign-in</div>
              <p className="muted mt-1">With your mobile number and a one-time password (OTP).</p>
            </Link>
            <Link href="/login/officer" className="card border-t-4 border-t-brand-600 hover:shadow-md">
              <div className="h2">Officer sign-in</div>
              <p className="muted mt-1">Username, password and a second factor.</p>
            </Link>
          </div>
        </div>
        <div className="card self-start border-amber-300 bg-amber-50">
          <div className="font-semibold">Presenting a demo?</div>
          <p className="mt-1 text-sm">Use the <strong>Switch role</strong> list in the yellow bar to become any seeded user, or open <Link className="underline" href="/demo">Demo scenarios</Link>.</p>
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-2">
          <h2 className="text-2xl font-bold text-slate-900">Services</h2>
          <Link href="/services" className="text-sm font-medium text-brand-700 hover:underline">All services →</Link>
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <Link key={s.code} href={`/services?q=${encodeURIComponent(s.name)}`} className="card hover:shadow-md">
              <div className="font-semibold text-slate-900">{s.name}</div>
              <p className="muted mt-1">{s.department.name}</p>
              <p className="mt-2 text-sm"><span className="rounded bg-accent-500/15 px-2 py-0.5 font-medium text-accent-600">{s.timeLimitWorkingDays} working days</span></p>
            </Link>
          ))}
        </div>
      </section>

      <section id="officials" className="mt-10">
        <h2 className="text-2xl font-bold text-slate-900">Key Officials</h2>
        <p className="muted">ARTPS Commission (fictional names for this demonstration)</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {officials.map((o) => (
            <div key={o.id} className="card text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-xl font-bold text-brand-700">
                {o.name.replace(" (Demo)", "").split(" ").map((w) => w[0]).slice(0, 2).join("")}
              </div>
              <div className="mt-2 font-semibold">{o.name.replace(" (Demo)", "")}</div>
              <div className="muted">{o.designation}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
