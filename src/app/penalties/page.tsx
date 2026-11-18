import { loadPenalty, PenaltyCard } from "@/components/PenaltyPanels";
import { Empty, FeatureRef, Flash, PageHeader, type SP } from "@/components/ui";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function MyPenalties({ searchParams }: { searchParams: SP }) {
  const u = await requireUser();
  // Matched by employee ID: the penalty follows the officer, not the post (E7).
  const ids = u.employeeId ? await prisma.penalty.findMany({ where: { employeeId: u.employeeId }, orderBy: { orderDate: "desc" }, select: { id: true } }) : [];
  const penalties = (await Promise.all(ids.map((x) => loadPenalty({ id: x.id })))).filter((p) => !!p);

  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-86", "AMS-87", "AMS-89"]} />
      <PageHeader title="My penalties" subtitle="Penalties imposed on you under the Assam Right to Public Services (ARTPS) Act. Pay through eGRAS with the QR code by the last date; after that, the amount is recovered from your salary. Penalties go to a Government head of account." />
      <Flash searchParams={searchParams} />
      {penalties.length === 0 ? <Empty>No penalties have been imposed on you.</Empty> : penalties.map((p) => <PenaltyCard key={p!.id} p={p!} forOfficer linkToDetail />)}
    </div>
  );
}
