// Content of printable documents, shared by the HTML view and the PDF download.

import { formatDate } from "@/domain/dates";
import { parseJson, prisma } from "@/lib/db";
import type { PdfSection } from "@/lib/pdf";
import { getSettings } from "@/lib/context";
import type { Level } from "@/domain/settings";
import { STEPS, totalFee, type DocItem, type Fee, type FormField, type StepCode, type SystemCheck } from "@/domain/service-config";
import { LEVEL_SHORT } from "./appeals";

export type DocContent = { title: string; subtitle?: string; sections: PdfSection[]; footer?: string; watermark?: string; filename: string };

/** Form 1 acknowledgement (AMS-06, AMS-07). */
export async function form1(applicationId: string): Promise<DocContent | null> {
  const app = await prisma.application.findUnique({ where: { id: applicationId }, include: { service: true, office: { include: { district: true } }, documents: true } });
  if (!app?.uin) return null;
  const s = await getSettings();
  const people = new Map((await prisma.user.findMany({ where: { id: { in: [app.citizenId, app.dpsId, app.faaId, app.saaId] } } })).map((u) => [u.id, u]));
  const p = (id: string) => `${people.get(id)?.name ?? ""}, ${people.get(id)?.designation ?? ""}`;
  const form = parseJson<Record<string, string>>(app.formData, {});
  const extra = parseJson<FormField[]>(app.service.formFields, []).filter((f) => form[f.key]);
  const docs = parseJson<DocItem[]>(app.service.documents, []);
  const check = parseJson<SystemCheck | null>(app.systemCheck, null);
  const fetched = docs.filter((d) => d.fetch && check?.sources[d.fetch]).map((d) => `- ${d.name}: fetched from ${check!.sources[d.fetch!]}`);
  const docLines = [...fetched, ...app.documents.map((d) => `- ${d.name}: ${d.source === "LIVE_CAPTURE" ? "captured live at application" : "received"}`)];
  const workflow = parseJson<StepCode[]>(app.service.workflow, []);
  const fees = parseJson<Fee[]>(app.service.fees, []);
  const timeLimit = app.timeLimitDays ?? app.service.timeLimitWorkingDays;
  return {
    title: "Form 1: Acknowledgement of application",
    subtitle: "Issued under the Assam Right to Public Services Act, 2012. Keep this for your records.",
    filename: `Form1-${app.uin.replaceAll("/", "-")}.pdf`,
    sections: [
      {
        heading: "Application",
        rows: [
          ["Unique Identification Number (UIN)", app.uin],
          ["Service", app.service.name],
          ["Applicant", form.applicantName ?? people.get(app.citizenId)?.name ?? ""],
          ...extra.map((f) => [f.label, form[f.key]] as [string, string]),
          ["Office", `${app.office.name}, ${app.office.district.name}`],
          ["Date of complete submission", formatDate(app.submittedOn, true)],
          ["Time limit", `${timeLimit} working days`],
          ["Expected date of disposal", formatDate(app.dueOn, true)],
          ...(app.feeRef ? [["Fee paid", `Rs. ${totalFee(fees)} (${fees.map((f) => `${f.label} Rs. ${f.amount}`).join(", ")}), eGRAS ref. ${app.feeRef}`] as [string, string]] : []),
        ],
      },
      { heading: "Documents", paragraphs: docLines.length ? docLines : ["-"] },
      ...(workflow.length ? [{ heading: "How your application will be processed", paragraphs: [`System check against Government records (done), then ${workflow.map((w) => STEPS[w].label.toLowerCase()).join(", then ")}. The same ${timeLimit}-working-day time limit applies whatever documents were submitted.`] }] : []),
      {
        heading: "Officers responsible",
        rows: [
          ["Designated Public Servant (DPS)", p(app.dpsId)],
          ["First Appellate Authority (FAA)", p(app.faaId)],
          ["Second Appellate Authority (SAA)", p(app.saaId)],
        ],
      },
      {
        heading: "If the service is late or refused",
        paragraphs: [
          `If the service is not delivered by the due date, Sewa Setu will prepare a first appeal for you and send you a link by SMS and email. You decide whether to file it. You can also appeal if the application is rejected.`,
          `A first appeal can be filed within ${s.firstAppealWindowDays} days. A request for more information from the office pauses the time limit until you reply.`,
        ],
      },
    ],
    footer: "This is a computer-generated acknowledgement from the Sewa Setu proof of concept. Names and offices are fictional.",
  };
}

const GROUND_TEXT: Record<string, string> = { DELAY: "Service not delivered within the time limit", REJECTION: "Application rejected" };

async function peopleMap(ids: (string | null | undefined)[]) {
  const users = await prisma.user.findMany({ where: { id: { in: ids.filter((x): x is string => !!x) } } });
  return new Map(users.map((u) => [u.id, u]));
}

