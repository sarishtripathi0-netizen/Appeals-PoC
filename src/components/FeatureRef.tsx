"use client";

import { useState } from "react";

/** Small, dismissible tag mapping a screen to requirement IDs. Hidden everywhere by the header toggle. */
export function FeatureRefTag({ ids, note }: { ids: string[]; note?: string }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="no-print mb-3 inline-flex max-w-full items-start gap-2 rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-900">
      <span className="font-semibold">Feature reference:</span>
      <span className="break-words">
        {ids.join(", ")}
        {note ? <span className="text-indigo-700"> — {note}</span> : null}
      </span>
      <button type="button" aria-label="Dismiss feature reference" onClick={() => setOpen(false)} className="ml-1 cursor-pointer font-bold text-indigo-500 hover:text-indigo-800">
        ×
      </button>
    </div>
  );
}
