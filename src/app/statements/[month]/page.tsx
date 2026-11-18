import { notFound } from "next/navigation";
import { StatementTable } from "@/components/StatementView";
import { Back, Card, FeatureRef, PageHeader } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { monthName } from "@/domain/recovery";
import type { StatementRow } from "@/domain/statement";
import { getSettings } from "@/lib/context";
import { parseJson, prisma } from "@/lib/db";
import { homeFor, requireUser } from "@/lib/session";
import { STATEMENT_VIEWERS } from "@/services/reconciliation";

export default async function StatementPage({ params }: { params: Promise<{ month: string }> }) {
  const u = await requireUser();
  if (!STATEMENT_VIEWERS.includes(u.role)) notFound();
  const { month } = await params;
  const st = await prisma.monthlyStatement.findUnique({ where: { month } });
  if (!st) notFound();
  const s = await getSettings();
  const rows = parseJson<StatementRow[]>(st.rows, []);
  return (
    <div className="space-y-4">
      <Back href={homeFor(u.role)}>Back</Back>
      <FeatureRef ids={["AMS-95", "AMS-99"]} />
      <PageHeader
        title={`Penalty statement: ${monthName(month)}`}
        subtitle={`Per penalty: imposed, collected through eGRAS (GRN), deducted from salary (voucher), credited to the head of account ${s.headOfAccount} (mock treasury feed), and the difference. Generated ${formatDate(st.generatedOn, true)}.`}
        actions={<>
          <a className="btn-secondary" href={`/api/statements/${month}?format=csv`} data-testid="statement-csv">Download CSV</a>
          <a className="btn-secondary" href={`/api/statements/${month}?format=pdf`}>Download PDF</a>
        </>}
      />
      <Card><StatementTable rows={rows} /></Card>
      <p className="muted">Central recovery under: {s.centralRecoveryNotificationRef}</p>
    </div>
  );
}
