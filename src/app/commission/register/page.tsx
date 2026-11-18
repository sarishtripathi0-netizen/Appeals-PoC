import { FeatureRef, PageHeader, Planned } from "@/components/ui";
import { requireUser } from "@/lib/session";

export default async function ReviewRegister() {
  await requireUser(["REGISTRAR", "COMMISSIONER", "CHIEF_COMMISSIONER"]);
  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-120"]} />
      <PageHeader title="Register of cases for review" subtitle="Refused attempts to close held applications, bulk disposals and handovers recorded after the fact." />
      <Planned milestone="M5">the register. Refused attempts are already in the audit log (filter: refused only).</Planned>
    </div>
  );
}
