import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, FeatureRef } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { getToday } from "@/lib/context";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

/** Landing page of the draft-appeal link sent by SMS and email (AMS-19). */
export default async function DraftLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [appeal, today, u] = await Promise.all([
    prisma.appeal.findFirst({ where: { linkToken: token }, include: { application: true } }),
    getToday(),
    getSessionUser(),
  ]);
  const ok = appeal && appeal.status === "DRAFT" && appeal.linkExpiresOn && today <= appeal.linkExpiresOn;
  if (ok && u?.id === appeal.application.citizenId) redirect(`/citizen/appeals/${appeal.id}`);

  return (
    <div className="mx-auto max-w-lg">
      <FeatureRef ids={["AMS-19"]} />
      <Card title="Your draft appeal">
        {!appeal ? <p className="text-sm">This link is not valid.</p>
          : ok ? (
            <>
              <p className="text-sm">Please sign in with the mobile number you used for the application to see and file your draft appeal {appeal.appealNo}. The link is valid until {formatDate(appeal.linkExpiresOn)}.</p>
              <Link href="/login" className="btn-primary mt-3">Sign in</Link>
            </>
          ) : (
            <p className="text-sm">
              {appeal.status === "DRAFT" || appeal.status === "LAPSED" ? `This link expired on ${formatDate(appeal.linkExpiresOn)}.` : "This draft has already been used."}{" "}
              You can still see your appeals, and file one while the filing window is open, from your <Link className="underline" href="/citizen">Sewa Setu dashboard</Link>.
            </p>
          )}
      </Card>
    </div>
  );
}
