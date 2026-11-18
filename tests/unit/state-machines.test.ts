import { describe, expect, it } from "vitest";
import { appealMachine, applicationMachine, availableEvents, decide } from "@/domain/state-machines";

describe("application", () => {
  it("submits only when every required document is attached", () => {
    expect(decide(applicationMachine, "DRAFT", "submit", "CITIZEN", { docsComplete: false })).toMatchObject({ ok: false });
    expect(decide(applicationMachine, "DRAFT", "submit", "CITIZEN", { docsComplete: true })).toEqual({ ok: true, to: "IN_PROGRESS" });
  });

  it("never lets a held application be closed or rejected, and marks the attempt", () => {
    for (const event of ["close", "reject"] as const) {
      const d = decide(applicationMachine, "HELD", event, "DPS", { isCurrentHolder: true, reasons: "Applicant not eligible for this service" });
      expect(d).toMatchObject({ ok: false, refusalCode: "HELD_CLOSE_ATTEMPT" });
    }
  });

  it("still allows a held application to be delivered", () => {
    expect(decide(applicationMachine, "HELD", "deliver", "DPS", { isCurrentHolder: true, deliveryRef: "PRC/1" })).toEqual({ ok: true, to: "DELIVERED" });
  });

  it("closes or rejects an application in progress only with reasons", () => {
    expect(decide(applicationMachine, "IN_PROGRESS", "reject", "DPS", { isCurrentHolder: true, reasons: "short" }).ok).toBe(false);
    expect(decide(applicationMachine, "IN_PROGRESS", "reject", "DPS", { isCurrentHolder: true, reasons: "Not a resident of the circle" })).toEqual({ ok: true, to: "REJECTED" });
  });

  it("needs a reason for a second request for information", () => {
    const base = { isCurrentHolder: true, queryItems: ["Clear copy of income proof"] };
    expect(decide(applicationMachine, "IN_PROGRESS", "raiseQuery", "DPS", { ...base, queryCount: 0 }).ok).toBe(true);
    expect(decide(applicationMachine, "IN_PROGRESS", "raiseQuery", "DPS", { ...base, queryCount: 1 }).ok).toBe(false);
    expect(decide(applicationMachine, "IN_PROGRESS", "raiseQuery", "DPS", { ...base, queryCount: 1, secondQueryReason: "New document found missing" }).ok).toBe(true);
  });

  it("refuses an officer who does not hold the case today", () => {
    expect(decide(applicationMachine, "IN_PROGRESS", "deliver", "DPS", { isCurrentHolder: false, deliveryRef: "X/1" })).toMatchObject({ ok: false, reason: expect.stringMatching(/worklist/) });
  });

  it("checks the role before the guard", () => {
    expect(decide(applicationMachine, "IN_PROGRESS", "deliver", "CITIZEN", {})).toMatchObject({ ok: false, reason: "Your role cannot take this action." });
    expect(decide(applicationMachine, "DELIVERED", "close", "DPS", {})).toMatchObject({ ok: false, reason: expect.stringMatching(/not available/) });
  });

  it("only the Head of Office can release once no appeal is possible", () => {
    expect(decide(applicationMachine, "HELD", "release", "HEAD_OF_OFFICE", { appealPossibleOrOpen: true, reasons: "Window closed" }).ok).toBe(false);
    expect(decide(applicationMachine, "HELD", "release", "HEAD_OF_OFFICE", { appealPossibleOrOpen: false, reasons: "Window closed" }).ok).toBe(true);
    expect(decide(applicationMachine, "HELD", "release", "DPS", {}).ok).toBe(false);
  });

  it("lists what a role can do", () => {
    expect(availableEvents(applicationMachine, "HELD", "DPS").sort()).toEqual(["close", "deliver", "reject"]);
  });
});

