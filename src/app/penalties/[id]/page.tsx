import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPenalty, PaymentsPanel, PenaltyCard, PenaltyTimeline, ProofOfService } from "@/components/PenaltyPanels";
import { OrdersRecord, PenaltyActions } from "@/components/PenaltyActions";
import { DeductionsPanel } from "@/components/RecoveryPanels";
import { currentUrl } from "@/lib/url";
import { Back, FeatureRef, Flash, type SP } from "@/components/ui";
import { canViewPenalty } from "@/domain/penalty";
import { homeFor, requireUser } from "@/lib/session";
import { recordFirstView } from "@/services/penalties";

export default async function PenaltyDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const u = await requireUser();
  const { id } = await params;
  const p = await loadPenalty({ id });
  // Other officers never see a penalty; a refused look is the same as a missing page.
  if (!p || !canViewPenalty(u, p)) notFound();
  const isOfficer = !!u.employeeId && u.employeeId === p.employeeId;
  await recordFirstView(u, p);
  const fresh = (await loadPenalty({ id }))!;

  return (
    <div className="space-y-4">
      <Back href={isOfficer ? "/penalties" : homeFor(u.role)}>{isOfficer ? "My penalties" : "Back"}</Back>
      <FeatureRef ids={["AMS-86", "AMS-87", "AMS-88", "AMS-97", "E5", "E6", "E7", "E17", "E18"]} />
      <Flash searchParams={searchParams} />
      <PenaltyCard p={fresh} forOfficer={isOfficer} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ProofOfService p={fresh} />
        <PaymentsPanel p={fresh} />
      </div>
      {fresh.deductions.length || fresh.directions.length || fresh.lines.length ? <DeductionsPanel p={fresh} /> : null}
      <OrdersRecord p={fresh} />
      <PenaltyActions p={fresh} user={u} back={await currentUrl()} />
      <p className="text-sm"><Link className="text-brand-700 underline" href={`/doc/order/${fresh.orderId}`}>Order imposing the penalty</Link></p>
      <PenaltyTimeline p={fresh} />
    </div>
  );
}
