import { describe, expect, it } from "vitest";
import { gapReport, type AmsMasters, type MdmIndex } from "@/domain/mdm-crosswalk";

const idx = (recs: Record<string, Record<string, unknown>[]>): MdmIndex =>
  new Map(Object.entries(recs).map(([t, rs]) => [t, new Map(rs.map((r) => [String(r.code), { isActive: true, ...r } as never]))]));

const ams: AmsMasters = {
  departments: [{ code: "REV", name: "Revenue and Disaster Management Department" }, { code: "HUA", name: "Housing and Urban Affairs Department" }],
  districts: [{ code: "JRT", name: "Jorhat" }],
  offices: [{ id: "OFF-KMM-DPR", name: "Dispur Revenue Circle Office (Demo)", districtCode: "KMM", departmentCode: "REV" }],
  services: [{ code: "INC", name: "Income Certificate", departmentCode: "REV", timeLimitWorkingDays: 15 }, { code: "SCC", name: "SC", departmentCode: "SJE", timeLimitWorkingDays: 30 }],
  officers: [
    { id: "u-dps-kmm", name: "Anjali Baruah (Demo)", designation: "Circle Officer", employeeId: "EMP-000101" },
    { id: "u-com1", name: "Imran Hussain (Demo)", designation: "Commissioner", employeeId: null },
    { id: "u-admin", name: "Admin", designation: "Administrator", employeeId: null },
  ],
  holidays: [{ date: "2026-01-26", name: "Republic Day" }, { date: "2026-11-24", name: "Lachit Divas" }, { date: "2027-01-15", name: "Magh Bihu" }],
};

const mdm = idx({
  department: [{ code: "RDM", name: "Revenue & Disaster Management Department" }, { code: "SJE", name: "Social Justice" }],
  district: [{ code: "D-290", name: "Jorhat" }],
  office: [{ code: "CO_DISPUR", name: "Dispur Revenue Circle Office", districtCode: "KMM", departmentCode: "RDM" }],
  service: [{ code: "100009", timelineDays: 7, departmentCode: "RDM" }, { code: "13960389", timelineDays: 30, departmentCode: "SJE" }],
  designation: [{ code: "CIRCLE_OFFICER", name: "Circle Officer" }],
  holiday: [
    { code: "2026-01-26", date: "2026-01-26", name: "Republic Day", holidayType: "GAZETTED" },
    { code: "2026-11-24", date: "2026-11-24", name: "Guru Nanak Jayanti", holidayType: "RESTRICTED" },
    { code: "2026-03-20", date: "2026-03-20", name: "Id-ul-Fitr", holidayType: "GAZETTED" },
  ],
});

const find = (area: string, key: string) => gapReport(ams, mdm).find((r) => r.area === area && r.amsKey === key)!;

describe("MDM gap report", () => {
  it("matches records under their MDM codes, including renamed codes", () => {
    expect(find("Department", "REV")).toMatchObject({ mdmCode: "RDM", status: "MATCHED" });
    expect(find("District", "JRT")).toMatchObject({ mdmCode: "D-290", status: "MATCHED" });
    expect(find("Office", "OFF-KMM-DPR")).toMatchObject({ mdmCode: "CO_DISPUR", status: "MATCHED" });
    expect(find("Service", "SCC")).toMatchObject({ mdmCode: "13960389", status: "MATCHED" });
    expect(find("Designation", "u-dps-kmm")).toMatchObject({ mdmCode: "CIRCLE_OFFICER", status: "MATCHED" });
  });

  it("lists AMS masters missing in MDM, with MDM as the owner", () => {
    expect(find("Department", "HUA")).toMatchObject({ status: "MISSING", owner: "MDM" });
    expect(find("Designation", "u-com1")).toMatchObject({ status: "MISSING", action: expect.stringContaining("Commissioner, ARTPS Commission") });
    expect(find("Employee", "EMP-000101")).toMatchObject({ status: "MISSING", action: expect.stringContaining("Mint") });
    expect(find("Holiday", "2027-01-15").status).toBe("MISSING");
  });

  it("flags differences in time limit, and calendar disagreements both ways", () => {
    expect(find("Service", "INC")).toMatchObject({ status: "DIFFERS", differences: ["Time limit: AMS 15 working days, MDM 7 days"] });
    expect(find("Holiday", "2026-11-24")).toMatchObject({ status: "DIFFERS", differences: [expect.stringContaining("restricted")] });
    expect(find("Holiday", "2026-03-20")).toMatchObject({ status: "DIFFERS", owner: "AMS" });
    expect(find("Holiday", "2026-01-26").status).toBe("MATCHED");
  });

  it("does not treat portal roles as master data, and reports deactivated MDM records", () => {
    expect(find("Designation", "u-admin")).toMatchObject({ status: "NOT_FOR_MDM", owner: "IAM" });
    const inactive = idx({ department: [{ code: "RDM", name: "Revenue", isActive: false }] });
    expect(gapReport({ ...ams, departments: [ams.departments[0]] }, inactive)[0]).toMatchObject({ status: "INACTIVE" });
  });
});