/** Appeal acknowledgement (AMS-30). */
export async function appealAck(appealId: string): Promise<DocContent | null> {
  const a = await prisma.appeal.findUnique({ where: { id: appealId }, include: { application: { include: { service: true } } } });
  if (!a?.filedOn) return null;
  const people = await peopleMap([a.application.citizenId, a.authorityId]);
  const auth = people.get(a.authorityId ?? "");
  return {
    title: `Acknowledgement of ${LEVEL_SHORT[a.level as Level]}`,
    subtitle: "Filed under the Assam Right to Public Services Act, 2012.",
    filename: `Appeal-${a.appealNo.replaceAll("/", "-")}.pdf`,
    sections: [
      {
        rows: [
          ["Appeal number", a.appealNo],
          ["Appellant", people.get(a.application.citizenId)?.name ?? ""],
          ["Application", `${a.application.service.name}, UIN ${a.application.uin}`],
          ["Ground", GROUND_TEXT[a.ground]],
          ["Filed on", formatDate(a.filedOn, true)],
          ["Filed late", a.isLate ? `Yes. Reason given: ${a.lateReason}` : "No"],
          ["Appellate authority", a.level === "TAA" ? "Assam Right to Public Services Commission (Demo)" : auth ? `${auth.name}, ${auth.designation}` : ""],
          [a.level === "TAA" ? "Target date (not binding)" : "To be decided by", formatDate(a.deadlineOn, true)],
        ],
      },
      { heading: "Grounds of appeal", paragraphs: [a.groundsText ?? ""] },
      { heading: "Relief sought", paragraphs: [a.reliefSought ?? ""] },
    ],
    footer: "Hearings are online by default. You will get a notice on Sewa Setu, by SMS and by email at least 7 clear working days before any hearing.",
  };
}

