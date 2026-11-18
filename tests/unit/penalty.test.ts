import { describe, expect, it } from "vitest";
import { makeCalendar } from "@/domain/calendar";
import { canViewPenalty, deemedServiceDate, isReminderDay, parseQrPayload, penaltyAmounts, penaltyDueDate, qrPayload } from "@/domain/penalty";
import { decidePenalty, penaltyMachine } from "@/domain/penalty-machine";
import { DEFAULT_SETTINGS as s } from "@/domain/settings";

const cal = makeCalendar(["2026-11-09", "2026-11-24", "2026-12-25"]);

describe("last date from deemed service", () => {
  it("is 30 calendar days after the service date", () => {
    expect(penaltyDueDate("2026-11-02", s, cal)).toBe("2026-12-02");
  });

  it("moves to the next working day when it falls on a weekly off or holiday", () => {
    expect(penaltyDueDate("2026-11-13", s, cal)).toBe("2026-12-14"); // Sun 13 Dec -> Mon 14 Dec
    expect(penaltyDueDate("2026-11-25", s, cal)).toBe("2026-12-28"); // Fri 25 Dec holiday, Sat 26 Dec 4th Saturday, Sun 27 Dec
  });

  it("can count working days instead", () => {
    expect(penaltyDueDate("2026-11-02", { ...s, paymentBasis: "WORKING" }, cal)).toBe("2026-12-11");
  });

  it("deems service only when the message has also gone out", () => {
    expect(deemedServiceDate("2026-11-02", null)).toBeNull();
    expect(deemedServiceDate("2026-11-02", "2026-11-03")).toBe("2026-11-03");
    expect(deemedServiceDate("2026-11-03", "2026-11-02")).toBe("2026-11-03");
  });
});

describe("money", () => {
  const m = (egras: number, deducted = 0, refunded = 0, writtenOff = 0) => ({ egras, deducted, refunded, writtenOff });
  it("works out what is still due and what was over-collected", () => {
    expect(penaltyAmounts(2000, m(0))).toMatchObject({ outstanding: 2000, excess: 0 });
    expect(penaltyAmounts(2000, m(1500))).toMatchObject({ outstanding: 500, excess: 0 });
    expect(penaltyAmounts(2000, m(2000, 2000))).toMatchObject({ outstanding: 0, excess: 2000 }); // double recovery
    expect(penaltyAmounts(2000, m(2000, 2000, 2000))).toMatchObject({ outstanding: 0, excess: 0 }); // after the refund
    expect(penaltyAmounts(2000, m(500, 0, 0, 1500))).toMatchObject({ outstanding: 0, excess: 0 }); // rest written off
    expect(penaltyAmounts(0, m(0, 1000))).toMatchObject({ outstanding: 0, excess: 1000 }); // set aside after a deduction
  });
});

describe("reminders and the QR code", () => {
  it("reminds on day 20 and day 27 after service", () => {
    expect(isReminderDay("2026-11-02", "2026-11-22", s.reminderDays)).toBe(20);
    expect(isReminderDay("2026-11-02", "2026-11-29", s.reminderDays)).toBe(27);
    expect(isReminderDay("2026-11-02", "2026-11-23", s.reminderDays)).toBeNull();
  });

  it("encodes the reference, UIN, exact amount and head of account", () => {
    const q = { ref: "PEN-2026-000001", uin: "RTPS-PRC/2026/000002", amount: 2000, headOfAccount: s.headOfAccount };
    expect(parseQrPayload(qrPayload(q))).toEqual(q);
  });
});

describe("who can see a penalty", () => {
  const p = { employeeId: "EMP-000101", imposedById: "u-faa-kmm", competentAuthorityId: "u-ca-pers" };
  const user = (id: string, role: string, employeeId: string | null = null) => ({ id, role, employeeId });
  it("allows the officer, the imposing authority, the Competent Authority, the Sewa Setu DDO, Finance and the Commission", () => {
    expect(canViewPenalty(user("u-dps-kmm", "DPS", "EMP-000101"), p)).toBe(true);
    expect(canViewPenalty(user("u-faa-kmm", "FAA", "EMP-000103"), p)).toBe(true);
    expect(canViewPenalty(user("u-ca-pers", "COMPETENT_AUTHORITY"), p)).toBe(true);
    for (const role of ["SEWA_SETU_DDO", "FINANCE_NODAL", "FINANCE_SENIOR", "REGISTRAR", "COMMISSIONER", "CHIEF_COMMISSIONER"]) expect(canViewPenalty(user("x", role), p)).toBe(true);
  });
  it("refuses other officers, including a successor in the same post, another Competent Authority and the admin", () => {
    expect(canViewPenalty(user("u-successor", "DPS", "EMP-999999"), p)).toBe(false);
    expect(canViewPenalty(user("u-dps-jrt", "DPS", "EMP-000201"), p)).toBe(false);
    expect(canViewPenalty(user("u-ca-ias", "COMPETENT_AUTHORITY"), p)).toBe(false);
    expect(canViewPenalty(user("u-admin", "ADMIN"), p)).toBe(false);
  });
});

