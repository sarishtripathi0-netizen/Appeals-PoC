import { buildPdf, pdfResponse } from "@/lib/pdf";
import { getSessionUser } from "@/lib/session";
import { loadDoc } from "@/services/documents";

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const u = await getSessionUser();
  if (!u) return new Response("Please sign in.", { status: 401 });
  const { kind, id } = await params;
  if (kind !== "order" && kind !== "appeal") return new Response("Not found.", { status: 404 });
  const doc = await loadDoc(kind, id, u);
  if (!doc) return new Response("Not found.", { status: 404 });
  return pdfResponse(await buildPdf(doc), doc.filename);
}
