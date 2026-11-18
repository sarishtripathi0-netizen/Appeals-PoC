"use client";

import { switchUser } from "@/app/actions/session";

type Opt = { id: string; label: string; group: string };

export function RoleSwitcher({ options, currentId }: { options: Opt[]; currentId?: string }) {
  const groups = [...new Set(options.map((o) => o.group))];
  return (
    <form action={switchUser} className="flex items-center gap-1">
      <label htmlFor="role-switch" className="text-xs font-medium whitespace-nowrap">Switch role:</label>
      <select
        id="role-switch"
        name="userId"
        defaultValue={currentId ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="max-w-[16rem] rounded border border-amber-300 bg-white px-1 py-0.5 text-xs text-slate-900"
      >
        <option value="" disabled>Choose a demo user…</option>
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {options.filter((o) => o.group === g).map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <noscript><button className="btn-secondary btn-sm">Go</button></noscript>
    </form>
  );
}
