import { notFound } from "next/navigation";
import { DocView } from "@/components/DocView";
import { Back, FeatureRef, Flash, type SP } from "@/components/ui";
import { prisma } from "@/lib/db";
import { homeFor, requireUser } from "@/lib/session";
import { form1 } from "@/services/documents";

export default async function Acknowledgement({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const u = await requireUser();
  const { id } = await params;
  const app = await prisma.application.findUnique({ where: { id }, select: { citizenId: true } });
  if (!app || (u.role === "CITIZEN" && app.citizenId !== u.id)) notFound();
  const doc = await form1(id);
  if (!doc) notFound();
  return (
    <div>
      <Back href={u.role === "CITIZEN" ? `/citizen/applications/${id}` : homeFor(u.role)}>Back to the application</Back>
      <FeatureRef ids={["AMS-06", "AMS-07", "COM-11"]} />
      <Flash searchParams={searchParams} />
      <DocView doc={doc} pdfHref={`/api/ack/${id}`} />
    </div>
  );
}
