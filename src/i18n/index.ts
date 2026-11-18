// English is complete. Assamese covers the main navigation and citizen screens only and is a DRAFT translation (COM-07).

import { cookies } from "next/headers";

export type Lang = "en" | "as";

const en = {
  "brand.title": "Sewa Setu",
  "brand.subtitle": "Appeals under the Assam Right to Public Services Act",
  "nav.home": "Home",
  "nav.services": "Apply for a service",
  "nav.applications": "My applications",
  "nav.appeals": "My appeals",
  "nav.notifications": "Messages log",
  "nav.audit": "Audit log",
  "nav.demo": "Demo scenarios",
  "nav.signout": "Sign out",
  "nav.signin": "Sign in",
  "lang.toggle": "অসমীয়া",
  "fref.show": "Show feature tags",
  "fref.hide": "Hide feature tags",
  "citizen.welcome": "Welcome",
  "citizen.intro": "Apply for services, track your applications and appeal if a service is late or refused.",
  "citizen.yourApplications": "Your applications",
  "citizen.noApplications": "You have no applications yet.",
  "citizen.yourAppeals": "Your appeals",
  "citizen.draftsWaiting": "Appeals ready for you to file",
  "citizen.messages": "Recent messages",
  "citizen.apply": "Apply",
  "citizen.timeLimit": "Time limit",
  "citizen.workingDays": "working days",
  "citizen.dueBy": "Due by",
  "citizen.status": "Status",
  "citizen.viewAck": "View acknowledgement",
  "citizen.open": "Open",
  "services.title": "Services you can apply for",
  "services.intro": "Each service has a fixed time limit under the Assam Right to Public Services (ARTPS) Act. The time limit starts when your application is complete.",
  "apply.title": "Apply for",
  "apply.district": "District where you live",
  "apply.name": "Applicant's full name",
  "apply.address": "Address",
  "apply.purpose": "Why do you need this?",
  "apply.continue": "Save and continue to documents",
  "docs.title": "Documents",
  "docs.required": "Required",
  "docs.optional": "Optional",
  "docs.upload": "Upload",
  "docs.digilocker": "Fetch from DigiLocker (demo)",
  "docs.attached": "Attached",
  "docs.submit": "Submit application",
  "docs.incomplete": "Attach every required document to submit. The time limit starts only when the application is complete.",
  "query.title": "The office has asked for more information",
  "query.reply": "Send reply",
  "query.paused": "The time limit is paused until you reply.",
  "confirm.title": "Have you received it?",
  "confirm.yes": "Yes, I have received it",
  "login.citizen": "Citizen sign-in",
  "login.mobile": "Mobile number",
  "login.sendOtp": "Send OTP",
  "login.otp": "One-time password (OTP)",
  "login.verify": "Verify and sign in",
  "login.officer": "Officer sign-in",
};

export type Key = keyof typeof en;

const as: Partial<Record<Key, string>> = {
  "brand.title": "সেৱা সেতু",
  "brand.subtitle": "অসম ৰাজহুৱা সেৱাৰ অধিকাৰ আইনৰ অধীনত আপীল",
  "nav.home": "মূল পৃষ্ঠা",
  "nav.services": "সেৱাৰ বাবে আবেদন",
  "nav.applications": "মোৰ আবেদনসমূহ",
  "nav.appeals": "মোৰ আপীলসমূহ",
  "nav.notifications": "বাৰ্তাৰ তালিকা",
  "nav.audit": "অডিট লগ",
  "nav.demo": "ডেমো পৰিস্থিতি",
  "nav.signout": "ছাইন আউট",
  "nav.signin": "ছাইন ইন",
  "lang.toggle": "English",
  "citizen.welcome": "স্বাগতম",
  "citizen.intro": "সেৱাৰ বাবে আবেদন কৰক, আবেদনৰ অৱস্থা চাওক, আৰু সেৱা পলম হ'লে বা নাকচ হ'লে আপীল কৰক।",
  "citizen.yourApplications": "আপোনাৰ আবেদনসমূহ",
  "citizen.noApplications": "আপোনাৰ এতিয়ালৈকে কোনো আবেদন নাই।",
  "citizen.yourAppeals": "আপোনাৰ আপীলসমূহ",
  "citizen.draftsWaiting": "দাখিলৰ বাবে সাজু আপীল",
  "citizen.messages": "শেহতীয়া বাৰ্তা",
  "citizen.apply": "আবেদন কৰক",
  "citizen.timeLimit": "সময়সীমা",
  "citizen.workingDays": "কৰ্মদিৱস",
  "citizen.dueBy": "শেষ তাৰিখ",
  "citizen.status": "অৱস্থা",
  "citizen.viewAck": "প্ৰাপ্তি-স্বীকাৰ চাওক",
  "citizen.open": "খোলক",
  "services.title": "আপুনি আবেদন কৰিব পৰা সেৱাসমূহ",
  "services.intro": "অসম ৰাজহুৱা সেৱাৰ অধিকাৰ আইনৰ অধীনত প্ৰতিটো সেৱাৰ এটা নিৰ্দিষ্ট সময়সীমা আছে। আবেদন সম্পূৰ্ণ হ'লেহে সময়সীমা আৰম্ভ হয়।",
  "apply.title": "আবেদন",
  "apply.district": "আপুনি বাস কৰা জিলা",
  "apply.name": "আবেদনকাৰীৰ সম্পূৰ্ণ নাম",
  "apply.address": "ঠিকনা",
  "apply.purpose": "কিয় প্ৰয়োজন?",
  "apply.continue": "সংৰক্ষণ কৰি নথিলৈ যাওক",
  "docs.title": "নথিপত্ৰ",
  "docs.required": "বাধ্যতামূলক",
  "docs.optional": "ঐচ্ছিক",
  "docs.upload": "আপলোড",
  "docs.digilocker": "ডিজিলকাৰৰ পৰা আনক (ডেমো)",
  "docs.attached": "সংলগ্ন",
  "docs.submit": "আবেদন দাখিল কৰক",
  "docs.incomplete": "দাখিলৰ বাবে সকলো বাধ্যতামূলক নথি সংলগ্ন কৰক। আবেদন সম্পূৰ্ণ হ'লেহে সময়সীমা আৰম্ভ হয়।",
  "query.title": "কাৰ্যালয়ে অধিক তথ্য বিচাৰিছে",
  "query.reply": "উত্তৰ পঠিয়াওক",
  "query.paused": "আপুনি উত্তৰ নিদিয়ালৈকে সময়সীমা স্থগিত থাকিব।",
  "confirm.title": "আপুনি পাইছেনে?",
  "confirm.yes": "হয়, মই পাইছোঁ",
  "login.citizen": "নাগৰিকৰ ছাইন ইন",
  "login.mobile": "মোবাইল নম্বৰ",
  "login.sendOtp": "অটিপি পঠিয়াওক",
  "login.otp": "এবাৰ ব্যৱহাৰযোগ্য পাছৱৰ্ড (অটিপি)",
  "login.verify": "পৰীক্ষা কৰি ছাইন ইন কৰক",
  "login.officer": "বিষয়াৰ ছাইন ইন",
};

export async function getLang(): Promise<Lang> {
  return (await cookies()).get("lang")?.value === "as" ? "as" : "en";
}

export function translate(lang: Lang, key: Key): string {
  return (lang === "as" ? as[key] : undefined) ?? en[key];
}

export async function getT() {
  const lang = await getLang();
  return { lang, t: (key: Key) => translate(lang, key) };
}
