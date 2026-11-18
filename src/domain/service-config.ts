// Notified particulars of a service, held as data on the Service master: documents the system can fetch from
// Government records, alternative documents, a live photograph, and the internal steps every application goes through.
// Pure functions, so the rules can be unit-tested without a database.

/** A fact the system may confirm from Government records instead of asking for a document. */
export type FactKey = "DOB" | "RESIDENCE" | "FATHER_SC_CERT" | "RELATIONSHIP";

export type DocItem = {
  name: string;
  mandatory: boolean;
  /** If the system confirms this fact from records, no upload is needed. */
  fetch?: FactKey;
  /** Items sharing a group are alternatives: one of them is required. */
  group?: string;
  /** Captured live at the time of application (never uploaded). */
  live?: boolean;
  help?: string;
};

export type FormField = { key: string; label: string; required: boolean; help?: string };

export type StepCode = "DA_VERIFY" | "DPS_DECISION";

export type Fee = { label: string; amount: number };

export const STEPS: Record<StepCode, { label: string; role: string; waitingText: string }> = {
  DA_VERIFY: { label: "Document check by the Dealing Assistant", role: "DEALING_ASSISTANT", waitingText: "With the Dealing Assistant for the document check" },
  DPS_DECISION: { label: "Decision and issue by the DPS", role: "DPS", waitingText: "With the DPS for decision" },
};

export function nextStep(workflow: StepCode[], current: string | null): StepCode | null {
  const i = workflow.indexOf(current as StepCode);
  return i >= 0 && i < workflow.length - 1 ? workflow[i + 1] : null;
}

/** Facts confirmed from Government records at the system check (before any officer sees the application). */
export type SystemCheck = {
  sources: Partial<Record<FactKey, string>>; // fact -> record it came from, e.g. "Aadhaar"
  notes: string[];
};

export type DocStatus = "FETCHED" | "ATTACHED" | "MISSING" | "NOT_NEEDED" | "OPTIONAL";

/** What each checklist item needs, given what the system fetched and what the citizen attached. */
export function checklistStatus(items: DocItem[], check: SystemCheck | null, attached: Set<string>) {
  const fetched = (i: DocItem) => !!i.fetch && !!check?.sources[i.fetch];
  const groupsSatisfied = new Set(items.filter((i) => i.group && (fetched(i) || attached.has(i.name))).map((i) => i.group!));
  const rows = items.map((i) => {
    let status: DocStatus;
    if (fetched(i)) status = "FETCHED";
    else if (attached.has(i.name)) status = "ATTACHED";
    else if (i.group && groupsSatisfied.has(i.group)) status = "NOT_NEEDED";
    else status = i.mandatory || i.group ? "MISSING" : "OPTIONAL";
    return { item: i, status };
  });
  return { rows, complete: rows.every((r) => r.status !== "MISSING") };
}

export function totalFee(fees: Fee[]): number {
  return fees.reduce((s, f) => s + f.amount, 0);
}
