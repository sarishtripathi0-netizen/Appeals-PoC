import { notFound } from "next/navigation";
import { startApplication } from "@/app/actions/applications";
import { Back, Card, FeatureRef, Flash, PageHeader, type SP } from "@/components/ui";
import { totalFee } from "@/domain/service-config";
import { getT } from "@/i18n";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { rupees } from "@/lib/view";
import { configOf } from "@/services/applications";

export default async function Apply({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: SP }) {
  const u = await requireUser(["CITIZEN", "CALL_CENTRE"]);
  const { t } = await getT();
  const { code } = await params;
  const service = await prisma.service.findUnique({ where: { code } });
  if (!service) notFound();
  const cfg = configOf(service);
  const fee = totalFee(cfg.fees);
  const districts = await prisma.district.findMany({ where: { offices: { some: { mappings: { some: { serviceCode: code } } } } }, orderBy: { name: "asc" } });

  return (
    <div className="mx-auto max-w-2xl">
      <Back href="/citizen/services">{t("nav.services")}</Back>
      <FeatureRef ids={["AMS-03", "AMS-04", "COM-10"]} />
      <PageHeader title={`${t("apply.title")}: ${service.name}`} subtitle={service.purpose} />
      <Flash searchParams={searchParams} />
      {cfg.eligibility.length ? (
        <Card title="Who can apply" className="mb-4">
          <ul className="ml-5 list-disc space-y-1 text-sm">{cfg.eligibility.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </Card>
      ) : null}
      <Card>
        <form action={startApplication} className="space-y-3">
          <input type="hidden" name="serviceCode" value={service.code} />
          <div>
            <label className="label" htmlFor="district">{districts.some((d) => d.name.includes("Co-District")) ? "District or co-district where you live" : t("apply.district")}</label>
            <select id="district" name="district" className="input" required>
              {districts.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="applicantName">{t("apply.name")}</label>
            <input id="applicantName" name="applicantName" className="input" defaultValue={u.role === "CITIZEN" ? u.name.replace(" (Demo)", "") : ""} required />
          </div>
          {cfg.formFields.map((f) => (
            <div key={f.key}>
              <label className="label" htmlFor={f.key}>{f.label}{f.required ? "" : " (optional)"}</label>
              <input id={f.key} name={f.key} className="input" required={f.required} />
              {f.help ? <p className="muted mt-1">{f.help}</p> : null}
            </div>
          ))}
          <div>
            <label className="label" htmlFor="address">{t("apply.address")}</label>
            <textarea id="address" name="address" rows={2} className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="purpose">{t("apply.purpose")}</label>
            <input id="purpose" name="purpose" className="input" placeholder="For example: college admission" />
          </div>
          <p className="muted">
            {t("citizen.timeLimit")}: {service.timeLimitWorkingDays} {t("citizen.workingDays")}.{fee ? ` Fee: ${rupees(fee)}, paid when you submit.` : ""} {t("docs.incomplete")}
          </p>
          <button className="btn-primary">{t("apply.continue")}</button>
        </form>
      </Card>
    </div>
  );
}
