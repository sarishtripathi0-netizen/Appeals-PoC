import { Card, FeatureRef, PageHeader } from "@/components/ui";
import { formatDate } from "@/domain/dates";
import { prisma } from "@/lib/db";
import { requireUser, ROLE_LABELS } from "@/lib/session";

export default async function AdminMasters() {
  await requireUser(["ADMIN"]);
  const [services, mappings, users] = await Promise.all([
    prisma.service.findMany({ include: { department: true }, orderBy: { code: "asc" } }),
    prisma.authorityMapping.findMany({ include: { office: true }, orderBy: [{ serviceCode: "asc" }, { officeId: "asc" }] }),
    prisma.user.findMany({ where: { role: { not: "CITIZEN" } }, include: { office: true }, orderBy: [{ role: "asc" }, { name: "asc" }] }),
  ]);
  const name = new Map(users.map((u) => [u.id, u.name]));
  return (
    <div className="space-y-4">
      <FeatureRef ids={["AMS-01", "AMS-02", "AMS-132", "COM-06"]} note="read-only in the POC" />
      <PageHeader title="Masters" subtitle="Services, the effective-dated authority master and officer accounts." />
      <Card title="Services">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Code</th><th>Service</th><th>Time limit</th><th>Department</th></tr></thead>
            <tbody>{services.map((s) => <tr key={s.code}><td>{s.code}</td><td>{s.name}</td><td>{s.timeLimitWorkingDays} working days</td><td>{s.department.name}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>
      <Card title="Authority master">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Service</th><th>Office</th><th>DPS</th><th>Link Officer</th><th>FAA</th><th>SAA</th><th>Valid</th></tr></thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m.id}>
                  <td>{m.serviceCode}</td><td>{m.office.name}</td><td>{name.get(m.dpsId)}</td><td>{m.linkOfficerId ? name.get(m.linkOfficerId) : "—"}</td>
                  <td>{name.get(m.faaId)}</td><td>{name.get(m.saaId)}</td><td>from {formatDate(m.validFrom)}{m.validTo ? ` to ${formatDate(m.validTo)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Officers">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Name</th><th>Role</th><th>Designation</th><th>Username</th></tr></thead>
            <tbody>{users.map((u) => <tr key={u.id}><td>{u.name}</td><td>{ROLE_LABELS[u.role]}</td><td>{u.designation}</td><td><code>{u.username}</code></td></tr>)}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
