import type { DocContent } from "@/services/documents";
import { PrintButton } from "./PrintButton";

/** HTML rendering of a printable document, with Print and Download PDF buttons. */
export function DocView({ doc, pdfHref }: { doc: DocContent; pdfHref: string }) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-3 flex flex-wrap gap-2">
        <a href={pdfHref} className="btn-primary" data-testid="download-pdf">Download PDF</a>
        <PrintButton />
      </div>
      <article className="card relative overflow-hidden">
        {doc.watermark ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-5xl font-bold text-slate-200 rotate-[-25deg] select-none">{doc.watermark}</div> : null}
        <div className="relative">
          <div className="text-xs font-semibold tracking-wide text-brand-700 uppercase">Government of Assam · Sewa Setu</div>
          <h1 className="h1 mt-1">{doc.title}</h1>
          {doc.subtitle ? <p className="muted">{doc.subtitle}</p> : null}
          <hr className="my-3 border-slate-200" />
          {doc.sections.map((s, i) => (
            <section key={i} className="mb-4">
              {s.heading ? <h2 className="mb-2 font-semibold text-brand-700">{s.heading}</h2> : null}
              {s.rows ? (
                <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[14rem_1fr]">
                  {s.rows.map(([k, v], j) => (
                    <div key={j} className="contents"><dt className="text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>
                  ))}
                </dl>
              ) : null}
              {s.paragraphs?.map((p, j) => <p key={j} className="mb-1 text-sm whitespace-pre-line">{p}</p>)}
            </section>
          ))}
          {doc.footer ? <p className="mt-4 text-xs text-slate-500">{doc.footer}</p> : null}
        </div>
      </article>
    </div>
  );
}
