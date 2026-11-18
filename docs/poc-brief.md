# POC brief: Sewa Setu Appeal Management System

> Source: the brief supplied by the project lead in the build conversation (29 Oct 2026).
> `docs/appeal-features.md` was not available, so this brief is the reference for both scope and behaviour.
> Feature IDs used in PLAN.md and FEATURE_COVERAGE.md follow the ranges in this brief; the individual
> ID-to-feature assignments are provisional (see PLAN.md, Appendix A).

## Role and goal

Build a working proof of concept (POC) of the Appeal Management System for Sewa Setu, the Government of Assam's citizen services portal. The POC is for a demonstration to government officers and the Right to Public Services (RTPS) Commission. It should let a presenter walk through the full life of an appeal, end to end, in about 15 minutes, using pre-loaded demo data and a simulated clock.

It is a POC, not a production system. Favour a complete, clear, working journey over breadth. Anything external (OTP, SMS, video hearings, payments, e-Sign, DigiLocker, departmental systems) should be a realistic mock.

## Background

Under the Assam Right to Public Services (ARTPS) Act, 2012 (amended 2019 and 2024), each notified government service has a fixed time limit. If the service is not delivered in time, or the application is rejected, the citizen can appeal at three levels:

| Level | Who | Time to decide | Appeal code |
|---|---|---|---|
| First appeal | First Appellate Authority (FAA) | 30 days (target; basis to be confirmed) | FAA |
| Second appeal | Second Appellate Authority (SAA), the senior-most Secretary of the department | 60 days, extendable to 75 with a recorded reason | SAA |
| Third appeal | RTPS Commission, sitting in benches | 90-day target, not binding | TAA |

