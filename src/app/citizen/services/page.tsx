import Link from "next/link";
import { Card, FeatureRef, PageHeader } from "@/components/ui";
import { STEPS, totalFee } from "@/domain/service-config";
import { getT } from "@/i18n";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { rupees } from "@/lib/view";
import { configOf } from "@/services/applications";

export default async function Services() {
  await requireUser(["CITIZEN", "CALL_CENTRE"]);
  const { t } = await getT();
  const settings = await prisma.setting.findMany({ where: { key: { in: ["faaDecisionDays", "saaDecisionDays"] } } });
  const defaults = Object.fromEntries(settings.map((s) => [s.key, Number(JSON.parse(s.value))]));
  const services = await prisma.service.findMany({ include: { department: true }, orderBy: { name: "asc" } });
  return (
    <div>
      <FeatureRef ids={["AMS-01", "AMS-03"]} />
      <PageHeader title={t("services.title")} subtitle={t("services.intro")} />
      <div className="grid gap-4 sm:grid-cols-2">
        {services.map((s) => {
          const cfg = configOf(s);
          const fee = totalFee(cfg.fees);
          return (
            <Card key={s.code} title={s.name}>
              <p className="text-sm text-slate-700">{s.purpose}</p>
              <p className="mt-2 text-sm"><strong>{t("citizen.timeLimit")}:</strong> {s.timeLimitWorkingDays} {t("citizen.workingDays")}{fee ? <> · <strong>Fee:</strong> {rupees(fee)}</> : null}</p>
              <p className="text-xs text-slate-500">{s.department.name}</p>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-brand-700">{t("docs.title")} ({cfg.docs.length})</summary>
                <ul className="mt-1 ml-5 list-disc">
                  {cfg.docs.map((d) => (
                    <li key={d.name}>
                      {d.name}
                      {d.live ? " (captured live, no upload)" : d.fetch ? " (only if the system cannot fetch it)" : d.group ? " (or its alternative)" : d.mandatory ? "" : ` (${t("docs.optional")})`}
                    </li>
                  ))}
                </ul>
              </details>
              {cfg.eligibility.length || cfg.workflow.length || s.notificationRef ? (
                <details className="mt-1 text-sm">
                  <summary className="cursor-pointer text-brand-700">Eligibility, processing and appeals</summary>
                  {cfg.eligibility.length ? <ul className="mt-1 ml-5 list-disc">{cfg.eligibility.map((e, i) => <li key={i}>{e}</li>)}</ul> : null}
                  {cfg.workflow.length ? <p className="mt-2"><strong>Processing:</strong> system check against Government records (same day) → {cfg.workflow.map((w) => STEPS[w].label.toLowerCase()).join(" → ")}.</p> : null}
                  {cfg.fees.length ? <p className="mt-1"><strong>Fees:</strong> {cfg.fees.map((f) => `${f.label} ${rupees(f.amount)}`).join("; ")}.</p> : null}
                  {s.maxReverts != null ? <p className="mt-1"><strong>Reverts:</strong> if something is deficient, the application comes back to you with the reason and the time limit pauses; at most {s.maxReverts} times.</p> : null}
                  <p className="mt-1"><strong>Appeals:</strong> First Appellate Authority ({s.faaDays ?? defaults.faaDecisionDays} working days), Second Appellate Authority ({s.saaDays ?? defaults.saaDecisionDays} working days), then the RTPS Commission.</p>
                  {s.notificationRef ? <p className="mt-1 text-xs text-slate-500">{s.notificationRef}</p> : null}
                </details>
              ) : null}
              <Link href={`/citizen/apply/${s.code}`} className="btn-primary mt-3">{t("citizen.apply")}</Link>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
