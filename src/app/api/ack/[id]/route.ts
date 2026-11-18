import { prisma } from "@/lib/db";
import { buildPdf, pdfResponse } from "@/lib/pdf";
import { getSessionUser } from "@/lib/session";
import { form1 } from "@/services/documents";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser();
  if (!u) return new Response("Please sign in.", { status: 401 });
  const { id } = await params;
  const app = await prisma.application.findUnique({ where: { id }, select: { citizenId: true } });
  if (!app || (u.role === "CITIZEN" && app.citizenId !== u.id)) return new Response("Not found.", { status: 404 });
  const doc = await form1(id);
  if (!doc) return new Response("Not found.", { status: 404 });
  return pdfResponse(await buildPdf(doc), doc.filename);
}
