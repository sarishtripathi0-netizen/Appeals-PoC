import { file } from "@/app/actions/appeals";
import { HiddenBack } from "@/components/ui";
import { formatDate } from "@/domain/dates";

/** Edit-and-file form (AMS-21, 28). Shows the late-filing reason box only when the window has passed. */
export function FileAppealForm({ applicationId, level = "FAA", ground, groundsText, reliefSought, lateSince, back, label = "File the appeal" }: {
  applicationId: string; level?: string; ground?: string; groundsText: string; reliefSought: string; lateSince?: string | null; back: string; label?: string;
}) {
  return (
    <form action={file} className="space-y-2">
      <HiddenBack value={back} />
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="level" value={level} />
      {ground ? <input type="hidden" name="ground" value={ground} /> : null}
      <div>
        <label className="label" htmlFor="groundsText">Grounds of appeal</label>
        <textarea id="groundsText" name="groundsText" rows={4} className="input" defaultValue={groundsText} required />
      </div>
      <div>
        <label className="label" htmlFor="reliefSought">What you are asking for</label>
        <textarea id="reliefSought" name="reliefSought" rows={2} className="input" defaultValue={reliefSought} required />
      </div>
      {lateSince ? (
        <div>
          <label className="label" htmlFor="lateReason">The filing window closed on {formatDate(lateSince)}. Why is the appeal late?</label>
          <textarea id="lateReason" name="lateReason" rows={2} className="input" required />
          <p className="muted mt-1">The authority will first decide whether to accept this reason.</p>
        </div>
      ) : null}
      <button className="btn-primary">{label}</button>
    </form>
  );
}
