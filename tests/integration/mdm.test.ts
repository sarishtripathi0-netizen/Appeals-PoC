// MDM layer against a fake MDM client: first sync from snapshots, then changes by version, snapshot fallback on 410.
import { beforeEach, describe, expect, it } from "vitest";
import { SnapshotRequired, type MdmChange, type MdmClient, type MdmPayload } from "@/adapters/mdm";
import { SYSTEM_ACTOR } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { seedBaseline } from "@/seed";
import { mdmFreshness, mdmRecord, mdmUsage, registerWithMdm, syncMdm } from "@/services/mdm";

const rec = (code: string, v: number | string, extra: Partial<MdmPayload> = {}): MdmPayload => ({ id: `id-${code}`, code, name: code, isActive: true, mdmVersion: v, ...extra });

function fakeMdm(start: Record<string, MdmPayload[]>, version: number) {
  const state = { version, changes: [] as MdmChange[], pruned: false };
  const client: MdmClient = {
    version: async () => ({ global: state.version, prunedUpTo: 0, updatedAt: "", entities: {} }),
    snapshot: async (t) => ({ entityType: t, asOfVersion: state.version, count: 0, records: start[t] ?? [] }),
    changes: async (since) => {
      if (state.pruned) throw new SnapshotRequired("pruned", 410);
      return { since, currentVersion: state.version, nextSince: state.version, hasMore: false, changes: state.changes.filter((c) => c.version > since) };
    },
    validate: async () => ({ valid: true, asOn: "", mdmVersion: state.version, results: {} }),
    geoContext: async () => ({}),
    officesByJurisdiction: async () => ({}),
    registerConsumer: async (u) => ({ code: "ams-service", usageUrl: u }),
  };
  return { client, state };
}

beforeEach(async () => {
  await seedBaseline(prisma);
  await prisma.mdmRecord.deleteMany();
  await prisma.mdmSyncState.deleteMany();
  await prisma.mdmSyncRun.deleteMany();
});

describe("MDM local copy", () => {
  it("loads snapshots first, then applies only newer changes, and is a no-op when up to date", async () => {
    const { client, state } = fakeMdm({ office: [rec("CO_DISPUR", 10)], service: [rec("100009", 12, { timelineDays: 7 })] }, 20);
    expect(await syncMdm(SYSTEM_ACTOR, client)).toMatchObject({ mode: "SNAPSHOT", toVersion: 20, applied: 2 });
    expect((await mdmFreshness()).appliedVersion).toBe(20);

    state.version = 25;
    state.changes = [
      // MDM sends mdmVersion as a string in change payloads.
      { version: 23, entityType: "service", entityId: "id-100009", entityCode: "100009", op: "UPDATE", payload: rec("100009", "23", { timelineDays: 15 }) },
      { version: 24, entityType: "office", entityId: "id-CO_X", entityCode: "CO_X", op: "CREATE", payload: rec("CO_X", 24) },
      { version: 22, entityType: "office", entityId: "id-CO_DISPUR", entityCode: "CO_DISPUR", op: "UPDATE", payload: rec("CO_DISPUR", 9, { name: "stale" }) },
    ];
    expect(await syncMdm(SYSTEM_ACTOR, client)).toMatchObject({ mode: "CHANGES", fromVersion: 20, toVersion: 25, applied: 2 });
    expect((await mdmRecord("service", "100009"))?.timelineDays).toBe(15);
    expect(await mdmRecord("office", "CO_X")).not.toBeNull();
    expect((await mdmRecord("office", "CO_DISPUR"))?.name).toBe("CO_DISPUR");

    expect(await syncMdm(SYSTEM_ACTOR, client)).toMatchObject({ mode: "UP_TO_DATE", applied: 0 });
    expect(await prisma.mdmSyncRun.count()).toBe(3);
  });

  it("reloads snapshots when MDM has pruned its change log (410)", async () => {
    const { client, state } = fakeMdm({ office: [rec("CO_DISPUR", 10)] }, 20);
    await syncMdm(SYSTEM_ACTOR, client);
    state.version = 30;
    state.pruned = true;
    expect(await syncMdm(SYSTEM_ACTOR, client)).toMatchObject({ mode: "SNAPSHOT", toVersion: 30 });
  });

  it("records the error when MDM cannot be reached", async () => {
    const { client } = fakeMdm({}, 5);
    client.version = async () => { throw new Error("connect ECONNREFUSED"); };
    await expect(syncMdm(SYSTEM_ACTOR, client)).rejects.toThrow(/MDM sync failed/);
    expect((await prisma.mdmSyncRun.findFirstOrThrow()).error).toMatch(/ECONNREFUSED/);
  });
});

describe("usage check for MDM", () => {
  it("reports an office in use while AMS has authority mappings and officers there", async () => {
    const u = await mdmUsage("office", "CO_DISPUR");
    expect(u.inUse).toBe(true);
    expect(u.details).toMatchObject({ amsKeys: ["OFF-KMM-DPR"], authorityMappings: 4 });
    expect((await mdmUsage("office", "DC_NGN")).inUse).toBe(false);
  });

  it("lets only the administrator register AMS, with an address MDM can reach", async () => {
    const { client } = fakeMdm({}, 1);
    const admin = { id: "u-admin", name: "Admin", role: "ADMIN" };
    await expect(registerWithMdm({ ...admin, role: "FAA" }, "http://10.0.0.5:3000/api/mdm/usage", client)).rejects.toThrow(/administrator/);
    await expect(registerWithMdm(admin, "http://localhost:3000/api/mdm/usage", client)).rejects.toThrow(/localhost/);
    await expect(registerWithMdm(admin, "http://10.0.0.5:3000/api/mdm/usage", client)).resolves.toMatchObject({ code: "ams-service" });
  });
});