The officer who delivers the service is the Designated Public Servant (DPS). A Link Officer stands in for a DPS who is absent. Other roles: Registrar (Commission's records and scrutiny), Drawing and Disbursing Officer (DDO) (salary recovery of penalties), Head of Office, Admin.

### Key rules of the to-be process

- Two grounds of appeal only: the time limit was missed, or the application was rejected. No third ground for refusal to accept an application.
- No advance consent. The application form does not ask for consent to an automatic appeal.
- Time limit counts in working days. It starts only when a complete application is submitted and a Unique Identification Number (UIN) is issued. A request for information from the DPS pauses it. The DPS raises all queries in one request; a second request needs a recorded reason.
- Hold at breach. Once the time limit passes, the application is held. The DPS cannot close or reject it while an appeal is possible or open. Any attempt is refused and logged.
- Draft appeal, citizen files. On breach, the portal prepares a draft first appeal and "sends" the citizen an SMS and email link, valid for 30 days. The citizen files with one click, edits the grounds and files, or declines. Nothing is filed without the citizen's action.
- Appeal number = UIN + level code, e.g. `RTPS-PRC/2026/000123-FAA`.
- Filing windows: 45 days for a first appeal; 60 days from the FAA's order for a second; 90 days from the SAA's order for a third. Late filing needs a reason the authority accepts. A third appeal is never accepted after 120 days.
- Automatic escalation to the next level when an authority misses its deadline: FAA to SAA, then SAA to Commission. The missed deadline is recorded on the appeal so the Commission can later penalise that authority.
- Citizen-filed next appeal: if an authority decided but the service still has not been delivered, the portal drafts the next appeal for the citizen.
- No dealing assistant layer. Appeals go straight to the deciding authority's worklist.
- Hearings: online by default, notice at least 7 clear working days ahead. Notice is served once it is on the dashboard and an SMS or email alert is sent. In person only if the citizen lacks digital access or original records are needed.
- Reasoned, digitally signed orders from templates. No order without reasons. Every order prompts for a penalty; if none, a reason is required.
- Penalty ranges (Rs.): FAA on DPS 100–5,000; SAA on DPS 100–7,000; Commission on DPS 100–10,000, on FAA 500–5,000, on SAA 1,000–5,000. The penalty falls on the officer who held the case during the delay, using a responsibility ledger (DPS, Link Officer or successor).
- Penalty payment: eGRAS link (mocked), 30 days to pay. Then a Recovery Direction and Recovery Advice go to the DDO for salary deduction, tracked until full credit.
- Commission: Registrar scrutiny, then benches of one or more Commissioners. Majority decides, Chief Commissioner's casting vote on a tie, dissent recorded. Remand to a lower authority with a 15-day deadline.
- Closure on delivery, not on order. An allowed appeal closes only when the DPS records delivery and the citizen confirms receipt (portal or call centre). A missed direction reopens the case.
- Repeated delay flag: a DPS with delays in 25% or more of cases over 6 months is flagged.

### Open points (build as admin switches)

| Setting | Default | Alternative |
|---|---|---|
| Draft link validity | 30 days (Rule 8(1)(d)) | 45 days |
| Draft appeal on rejection | Off: citizen starts it manually | On: portal drafts it |
| Escalation destination on missed deadline | Next level (FAA→SAA→Commission) | Straight to Commission |
| If citizen declines or the link lapses | Application stays held, flagged to Head of Office | Application released back to DPS |

## Stack

Next.js (App Router) + TypeScript + Tailwind; Prisma + SQLite; Vitest; one Playwright end-to-end test. One command: `npm install && npm run setup && npm run dev`.

## Must-haves (by feature range)

1. Sign-in and roles (COM-01 to COM-03, COM-06): mock OTP, officer password + mocked second factor, demo role switcher, role dashboards.
2. Simulated clock and scheduler; Assam working-day calendar 2026–27.
3. Application (AMS-01 to AMS-13): 5–6 services, completeness, UIN, Form 1 acknowledgement (PDF/print), DPS worklist, query/deliver/reject, Link Officer handover + responsibility ledger.
4. Breach, hold and draft appeal (AMS-14 to AMS-28).
5. First appeal at the FAA (AMS-32 to AMS-68): worklist, reminders, case view, DPS reply, hearing with 7-clear-working-day notice, order builder, mock e-Sign, copies.
6. SAA and Commission (AMS-69 to AMS-85): escalation, citizen-filed 2nd/3rd appeals, SAA extension, Registrar scrutiny, bench votes, remand, Commission penalty on FAA/SAA.
7. Penalty and recovery (AMS-86 to AMS-100).
8. Compliance and closure (AMS-101 to AMS-111).
9. Dashboards and reports (AMS-112 to AMS-125, selected).
10. Cross-cutting: append-only audit log, notification log, rules as settings (AMS-127), plain language, English/Assamese toggle (Assamese draft for nav + citizen screens), mobile (COM-05), dismissible "Feature reference" tags.

## Out of scope

Real OTP/SMS/email gateways, video conferencing, eGRAS, e-Sign, DigiLocker, payroll, departmental APIs; data migration; production security; full accessibility certification; full Assamese translation. Keep adapters so each can be swapped in.

## Demo scenarios

1. On time. 2. Breach to delivery (one-click filing, hearing, Rs. 2,000 penalty, delivery, confirmation, unpaid → DDO recovery). 3. Escalation chain (FAA misses → SAA, SAA extends to 75 and misses → Commission, bench 2–1, penalises DPS and FAA). 4. Rejection appeal (FAA sets aside with direction). 5. Link Officer (delay split; penalty on Link Officer). 6. Attempted closure (refused, appears in review register). 7. Remand (Commission → FAA, 15 days, FAA decides in time). 8. Citizen declines (link lapses, outcome per switch). "Reset demo data" reseeds and resets the clock.

## Way of working

Plan first (PLAN.md), wait for go-ahead. Milestones M1–M5, each runnable. State machines in one place with server-side guards. Unit tests for the core rules; Playwright for Scenario 2. After each milestone: tests, README.md, FEATURE_COVERAGE.md. Finish with README (setup + 15-minute demo script for Scenarios 2, 3, 6) and complete FEATURE_COVERAGE.md.
