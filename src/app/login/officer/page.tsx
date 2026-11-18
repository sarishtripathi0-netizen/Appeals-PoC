import Link from "next/link";
import { officerPassword, officerSecondFactor } from "@/app/actions/session";
import { FeatureRef, Flash, one, type SP } from "@/components/ui";
import { prisma } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/session";

export default async function OfficerLogin({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const username = one(sp.username);
  const step2 = one(sp.step) === "2" && username;
  const officers = await prisma.user.findMany({ where: { username: { not: null } }, orderBy: { role: "asc" } });

  return (
    <div className="mx-auto max-w-md">
      <FeatureRef ids={["COM-02", "COM-03", "COM-14"]} note="second factor is mocked" />
      <h1 className="h1 mb-4">Officer sign-in</h1>
      <Flash searchParams={searchParams} />
      {!step2 ? (
        <form action={officerPassword} className="card space-y-3">
          <div>
            <label className="label" htmlFor="username">Username</label>
            <input id="username" name="username" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" className="input" required />
          </div>
          <button className="btn-primary w-full">Continue</button>
        </form>
      ) : (
        <form action={officerSecondFactor} className="card space-y-3">
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm"><strong>Demo:</strong> the code sent to your registered mobile is <strong>246810</strong>.</div>
          <input type="hidden" name="username" value={username} />
          <div>
            <label className="label" htmlFor="code">Second-factor code</label>
            <input id="code" name="code" inputMode="numeric" className="input" required />
          </div>
          <button className="btn-primary w-full">Sign in</button>
        </form>
      )}
      <details className="card mt-4 text-sm">
        <summary className="cursor-pointer font-medium">Demo usernames (password: demo123)</summary>
        <ul className="mt-2 space-y-1">
          {officers.map((o) => (
            <li key={o.id}><code>{o.username}</code> — {ROLE_LABELS[o.role]}</li>
          ))}
        </ul>
      </details>
      <p className="muted mt-4 text-center"><Link href="/login" className="underline">Citizen sign-in</Link></p>
    </div>
  );
}
