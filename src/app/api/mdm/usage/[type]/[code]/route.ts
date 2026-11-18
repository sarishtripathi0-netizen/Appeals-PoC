// Usage check for the MDM service: MDM calls this before deactivating a record (integration contract, step 5).
import { mdmUsage } from "@/services/mdm";

export async function GET(_req: Request, { params }: { params: Promise<{ type: string; code: string }> }) {
  const { type, code } = await params;
  return Response.json(await mdmUsage(decodeURIComponent(type), decodeURIComponent(code)));
}
