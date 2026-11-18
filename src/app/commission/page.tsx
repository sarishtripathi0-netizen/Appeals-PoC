import { FeatureRef, PageHeader, Planned } from "@/components/ui";
import { requireUser } from "@/lib/session";

export default async function CommissionDashboard() {
  await requireUser(["REGISTRAR", "COMMISSIONER", "CHIEF_COMMISSIONER"]);
  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-117", "AMS-118", "AMS-119"]} />
      <PageHeader title="RTPS Commission" subtitle="Appeals by level, overdue cases, repeated-delay officers and the penalty ledger." />
      <Planned milestone="M5">the Commission dashboard. Registrar scrutiny, benches and votes arrive in M3.</Planned>
    </div>
  );
}
