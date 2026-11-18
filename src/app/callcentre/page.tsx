import { FeatureRef, PageHeader, Planned } from "@/components/ui";
import { requireUser } from "@/lib/session";

export default async function CallCentre() {
  await requireUser(["CALL_CENTRE"]);
  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-31", "AMS-105", "AMS-110"]} />
      <PageHeader title="Call centre" subtitle="Find a citizen by mobile number or UIN, confirm receipt on their behalf, and file appeals with their consent." />
      <Planned milestone="M4">citizen search, assisted filing, confirmation on behalf of the citizen and the follow-up queue.</Planned>
    </div>
  );
}