describe("appeal", () => {
  it("routes filing by level and lateness", () => {
    expect(decide(appealMachine, "DRAFT", "file", "CITIZEN", { level: "FAA" })).toEqual({ ok: true, to: "UNDER_REVIEW" });
    expect(decide(appealMachine, "DRAFT", "file", "CITIZEN", { level: "FAA", isLate: true, lateReason: "I was in hospital until last week" })).toEqual({ ok: true, to: "FILED_LATE" });
    expect(decide(appealMachine, "DRAFT", "file", "CITIZEN", { level: "TAA" })).toEqual({ ok: true, to: "SCRUTINY" });
  });

  it("refuses late filing without a reason, beyond the cap, or a second live appeal", () => {
    expect(decide(appealMachine, "DRAFT", "file", "CITIZEN", { level: "FAA", isLate: true }).ok).toBe(false);
    expect(decide(appealMachine, "DRAFT", "file", "CITIZEN", { level: "TAA", windowNotAllowedMessage: "Too late" })).toMatchObject({ ok: false, reason: "Too late" });
    expect(decide(appealMachine, "DRAFT", "file", "CITIZEN", { level: "FAA", liveAppealExists: true }).ok).toBe(false);
  });

  it("issues no order without reasons and a penalty decision", () => {
    const ok = { isAuthority: true, reasons: "The DPS gave no reason for the delay of 12 working days.", penaltyDecided: true };
    expect(decide(appealMachine, "ORDER_DRAFTED", "sign", "FAA", { ...ok, reasons: "" }).ok).toBe(false);
    expect(decide(appealMachine, "ORDER_DRAFTED", "sign", "FAA", { ...ok, penaltyDecided: false }).ok).toBe(false);
    expect(decide(appealMachine, "ORDER_DRAFTED", "sign", "FAA", { ...ok, penaltyError: "Out of range" })).toMatchObject({ ok: false, reason: "Out of range" });
    expect(decide(appealMachine, "ORDER_DRAFTED", "sign", "FAA", { ...ok, hasDirection: true })).toEqual({ ok: true, to: "COMPLIANCE" });
    expect(decide(appealMachine, "ORDER_DRAFTED", "sign", "FAA", ok)).toEqual({ ok: true, to: "CLOSED" });
    expect(decide(appealMachine, "ORDER_DRAFTED", "sign", "COMMISSIONER", { ...ok, level: "TAA" })).toEqual({ ok: true, to: "AWAITING_AUTHENTICATION" });
  });

  it("needs every bench vote before a Commission order is drafted", () => {
    expect(decide(appealMachine, "UNDER_REVIEW", "draftOrder", "COMMISSIONER", { level: "TAA", votesComplete: false }).ok).toBe(false);
    expect(decide(appealMachine, "UNDER_REVIEW", "draftOrder", "COMMISSIONER", { level: "TAA", votesComplete: true }).ok).toBe(true);
  });

  it("never escalates a Commission appeal", () => {
    expect(decide(appealMachine, "UNDER_REVIEW", "escalate", "SYSTEM", { level: "TAA" }).ok).toBe(false);
    expect(decide(appealMachine, "UNDER_REVIEW", "escalate", "SYSTEM", { level: "FAA" })).toEqual({ ok: true, to: "ESCALATED" });
  });

  it("lets only the SAA extend, keeping the current status", () => {
    expect(decide(appealMachine, "HEARING_SCHEDULED", "extend", "SAA", { level: "SAA", currentStatus: "HEARING_SCHEDULED" })).toEqual({ ok: true, to: "HEARING_SCHEDULED" });
    expect(decide(appealMachine, "UNDER_REVIEW", "extend", "SAA", { level: "FAA" }).ok).toBe(false);
    expect(decide(appealMachine, "UNDER_REVIEW", "extend", "SAA", { level: "SAA", extensionError: "Only once" })).toMatchObject({ ok: false, reason: "Only once" });
  });

  it("closes only after delivery is confirmed; a dispute reopens", () => {
    expect(decide(appealMachine, "COMPLIANCE", "confirm", "CITIZEN", {}).ok).toBe(false);
    expect(decide(appealMachine, "AWAITING_CONFIRMATION", "confirm", "CITIZEN", {})).toEqual({ ok: true, to: "CLOSED" });
    expect(decide(appealMachine, "AWAITING_CONFIRMATION", "dispute", "CITIZEN", { reasons: "Wrong name on the certificate" })).toEqual({ ok: true, to: "UNDER_REVIEW" });
  });
});
