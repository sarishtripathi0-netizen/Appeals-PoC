import Link from "next/link";
import { otpProvider } from "@/adapters";
import { sendOtp, verifyOtp } from "@/app/actions/session";
import { FeatureRef, Flash, one, type SP } from "@/components/ui";
import { getT } from "@/i18n";
import { getToday } from "@/lib/context";

export default async function CitizenLogin({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { t } = await getT();
  const mobile = one(sp.mobile);
  const sent = one(sp.sent) === "1" && mobile;
  const otp = sent ? otpProvider.issue(mobile, await getToday()).otp : null;

  return (
    <div className="mx-auto max-w-md">
      <FeatureRef ids={["COM-01", "COM-04", "COM-14"]} note="OTP is mocked" />
      <h1 className="h1 mb-4">{t("login.citizen")}</h1>
      <Flash searchParams={searchParams} />
      {!sent ? (
        <form action={sendOtp} className="card space-y-3">
          <div>
            <label className="label" htmlFor="mobile">{t("login.mobile")}</label>
            <input id="mobile" name="mobile" inputMode="numeric" autoComplete="tel" placeholder="9000000001" className="input" required />
            <p className="muted mt-1">Demo citizens: 9000000001 to 9000000004. Any other 10-digit number creates a new citizen.</p>
          </div>
          <button className="btn-primary w-full">{t("login.sendOtp")}</button>
        </form>
      ) : (
        <form action={verifyOtp} className="card space-y-3">
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm" data-testid="demo-otp">
            <strong>Demo:</strong> the SMS would say “Your Sewa Setu OTP is <strong>{otp}</strong>”.
          </div>
          <input type="hidden" name="mobile" value={mobile} />
          <div>
            <label className="label" htmlFor="otp">{t("login.otp")}</label>
            <input id="otp" name="otp" inputMode="numeric" className="input" defaultValue="" required />
          </div>
          <button className="btn-primary w-full">{t("login.verify")}</button>
          <Link href="/login" className="block text-center text-sm text-brand-700 underline">Use a different number</Link>
        </form>
      )}
      <p className="muted mt-4 text-center"><Link href="/login/officer" className="underline">{t("login.officer")}</Link></p>
    </div>
  );
}
