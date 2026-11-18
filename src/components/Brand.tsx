// Sewa Setu portal look: the dark "Government of Assam" strip and the brand mark.
// The mark is a placeholder; the official emblem and logo are not reproduced in this POC.

import Link from "next/link";
import { setLanguage } from "@/app/actions/session";

/** Tricolour flag, drawn in CSS. */
function Flag() {
  return (
    <span aria-hidden className="inline-flex h-3 w-5 flex-col overflow-hidden rounded-[1px]">
      <span className="flex-1 bg-[#ff9933]" />
      <span className="flex-1 bg-white" />
      <span className="flex-1 bg-[#138808]" />
    </span>
  );
}

export function GovStrip({ lang, back }: { lang: string; back: string }) {
  return (
    <div className="no-print bg-gov-900 text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-1.5 text-xs sm:px-4 sm:text-sm">
        <span className="flex items-center gap-2 font-medium tracking-wide"><Flag /> GOVERNMENT OF ASSAM</span>
        <div className="flex items-center gap-1">
          <a href="#main" className="hidden rounded px-2 py-1 hover:bg-white/10 sm:inline">Skip to Main Content</a>
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-1 rounded bg-white/10 px-2 py-1 hover:bg-white/20">
              <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.2-8.6" strokeLinecap="round" /></svg>
              Track <span aria-hidden>▾</span>
            </summary>
            <div className="absolute right-0 z-30 mt-1 w-56 rounded-md bg-white py-1 text-sm text-slate-800 shadow-lg">
              <Link href="/login" className="block px-3 py-2 hover:bg-slate-100">Track an application</Link>
              <Link href="/login" className="block px-3 py-2 hover:bg-slate-100">Track an appeal</Link>
            </div>
          </details>
          <form action={setLanguage}>
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="lang" value={lang === "en" ? "as" : "en"} />
            <button className="cursor-pointer rounded px-2 py-1 hover:bg-white/10" title={lang === "en" ? "Switch to Assamese (draft translation)" : "Switch to English"}>
              {lang === "en" ? "English" : "অসমীয়া"} <span aria-hidden>⇄</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/** Round placeholder mark in the portal's blue, green and orange. */
export function BrandMark({ size = 56 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="shrink-0 drop-shadow">
      <circle cx="32" cy="32" r="31" fill="white" />
      <circle cx="32" cy="32" r="27" fill="none" stroke="#1d4f91" strokeWidth="2" />
      <circle cx="32" cy="19" r="5" fill="#1d4f91" />
      <path d="M16 44c6-12 26-12 32 0" fill="none" stroke="#f7931e" strokeWidth="4" strokeLinecap="round" />
      <path d="M20 37c4-8 20-8 24 0" fill="none" stroke="#138808" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M32 26v10" stroke="#1d4f91" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function BrandName({ subtitle }: { subtitle: string }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <BrandMark />
      <span className="min-w-0">
        <span className="block text-2xl leading-none font-extrabold tracking-tight sm:text-[2rem]">Sewa Setu</span>
        <span className="mt-1 block truncate text-xs font-semibold sm:text-sm">{subtitle}</span>
      </span>
    </span>
  );
}
