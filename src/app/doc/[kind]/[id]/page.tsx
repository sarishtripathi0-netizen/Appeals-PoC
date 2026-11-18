import { notFound } from "next/navigation";
import { authenticate, orderSign } from "@/app/actions/appeals";
import { DocView } from "@/components/DocView";
import { Back, Card, FeatureRef, Flash, HiddenBack, type SP } from "@/components/ui";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { currentUrl } from "@/lib/url";
import { loadDoc, type DocKind } from "@/services/documents";

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ kind: string; id: string }>; searchParams: SP }) {
  const u = await requireUser();
  const { kind, id } = await params;
  if (kind !== "order" && kind !== "appeal") notFound();
  const doc = await loadDoc(kind as DocKind, id, u);
  if (!doc) notFound();
  const order = kind === "order" ? await prisma.order.findUnique({ where: { id }, include: { appeal: { include: { bench: true } } } }) : null;
  const appealId = order?.appealId ?? id;
  const signerId = order?.level === "TAA" ? order.appeal.bench?.presidingId : order?.appeal.authorityId;
  const canSign = order?.status === "DRAFT" && signerId === u.id;
  const canAuthenticate = order?.level === "TAA" && order.status === "SIGNED" && u.role === "REGISTRAR";
  const back = await currentUrl();
  const caseHref = order?.level === "TAA" ? `/commission/appeals/${appealId}` : `/authority/appeals/${appealId}`;
  const backHref =
    u.role === "CITIZEN" ? `/citizen/appeals/${appealId}` :
    ["FAA", "SAA", "REGISTRAR", "COMMISSIONER", "CHIEF_COMMISSIONER"].includes(u.role) ? caseHref :
    u.role === "DPS" || u.role === "LINK_OFFICER" ? "/dps/appeals" : "/audit";

  return (
    <div>
      <Back href={backHref}>Back to the appeal</Back>
      <FeatureRef ids={kind === "order" ? ["AMS-53", "AMS-64", "AMS-65", "AMS-66", "AMS-67", "AMS-68", "COM-11"] : ["AMS-30", "COM-11"]} />
      <Flash searchParams={searchParams} />
      {canSign ? (
        <Card className="mx-auto mb-4 max-w-3xl border-amber-300 bg-amber-50">
          <p className="text-sm">This is a preview. The order becomes final, and is sent to the parties, only when you sign it. A signed order cannot be changed.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={orderSign}>
              <HiddenBack value={back} />
              <input type="hidden" name="orderId" value={id} />
              <button className="btn-primary" data-testid="esign">Sign with e-Sign (demo)</button>
            </form>
            <a href={`${caseHref}#order`} className="btn-secondary">Edit the draft</a>
          </div>
        </Card>
      ) : null}
      {canAuthenticate ? (
        <Card className="mx-auto mb-4 max-w-3xl border-amber-300 bg-amber-50">
          <p className="text-sm">Signed by the presiding member. The order takes effect, and is sent to the parties, when you authenticate it.</p>
          <form action={authenticate} className="mt-3">
            <HiddenBack value={back} />
            <input type="hidden" name="orderId" value={id} />
            <button className="btn-primary">Authenticate order</button>
          </form>
        </Card>
      ) : null}
      <DocView doc={doc} pdfHref={`/api/doc/${kind}/${id}`} />
    </div>
  );
}