describe("penalty state machine: controls", () => {
  it("closes on the eGRAS route only when fully paid, never by a manual 'paid'", () => {
    expect(decidePenalty("RAISED", "settlePaid", "SYSTEM", { outstanding: 0, excess: 0 })).toEqual({ ok: true, to: "PAID_EGRAS" });
    expect(decidePenalty("RAISED", "settlePaid", "SYSTEM", { outstanding: 500 }).ok).toBe(false);
    for (const role of ["SEWA_SETU_DDO", "FINANCE_NODAL", "FAA"]) expect(decidePenalty("RAISED", "settlePaid", role, { outstanding: 0 }).ok).toBe(false);
  });

  it("does not let the Sewa Setu DDO confirm unpaid while a receipt is pending", () => {
    expect(decidePenalty("OVERDUE", "confirmUnpaid", "SEWA_SETU_DDO", { grnPending: true, outstanding: 2000 })).toMatchObject({ ok: false, reason: expect.stringMatching(/pending/) });
    expect(decidePenalty("OVERDUE", "confirmUnpaid", "SEWA_SETU_DDO", { grnPending: false, outstanding: 2000 })).toEqual({ ok: true, to: "UNPAID_CONFIRMED" });
    expect(decidePenalty("OVERDUE", "confirmUnpaid", "FINANCE_NODAL", { outstanding: 2000 }).ok).toBe(false);
  });

  it("sends no ticket without a Recovery Direction", () => {
    expect(decidePenalty("UNPAID_CONFIRMED", "addToTicket", "SYSTEM", { directionInPlace: false })).toMatchObject({ ok: false, reason: expect.stringMatching(/Recovery Direction/) });
    expect(decidePenalty("UNPAID_CONFIRMED", "addToTicket", "SYSTEM", { directionInPlace: true })).toEqual({ ok: true, to: "IN_RECOVERY" });
    expect(decidePenalty("UNPAID_CONFIRMED", "addToTicket", "SYSTEM", { directionInPlace: true, routingProblem: "Not on the State payroll" }).ok).toBe(false);
  });

  it("lets only the assigned nodal officer record deductions, and never close or change the amount", () => {
    expect(decidePenalty("IN_RECOVERY", "recordDeduction", "FINANCE_NODAL", { isAssignee: true, outstandingAfter: 1000 })).toEqual({ ok: true, to: "PARTLY_DEDUCTED" });
    expect(decidePenalty("PARTLY_DEDUCTED", "recordDeduction", "FINANCE_NODAL", { isAssignee: true, outstandingAfter: 0 })).toEqual({ ok: true, to: "DEDUCTED" });
    expect(decidePenalty("IN_RECOVERY", "recordDeduction", "FINANCE_NODAL", { isAssignee: false }).ok).toBe(false);
    expect(decidePenalty("IN_RECOVERY", "recordDeduction", "SEWA_SETU_DDO", { isAssignee: true }).ok).toBe(false);
    expect(decidePenalty("CREDIT_CONFIRMED", "close", "FINANCE_NODAL", {}).ok).toBe(false);
    expect(decidePenalty("IN_RECOVERY", "reduce", "FINANCE_NODAL", { newAmount: 100, currentAmount: 2000, orderRef: "X/1", documentName: "order.pdf" }).ok).toBe(false);
  });

  it("does not let the Sewa Setu DDO mark recovered without the nodal officer's proof", () => {
    expect(decidePenalty("DEDUCTED", "verifyDeduction", "SEWA_SETU_DDO", { proofError: "No proof uploaded" }).ok).toBe(false);
    expect(decidePenalty("DEDUCTED", "verifyDeduction", "SEWA_SETU_DDO", { verifiedAll: true })).toEqual({ ok: true, to: "RECOVERED" });
  });

  it("records a stay only with an order, and resumes where it was", () => {
    expect(decidePenalty("IN_RECOVERY", "stay", "SEWA_SETU_DDO", { orderRef: "", documentName: "" }).ok).toBe(false);
    expect(decidePenalty("IN_RECOVERY", "stay", "COMMISSIONER", { orderRef: "WP(C) 123/2026", documentName: "stay.pdf" })).toEqual({ ok: true, to: "STAYED" });
    expect(decidePenalty("STAYED", "liftStay", "SEWA_SETU_DDO", { orderRef: "WP(C) 123/2026", documentName: "vacated.pdf", priorStatus: "PARTLY_DEDUCTED" })).toEqual({ ok: true, to: "PARTLY_DEDUCTED" });
  });

  it("allows a review to lower the amount only, and only by the imposing or a higher authority among appellate officers", () => {
    const base = { orderRef: "Review 7/2026", documentName: "review.pdf", currentAmount: 4000 };
    expect(decidePenalty("RAISED", "reduce", "SAA", { ...base, newAmount: 2000, isReviewingAuthority: true })).toEqual({ ok: true, to: "REDUCED" });
    expect(decidePenalty("RAISED", "reduce", "FAA", { ...base, newAmount: 2000, isReviewingAuthority: false }).ok).toBe(false);
    expect(decidePenalty("RAISED", "reduce", "SEWA_SETU_DDO", { ...base, newAmount: 5000 }).ok).toBe(false);
    expect(decidePenalty("CLOSED", "setAside", "COMMISSIONER", base)).toEqual({ ok: true, to: "SET_ASIDE" });
  });

  it("writes off only with the Competent Authority's approval", () => {
    expect(decidePenalty("EXCEPTION", "requestWriteOff", "SEWA_SETU_DDO", { reason: "Officer deceased; no estate to recover from", outstanding: 3000 })).toEqual({ ok: true, to: "WRITE_OFF_REQUESTED" });
    expect(decidePenalty("WRITE_OFF_REQUESTED", "approveWriteOff", "COMPETENT_AUTHORITY", { isCompetentAuthority: false }).ok).toBe(false);
    expect(decidePenalty("WRITE_OFF_REQUESTED", "approveWriteOff", "SEWA_SETU_DDO", { isCompetentAuthority: true }).ok).toBe(false);
    expect(decidePenalty("WRITE_OFF_REQUESTED", "approveWriteOff", "COMPETENT_AUTHORITY", { isCompetentAuthority: true })).toEqual({ ok: true, to: "WRITTEN_OFF" });
  });

  it("needs a refund reference from Finance", () => {
    expect(decidePenalty("REFUND_DUE", "recordRefund", "FINANCE_NODAL", { reference: "" }).ok).toBe(false);
    expect(decidePenalty("REFUND_DUE", "recordRefund", "FINANCE_NODAL", { reference: "RF/2026/11" })).toEqual({ ok: true, to: "REFUNDED" });
  });
});

