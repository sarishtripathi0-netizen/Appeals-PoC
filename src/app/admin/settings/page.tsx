import { saveSetting } from "@/app/actions/settings";
import { Badge, Card, FeatureRef, Flash, HiddenBack, PageHeader, type SP } from "@/components/ui";
import { SETTING_DEFS, type SettingDef } from "@/domain/settings";
import { getSettings } from "@/lib/context";
import { requireUser } from "@/lib/session";
import { currentUrl } from "@/lib/url";

function asText(value: unknown): string {
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function Field({ def, value }: { def: SettingDef; value: unknown }) {
  const id = `s-${def.key}`;
  if (def.options) {
    return (
      <select id={id} name="value" defaultValue={String(value)} className="input max-w-sm" aria-label={def.label}>
        {def.options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    );
  }
  if (def.kind === "number") return <input id={id} name="value" type="number" min={0} step="any" defaultValue={String(value)} className="input max-w-[10rem]" aria-label={def.label} />;
  return <input id={id} name="value" defaultValue={asText(value)} className="input" aria-label={def.label} />;
}

export default async function AdminSettings({ searchParams }: { searchParams: SP }) {
  await requireUser(["ADMIN"]);
  const [s, back] = await Promise.all([getSettings(), currentUrl()]);
  const categories = [...new Set(SETTING_DEFS.map((d) => d.category))];
  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-127", "AMS-128"]} />
      <PageHeader title="Rules and switches" subtitle="Every time limit, window and threshold is a setting, not code. Running cases keep the deadlines already worked out; new calculations use the new value. Every change is recorded in the audit log." />
      <Flash searchParams={searchParams} />
      {categories.map((c) => (
        <Card key={c} title={c}>
          <div className="space-y-4 text-sm">
            {SETTING_DEFS.filter((d) => d.category === c).map((d) => (
              <form key={d.key} action={saveSetting} className="grid gap-1 sm:grid-cols-[1fr_auto] sm:items-end">
                <HiddenBack value={back} />
                <input type="hidden" name="key" value={d.key} />
                <div>
                  <label className="font-medium" htmlFor={`s-${d.key}`}>{d.label} {d.isSwitch ? <Badge tone="purple">open point</Badge> : null}</label>
                  {d.description ? <div className="mb-1 text-slate-500">{d.description}</div> : null}
                  <Field def={d} value={s[d.key]} />
                </div>
                <button className="btn-secondary btn-sm">Save</button>
              </form>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
