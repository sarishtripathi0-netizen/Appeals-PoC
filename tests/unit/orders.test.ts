import { describe, expect, it } from "vitest";
import { checkPenaltyPlan, ORDER_TEMPLATES, penaltyDecided, templateFor, templatesFor } from "@/domain/orders";
import { DEFAULT_SETTINGS as s } from "@/domain/settings";

describe("order templates", () => {
  it("offers templates that fit the ground", () => {
    expect(templatesFor("FAA", "DELAY").map((t) => t.code)).toEqual(["ALLOW_DELIVER", "DISMISS"]);
    expect(templatesFor("SAA", "REJECTION").map((t) => t.code)).toEqual(["SET_ASIDE_REJECTION", "DISMISS"]);
    expect(ORDER_TEMPLATES.every((t) => t.levels.length > 0)).toBe(true);
    expect(templateFor("DISMISS")?.directsDelivery).toBe(false);
    expect(templateFor("nope")).toBeUndefined();
  });
});

describe("penalty decision", () => {
  const ledger = new Set(["dps|DPS", "link|LINK_OFFICER", "faa|FAA"]);

  it("needs a penalty or a reason for none", () => {
    expect(penaltyDecided([], "")).toBe(false);
    expect(penaltyDecided([], "short")).toBe(false);
    expect(penaltyDecided([], "Delay caused by a court stay")).toBe(true);
    expect(penaltyDecided([{ officerId: "dps", capacity: "DPS", amount: 500 }], null)).toBe(true);
  });

  it("only falls on officers in the ledger, within the range", () => {
    expect(checkPenaltyPlan("FAA", [{ officerId: "link", capacity: "LINK_OFFICER", amount: 5000 }], ledger, s)).toBeNull();
    expect(checkPenaltyPlan("FAA", [{ officerId: "other", capacity: "DPS", amount: 500 }], ledger, s)).toMatch(/ledger/);
    expect(checkPenaltyPlan("FAA", [{ officerId: "dps", capacity: "DPS", amount: 50 }], ledger, s)).toMatch(/between/);
    expect(checkPenaltyPlan("FAA", [], ledger, s)).toBeNull();
  });
});

describe("Commission penalties", () => {
  const allowed = new Set(["dps|DPS", "faa|FAA"]);

  it("lets the Commission penalise the DPS and an authority that missed its deadline, once each", () => {
    expect(checkPenaltyPlan("TAA", [{ officerId: "dps", capacity: "DPS", amount: 5000 }, { officerId: "faa", capacity: "FAA", amount: 2000 }], allowed, s)).toBeNull();
    expect(checkPenaltyPlan("TAA", [{ officerId: "faa", capacity: "FAA", amount: 400 }], allowed, s)).toMatch(/between Rs. 500/);
    expect(checkPenaltyPlan("TAA", [{ officerId: "dps", capacity: "DPS", amount: 500 }, { officerId: "dps", capacity: "DPS", amount: 500 }], allowed, s)).toMatch(/only once/);
    expect(checkPenaltyPlan("TAA", [{ officerId: "saa", capacity: "SAA", amount: 2000 }], allowed, s)).toMatch(/missed/);
  });

  it("offers remand only to the Commission", () => {
    expect(templatesFor("FAA", "DELAY").map((t) => t.code)).not.toContain("REMAND");
    expect(templatesFor("TAA", "DELAY").map((t) => t.code)).toEqual(["ALLOW_DELIVER", "DISMISS", "REMAND"]);
  });
});