/** Reasoned order of an appellate authority (AMS-53 to AMS-67). Unsigned orders carry a DRAFT watermark. */
export async function orderDoc(orderId: string): Promise<DocContent | null> {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    include: { appeal: { include: { application: { include: { service: true, office: true } }, hearings: true, directions: true, bench: true, votes: true } } },
  });
  if (!o) return null;
  const a = o.appeal;
  const app = a.application;
  const plan = parseJson<{ officerId: string; capacity: string; amount: number }[]>(o.penaltyPlan, []);
  const penalties = await prisma.penalty.findMany({ where: { orderId } });
  const benchIds = parseJson<string[]>(a.bench?.memberIds, []);
  const people = await peopleMap([app.citizenId, app.dpsId, o.signedById, o.draftedById, o.authenticatedById, app.office.headOfOfficeId, ...plan.map((p) => p.officerId), ...benchIds]);
  const majority = parseJson<{ counts?: Record<string, number>; decided?: string; casting?: string | null }>(o.majority, {});
  const who = (id: string | null | undefined) => (id && people.get(id) ? `${people.get(id)!.name}${people.get(id)!.designation ? `, ${people.get(id)!.designation}` : ""}` : "");
  const direction = a.directions.find((d) => d.orderId === o.id);
  const held = a.hearings.filter((h) => h.status === "HELD");
  const capacity = (c: string) => (c === "LINK_OFFICER" ? "Link Officer" : c === "DPS" ? "Designated Public Servant" : c === "FAA" ? "First Appellate Authority" : c === "SAA" ? "Second Appellate Authority" : c);
  const isTaa = a.level === "TAA";
  const signer = o.signedById ?? o.draftedById;
  return {
    title: `${isTaa ? "Order of the RTPS Commission" : "Order"} in ${LEVEL_SHORT[a.level as Level]} ${a.appealNo}`,
    subtitle: `Order number ${o.orderNo}. Under the Assam Right to Public Services Act, 2012.`,
    filename: `Order-${o.orderNo.replaceAll("/", "-")}.pdf`,
    watermark: o.status === "DRAFT" ? "DRAFT - NOT SIGNED" : isTaa && o.status !== "AUTHENTICATED" ? "NOT YET AUTHENTICATED" : undefined,
    sections: [
      {
        rows: [
          ["Appellant", people.get(app.citizenId)?.name ?? ""],
          ["Respondent", who(app.dpsId)],
          ["Application", `${app.service.name}, UIN ${app.uin}`],
          ["Ground", GROUND_TEXT[a.ground]],
          ["Appeal filed on", formatDate(a.filedOn)],
          ...(isTaa ? [["Bench", benchIds.map((m) => `${people.get(m)?.name ?? ""}${m === a.bench?.presidingId ? " (presiding)" : ""}`).join(", ")] as [string, string]] : []),
          ["Hearing", held.length ? held.map((h) => `${formatDate(h.scheduledOn)} (${h.mode === "ONLINE" ? "online" : "in person"})`).join("; ") : "Decided on the record without a hearing"],
        ],
      },
      { heading: "Findings", paragraphs: [o.findings] },
      { heading: "Reasons", paragraphs: [o.reasons] },
      ...(isTaa && majority.counts
        ? [{
            heading: "Decision of the bench",
            paragraphs: [
              `Votes: allow ${majority.counts.ALLOW ?? 0}, dismiss ${majority.counts.DISMISS ?? 0}, remand ${majority.counts.REMAND ?? 0}.${majority.casting ? ` The bench being evenly divided, the Chief Commissioner (${people.get(majority.casting)?.name ?? ""}) gave the casting vote.` : ""}`,
              ...(o.dissent ? [`Dissent: ${o.dissent}`] : ["The decision is unanimous."]),
            ],
          }]
        : []),
      {
        heading: "Order",
        paragraphs: [
          ORDER_OUTCOME_TEXT[o.outcome] ?? o.outcome,
          ...(o.directionText ? [`${o.directionText}${direction ? ` Due date: ${formatDate(direction.dueOn, true)}.` : ""}`] : []),
        ],
      },
      {
        heading: "Penalty",
        paragraphs: plan.length
          ? plan.map((p) => {
              const pen = penalties.find((x) => x.officerId === p.officerId);
              const why = p.capacity === "FAA" || p.capacity === "SAA" ? "for not deciding the appeal by its deadline" : `who held the case for ${pen?.delayDaysAttributed ?? 0} working days of the delay`;
              return `A penalty of Rs. ${p.amount.toLocaleString("en-IN")} is imposed on ${who(p.officerId)} (${capacity(p.capacity)})${pen ? `, ${why}. Penalty reference ${pen.ref}: to be paid through eGRAS by ${formatDate(pen.dueOn)}; otherwise it will be recovered from salary` : ""}.`;
            })
          : [`No penalty is imposed. Reason: ${o.noPenaltyReason ?? ""}`],
      },
      ...(o.disciplinaryRecommendation ? [{ heading: "Recommendation for disciplinary action", paragraphs: [o.disciplinaryRecommendation] }] : []),
      {
        heading: "Signature",
        paragraphs: [
          o.status === "DRAFT"
            ? `Draft prepared by ${who(o.draftedById)} on ${formatDate(o.draftedOn)}. Not yet signed; not valid.`
            : `Digitally signed by ${who(signer)}${isTaa ? " (presiding member)" : ""} on ${formatDate(o.signedOn, true)}. e-Sign reference ${o.esignRef}.`,
          ...(isTaa ? [o.authenticatedOn ? `Authenticated by ${who(o.authenticatedById)}, Registrar, on ${formatDate(o.authenticatedOn, true)}.` : "Awaiting authentication by the Registrar; not yet in effect."] : []),
          `Copies to: the appellant; the respondent; the Head of Office (${who(app.office.headOfOfficeId) || app.office.name})${plan.length ? "; the officers penalised" : ""}.`,
        ],
      },
    ],
    footer: "Generated by the Sewa Setu proof of concept. Names, offices and cases are fictional; the e-Sign is simulated.",
  };
}

const ORDER_OUTCOME_TEXT: Record<string, string> = {
  ALLOWED: "The appeal is allowed.",
  REJECTION_SET_ASIDE: "The appeal is allowed. The order of rejection is set aside.",
  DISMISSED: "The appeal is dismissed.",
  REMANDED: "The case is sent back (remanded) to the lower authority for a fresh decision within the time set by the Commission.",
};

export type DocKind = "order" | "appeal";

/** Loads a printable document after checking that the user may see it. Citizens see only their own. */
export async function loadDoc(kind: DocKind, id: string, user: { id: string; role: string }): Promise<DocContent | null> {
  const appealId = kind === "order" ? (await prisma.order.findUnique({ where: { id }, select: { appealId: true, status: true, level: true } })) : { appealId: id, status: "SIGNED", level: "" };
  if (!appealId) return null;
  const a = await prisma.appeal.findUnique({ where: { id: appealId.appealId }, include: { application: { select: { citizenId: true } }, bench: true } });
  if (!a) return null;
  if (user.role === "CITIZEN" && a.application.citizenId !== user.id) return null;
  // An unsigned order is the deciding authority's (or bench's) working draft: nobody else sees it.
  const deciders = a.level === "TAA" ? parseJson<string[]>(a.bench?.memberIds, []) : [a.authorityId];
  if (appealId.status === "DRAFT" && !deciders.includes(user.id)) return null;
  // A Commission order reaches the parties only once the Registrar has authenticated it.
  if (appealId.level === "TAA" && appealId.status === "SIGNED" && user.role === "CITIZEN") return null;
  return kind === "order" ? orderDoc(id) : appealAck(id);
}
