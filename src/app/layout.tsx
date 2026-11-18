import type { Metadata, Viewport } from "next";
import { DemoBar } from "@/components/DemoBar";
import { Header } from "@/components/Header";
import { getLang } from "@/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sewa Setu — Appeal Management (POC)",
  description: "Proof of concept of the appeal management system under the Assam Right to Public Services Act.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang === "as" ? "as" : "en"}>
      <body className="min-h-screen font-sans antialiased">
        <DemoBar />
        <Header />
        <main id="main" className="mx-auto max-w-6xl px-3 py-5 sm:px-4">{children}</main>
        <footer className="no-print mx-auto max-w-6xl px-3 pb-8 text-xs text-slate-500 sm:px-4">
          Proof of concept for demonstration. All names, offices and cases are fictional. External services (OTP, SMS, email, video, eGRAS, e-Sign, DigiLocker, payroll) are simulated.
        </footer>
      </body>
    </html>
  );
}