describe("penalty state machine: role guards", () => {
  const ALL_ROLES = [
    "CITIZEN", "DPS", "LINK_OFFICER", "FAA", "SAA", "REGISTRAR", "COMMISSIONER", "CHIEF_COMMISSIONER", "HEAD_OF_OFFICE", "CALL_CENTRE", "ADMIN",
    "SYSTEM", "DEALING_ASSISTANT", "SEWA_SETU_DDO", "FINANCE_NODAL", "FINANCE_SENIOR", "COMPETENT_AUTHORITY",
  ];
  // A context that satisfies every guard, so only the role decides.
  const pass = {
    outstanding: 0, excess: 1, grnPending: false, directionInPlace: true, routingProblem: "Not on the State payroll", isAssignee: true, outstandingAfter: 0,
    verifiedAll: true, reason: "A sufficient reason given", orderRef: "WP(C) 1/2026", documentName: "order.pdf", newAmount: 1000, currentAmount: 2000,
    isReviewingAuthority: true, reference: "REF/1", isCompetentAuthority: true,
  };

  for (const t of penaltyMachine.transitions) {
    it(`${t.event} from ${t.from[0]} is refused for every role except ${t.roles.join(", ")}`, () => {
      for (const role of ALL_ROLES) {
        const r = decidePenalty(t.from[0], t.event, role, pass);
        if (!t.roles.includes(role as never)) expect(r.ok, `${role} must be refused`).toBe(false);
      }
    });
  }

  it("never lets Finance, the officer or the administrator make a human decision reserved to another role", () => {
    const humanEvents = penaltyMachine.transitions.filter((t) => !t.roles.includes("SYSTEM" as never));
    for (const t of humanEvents) {
      for (const role of ["DPS", "ADMIN", "FINANCE_SENIOR", "CITIZEN"]) expect(decidePenalty(t.from[0], t.event, role, pass).ok).toBe(false);
    }
  });
});
