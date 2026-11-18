// Adapters for external systems. Every one is a mock in the POC; swap the implementation to go live.
// Each interface is deliberately small so a real gateway can be dropped in without touching services.

import { createHash } from "node:crypto";

const shortHash = (s: string, n = 8) => createHash("sha256").update(s).digest("hex").slice(0, n).toUpperCase();

// ---- OTP (COM-01) ----
export interface OtpProvider {
  issue(mobile: string, today: string): { otp: string; demoVisible: boolean };
  verify(mobile: string, today: string, otp: string): boolean;
}
export const otpProvider: OtpProvider = {
  issue(mobile, today) {
    const otp = String(parseInt(shortHash(`${mobile}|${today}`, 6), 16) % 1_000_000).padStart(6, "0");
    return { otp, demoVisible: true };
  },
  verify(mobile, today, otp) {
    return this.issue(mobile, today).otp === otp.trim();
  },
};

// ---- Officer second factor (COM-02) ----
export interface SecondFactor {
  challenge(username: string): { code: string };
  verify(username: string, code: string): boolean;
}
export const secondFactor: SecondFactor = {
  challenge: () => ({ code: "246810" }),
  verify: (_u, code) => code.trim() === "246810",
};

// ---- SMS / email (COM-08) ----
export type OutboundMessage = { channel: "SMS" | "EMAIL"; address: string; text: string };
export interface MessagingGateway {
  /** Returns a gateway reference. The mock does nothing beyond the notification log written by the caller. */
  send(msg: OutboundMessage): Promise<{ ref: string }>;
}
export const messagingGateway: MessagingGateway = {
  async send(msg) {
    return { ref: `MOCK-${msg.channel}-${shortHash(msg.address + msg.text + Date.now())}` };
  },
};

// ---- Video hearings (AMS-47) ----
export interface VideoConferencing {
  createMeeting(hearingKey: string): { url: string };
}
export const videoConferencing: VideoConferencing = {
  createMeeting: (key) => ({ url: `https://vc.sewasetu-demo.example/join/${shortHash(key, 10)}` }),
};

// ---- eGRAS payment (AMS-87) ----
export interface PaymentGateway {
  createChallan(penaltyId: string, amount: number): { ref: string; url: string };
  confirm(ref: string): { treasuryRef: string };
}
export const paymentGateway: PaymentGateway = {
  createChallan: (id, amount) => {
    const ref = `EGRAS-${shortHash(id + amount, 10)}`;
    return { ref, url: `https://egras-demo.example/pay/${ref}` };
  },
  confirm: (ref) => ({ treasuryRef: `GRN-${shortHash(ref + "paid", 10)}` }),
};

/** eGRAS receipt numbers for penalty payments. Settlement (PENDING → SUCCESS or FAILED) is simulated by the scheduler. */
export const egras = {
  newGrn: (penaltyRef: string, seq: number) => `GRN${penaltyRef.replace(/\D/g, "").slice(-6)}${String(seq).padStart(4, "0")}${shortHash(penaltyRef + seq, 4)}`,
};

// ---- e-Sign (AMS-65) ----
export interface ESign {
  sign(documentText: string, signerId: string, today: string): { ref: string };
}
export const eSign: ESign = {
  sign: (doc, signer, today) => ({ ref: `ESIGN-${today.replaceAll("-", "")}-${shortHash(doc + signer, 10)}` }),
};

// ---- DigiLocker (COM-10, AMS-135) ----
export interface DigiLocker {
  fetch(docName: string, mobile: string): { fileName: string };
}
export const digiLocker: DigiLocker = {
  fetch: (doc, mobile) => ({ fileName: `digilocker-${doc.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${mobile.slice(-4)}.pdf` }),
};

// ---- Government records: Aadhaar, PAN, e-District certificate repository (system check before an officer sees the case) ----
// Fictional demo records keyed by the demo citizens' mobile numbers. A real gateway would query each source with consent.
type AadhaarRecord = { dob?: string; state?: string; fatherName?: string };
const AADHAAR: Record<string, AadhaarRecord> = {
  "9000000001": { dob: "2004-03-12", state: "Assam", fatherName: "Ramen Kalita" },
  "9000000002": { dob: "1999-07-01", state: "Assam" },
  "9000000003": { state: "Assam", fatherName: "Hemen Saikia" },
};
const PAN_FATHER: Record<string, string> = { "9000000001": "Ramen Kalita" };
const E_DISTRICT_SC_CERTIFICATES = [
  { certNo: "SC/KMM/2019/004512", holderName: "Ramen Kalita" },
  { certNo: "SC/KMM/2016/001877", holderName: "Dilip Borah" },
];

const sameName = (a?: string, b?: string) => !!a && !!b && a.replace(/\(demo\)/i, "").trim().toLowerCase() === b.replace(/\(demo\)/i, "").trim().toLowerCase();

export type RecordsCheck = { sources: Partial<Record<"DOB" | "RESIDENCE" | "FATHER_SC_CERT" | "RELATIONSHIP", string>>; notes: string[] };
export interface GovernmentRecords {
  check(mobile: string, form: { fatherName?: string; fatherCertNo?: string }): RecordsCheck;
}
export const governmentRecords: GovernmentRecords = {
  check(mobile, form) {
    const a = AADHAAR[mobile];
    const out: RecordsCheck = { sources: {}, notes: [] };
    if (a?.dob) out.sources.DOB = "Aadhaar";
    else out.notes.push("Date of birth not found in Aadhaar: please upload proof.");
    if (a?.state === "Assam") out.sources.RESIDENCE = "Aadhaar";
    else out.notes.push("Address in Assam not found in Aadhaar: please upload proof of residence.");
    const cert = E_DISTRICT_SC_CERTIFICATES.find((c) => c.certNo === form.fatherCertNo?.trim().toUpperCase());
    if (cert && sameName(cert.holderName, form.fatherName)) out.sources.FATHER_SC_CERT = `e-District certificate repository (${cert.certNo})`;
    else if (form.fatherCertNo) out.notes.push("Father's certificate not found in the e-District repository (it may not be digitised): please upload it.");
    if (sameName(a?.fatherName, form.fatherName)) out.sources.RELATIONSHIP = "Aadhaar";
    else if (sameName(PAN_FATHER[mobile], form.fatherName)) out.sources.RELATIONSHIP = "PAN";
    else out.notes.push("Relationship to the father could not be confirmed from Aadhaar or PAN.");
    return out;
  },
};

// ---- Payroll / treasury (AMS-94) ----
export interface Payroll {
  postDeduction(officerId: string, month: string, amount: number): { treasuryRef: string };
}
export const payroll: Payroll = {
  postDeduction: (o, m, a) => ({ treasuryRef: `SAL-${m.replace("-", "")}-${shortHash(o + m + a, 6)}` }),
};
