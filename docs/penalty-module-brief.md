# Brief: penalty payment and recovery module (POC)

> Source: the brief supplied by the project lead in the build conversation (30 Oct 2026), kept here as the reference for scope and behaviour.
> The main-flow diagram arrived flattened; it is restated as a list under "Main flow".
> **Decision (30 Oct 2026): this is built as a module of the existing Sewa Setu appeals PoC, not as a separate POC.** Where the brief says to stub the appeal system with seeded data, the real appeal flow in this PoC is used instead. See PLAN.md, Part 2.

## Role and goal

You are building a working proof of concept (POC) of the penalty payment and recovery module for the Appeal Management System on Sewa Setu, the Government of Assam's citizen services portal.

The POC covers only the penalty module: from the moment an appellate authority imposes a penalty on an officer to the moment the penalty is closed. Do not build the rest of the appeal system. Applications, appeals and hearings are represented only by seeded data and a simple "issue penalty order" screen.

It is for a demonstration to the Administrative Reforms Department, the Finance Department and the Right to Public Services (RTPS) Commission. A presenter should be able to show the normal flow and every exception case in about 15 minutes, using seeded data and a simulated clock.

It is a POC, not a production system. External systems (eGRAS, payroll, staff records, treasury, SMS, email, e-Sign) are realistic mocks behind clean interfaces (adapters), so they can be replaced later.

## Background

Under the Assam Right to Public Services (ARTPS) Act, an officer who delays a notified service without good reason can be penalised by an appellate authority. Penalties go to a Government head of account, never to the citizen.

Who can be penalised, and by whom (ARTPS Act, section 9):

| Imposed by | On | Range (Rs.) |
|---|---|---|
| First Appellate Authority (FAA) | Designated Public Servant (DPS) | 100 – 5,000 |
| Second Appellate Authority (SAA) | DPS | 100 – 7,000 |
| RTPS Commission | DPS | 100 – 10,000 |
| RTPS Commission | FAA | 500 – 5,000 |
| RTPS Commission | SAA | 1,000 – 5,000 |

The DPS is the officer responsible for delivering the service. "DPS" here also covers a Link Officer (an officer standing in for an absent DPS) or a successor named in the order. Every penalty is linked to a UIN, the application's Unique Identification Number, and to an appeal number, which is the UIN plus -FAA, -SAA or -TAA.

## Roles

| Role | What they do in this module |
|---|---|
| Appellate authority (FAA, SAA, Commission) | Issues and e-signs the penalty order |
| Penalised officer (DPS, FAA or SAA) | Sees the penalty on their dashboard and pays by QR code through eGRAS within 30 days |
| Sewa Setu DDO | A portal-level officer at AITEC & CSD Society. Confirms non-payment, raises recovery tickets, verifies deduction proof, handles exceptions and refunds, keeps the monthly statement. Not the penalised officer's own salary DDO. |
| Finance nodal officer for RTPS penalties, plus a backup | Deducts unpaid penalties from salary centrally through the State payroll and uploads proof |
| Finance senior officer | Receives escalations when tickets or credits are overdue |
| Competent Authority | The penalised officer's appointing or disciplinary authority. Receives a copy of the order; signs Recovery Directions (in per-case mode) and write-off approvals. |
| Commission (monitoring view) | Sees the penalty ledger, overdue recoveries, missing credits, double recoveries and write-offs |
| Admin | Settings, simulated clock, demo reset |

Recovery is central. Every unpaid penalty goes through the Sewa Setu DDO and the Finance nodal officer. Do not route recovery through each office's own DDO.

## Main flow

1. Penalty order signed by FAA, SAA or Commission.
2. Shown on the officer's dashboard: UIN, appeal no., authority, amount, last date, QR code. SMS and email sent.
3. Paid via QR within 30 days?
   - Yes: paid via eGRAS; GRN auto-matched to the penalty; penalty closed.
   - No: day 30, the system flags it unpaid after the settlement wait; the Sewa Setu DDO confirms; QR switched off.
4. Recovery Direction attached: standing or per case.
5. Recovery ticket to the Finance nodal officer: one per officer, all unpaid UINs.
6. Salary deducted in the next cycle. Nodal officer uploads proof.
7. Sewa Setu DDO verifies proof. Officer gets the deduction message.
8. Monthly statement: credited to the head of account?
   - Yes: penalty closed.
   - No: follow up with the nodal officer; escalate to the Finance senior officer and the Commission.

## Statuses (one state machine, enforced on the server)

RAISED → PAID_EGRAS → CLOSED

RAISED → OVERDUE (day 30 passed, waiting for any pending GRN) → UNPAID_CONFIRMED → IN_RECOVERY (ticket open) → PARTLY_DEDUCTED (instalments) → DEDUCTED → RECOVERED (proof verified) → CREDIT_CONFIRMED → CLOSED

Side states:

- STAYED, which pauses everything and resumes to the earlier state;
- REDUCED or SET_ASIDE, which can lead to REFUND_DUE and then REFUNDED;
- EXCEPTION, the manual queue;
- WRITE_OFF_REQUESTED, then WRITTEN_OFF;
- CREDIT_MISSING, then ESCALATED.

Keep all transitions and their guards in one module. Every transition writes to an append-only audit log with actor, role, simulated timestamp, reason and before/after status.

## Step-by-step behaviour

1. **Issue the penalty.** The appellate authority opens a seeded appeal and fills a penalty order: officer (picked from the case's officers), amount, reasons. It is then e-signed (mocked).
   - The amount must be within the section 9 range for that authority and officer.
   - The order creates a Penalty record with: employee ID, name, designation and office of the penalised officer; UIN, appeal number, imposing authority, amount, order date; service date, meaning deemed service: the order is on the dashboard and an SMS or email has been sent. Record both timestamps; due date = service date + 30 days.
   - The officer's dashboard shows a penalty card with these details and a mock eGRAS QR code. The QR encodes the penalty reference, UIN, exact amount and head of account.
   - A copy of the order goes to: the officer; the public authority; the Competent Authority; the Sewa Setu DDO; the Finance nodal officer.
   - Reminders to the officer on day 20 and day 27 (configurable).
2. **Pay by QR.** A mock eGRAS page takes the payment and returns a GRN (eGRAS receipt number) with status PENDING. It becomes SUCCESS or FAILED after a settlement lag on the simulated clock (default 1 working day). The portal matches the GRN to the penalty by reference and amount. There is no manual "mark paid" for the eGRAS route.
3. **Day 30.** If unpaid, move to OVERDUE.
   - If any GRN is pending, wait up to the settlement window (default 3 working days) before going further.
   - Then the case appears in the Sewa Setu DDO's "Confirm unpaid" queue. The DDO cannot confirm while a GRN is pending.
   - On confirmation, the QR code is switched off and the officer is told that recovery from salary will follow.
4. **Recovery Direction**, according to the setting:
   - Standing: attach the standing order reference automatically.
   - Per case: send a draft to the Competent Authority to e-sign (mocked), with reminders.
   - The ticket cannot be sent until the direction is in place.
5. **Recovery ticket** to the Finance nodal officer.
   - There is one open ticket per officer, with one line per UIN. New confirmed penalties for the same officer are added to the open ticket.
   - The ticket shows employee ID, name, designation, office, monthly pay and payroll type (from mock staff records), the items, the total, and the instalment plan.
   - If the total is above the instalment threshold (default Rs. 10,000), split it into up to N monthly instalments (default 3).
   - The ticket is due by the next salary pay date plus a grace period (default 5 working days).
   - If the primary nodal officer is marked on leave, tickets go to the backup.
6. **Deduction.** For each line, the nodal officer records: the payroll deduction reference; the salary month; the amount; the treasury voucher number crediting the head of account; an uploaded proof file. Status becomes DEDUCTED, or PARTLY_DEDUCTED for instalments and partial deductions. The balance carries to the next cycle automatically. The nodal officer cannot close a penalty or change its amount.
7. **Verification.** The Sewa Setu DDO checks the proof against the line (employee ID, UIN, amount). They either mark it RECOVERED or return it to the nodal officer with a reason. They cannot mark it recovered without the nodal officer's proof. On RECOVERED, the officer receives an SMS, an email and a dashboard message, copied to the imposing authority and the Competent Authority:

   > Deduction for UIN \<UIN\> has been processed. Rs. \<amount\> has been deducted from your salary for \<month\>.

8. **Monthly statement.** On the first working day of each month (simulated clock), generate the statement for the previous month.
   - Show, per penalty: imposed; collected through eGRAS (GRN); deducted (voucher); credited to the head of account (from a mock treasury credit feed); difference.
   - A matching credit moves the penalty to CREDIT_CONFIRMED and then CLOSED. eGRAS SUCCESS counts as credited directly.
   - If a deduction has no credit after the credit window (default 15 days), move it to CREDIT_MISSING. Create a follow-up task for the nodal officer. If it is still unresolved after the escalation period (default 7 days), move it to ESCALATED and show it to the Finance senior officer and the Commission.
   - The statement can be downloaded as CSV and PDF and is shared with the Commission view.

## Exception cases (all must be handled and demonstrable)

| # | Case | Required behaviour |
|---|---|---|
| E1 | GRN pending on day 30 | Wait for the settlement window. If SUCCESS, close with no ticket. If FAILED, continue to unpaid. |
| E2 | Officer pays through eGRAS after the ticket is raised but before deduction | Remove that line from the ticket automatically and tell the nodal officer to stop. The penalty closes on the eGRAS route. |
| E3 | Officer pays through eGRAS and salary is also deducted (double recovery) | Flag it, create a refund task for the nodal officer and tell the officer. The refund is recorded with a reference, then REFUNDED. The case is shown to the Commission. |
| E4 | Wrong amount paid (a manual challan outside the QR) | Short payment: the balance stays due and recovery continues for the balance only. Excess: create a refund task. |
| E5 | Stay by a higher authority, the Commission or a court | An authorised user records the stay with the order reference and an upload. The 30-day clock pauses, the QR is switched off, the ticket line goes on hold and the nodal officer is told to stop deductions. When the stay is lifted, resume with the remaining days. |
| E6 | Penalty reduced or set aside on review, appeal or by a court | Adjust the amount. If more was collected than is now due, create a refund task to the nodal officer. Notify the officer and the imposing authority. |
| E7 | Officer transferred | No change to recovery, which follows the employee ID. The penalty stays on the officer's personal dashboard and is not shown to the successor in the post. |
| E8 | Officer not on the State payroll (deputation outside the State, urban local body, autonomous body, PSU, contractual) | Detect from the payroll type in staff records when the ticket is being created and route to the Sewa Setu DDO's exceptions queue. There the DDO records a letter to the paying authority, its reply and the proof by hand. |
| E9 | Officer retiring within 3 months | Alert the Sewa Setu DDO and nodal officer and put the ticket at the front of the queue. After retirement, follow the pension setting: continue against pension, or move to the exceptions queue. |
| E10 | Officer resigned, dismissed or deceased | Move to the exceptions queue. The Sewa Setu DDO can request a write-off. |
| E11 | Officer suspended (subsistence allowance) | Move to the exceptions queue with a note. Treat this as an open point. |
| E12 | Several penalties on one officer | Combine them into one ticket and apply the instalment rule to the total. |
| E13 | Salary not enough, or only partly deducted | PARTLY_DEDUCTED. The balance carries to the next cycle automatically. |
| E14 | Nodal officer (and backup) miss the ticket deadline | Escalate to the Finance senior officer and show as overdue recovery in the Commission view. |
| E15 | Deducted but not credited to the head of account | CREDIT_MISSING, then follow-up, then ESCALATED, as in step 9. |
| E16 | Employee ID not found or details don't match | Hold in the exceptions queue until the Sewa Setu DDO corrects the record. |
| E17 | Officer says they never received the order | The penalty screen shows the proof of service: dashboard timestamp, SMS or email log, and first view time. |
| E18 | Penalty cannot be recovered | Write-off only with approval from the Competent Authority (mocked), with a reason. Every write-off appears in the monthly statement and the Commission view. |

## Controls (enforce on the server, not only in the UI)

- The penalty amount must be within the section 9 range for that authority and officer.
- No manual "paid" on the eGRAS route; GRN matching only.
- The Sewa Setu DDO cannot confirm a penalty unpaid while a GRN is pending, and cannot mark it recovered without the nodal officer's proof.
- The Finance nodal officer cannot close a penalty or change its amount.
- No ticket without a Recovery Direction in place.
- Visibility: a penalty can be seen only by: the penalised officer; the imposing authority; the Competent Authority; the Sewa Setu DDO; the Finance nodal officer and their backup; the Finance senior officer; the Commission. Other officers never see it.

## Screens

- Sign-in: mock username, password and OTP, plus a demo role switcher in the header to jump between seeded users of every role above.
- Appellate authority: a list of seeded appeals and an "Issue penalty order" form with range validation and mock e-Sign.
- Penalised officer: "My penalties" with status, amount, last date, QR code, proof of service, payment and deduction history, and messages.
- Mock eGRAS page: pay the exact amount, or (demo only) pay a different amount, and see the GRN.
- Sewa Setu DDO workbench, with tabs: Confirm unpaid; Tickets (open, due, overdue); Verify proof; Exceptions queue; Refunds; Credit missing; Monthly statement.
- Finance nodal officer: ticket queue with deduction entry, proof upload, refund tasks and the leave or backup toggle.
- Finance senior officer: escalated tickets and missing credits.
- Competent Authority: Recovery Directions to sign (per-case mode), write-off approvals.
- Commission view: penalty ledger (imposed, paid through eGRAS, recovered from salary, credited, outstanding, refunded, written off), overdue recoveries, missing credits, double recoveries.
- Penalty detail page: full timeline of every status change, document and message, from the audit log.
- Notification log: stands in for SMS and email, showing recipient, channel, text and time.
- Admin: settings, simulated clock, and "Reset demo data".

Use plain, polite English throughout. The users are government officers, not lawyers. Write full forms before abbreviations on first use on each screen. For example, say "Penalty not yet paid; recovery from salary will follow", not "DEFAULTER".

## Simulated clock

There is a global "today" date the Admin can move forward by 1 day, 7 days or 30 days, or to a chosen date. On every move, run the scheduler, which handles: reminders; GRN settlement; day-30 flags; ticket due dates and escalations; instalments carried forward; treasury credits arriving; the monthly statement; missing-credit escalations; retirement alerts.

Count working days on a seeded calendar with Assam public holidays for 2026–27.

## Settings (admin screen)

| Setting | Default |
|---|---|
| Reminder days | 20 and 27 |
| eGRAS settlement lag | 1 working day |
| Settlement wait before confirming unpaid | 3 working days |
| Recovery Direction mode | Standing order (alternative: per case) |
| Standing order reference | Placeholder text |
| Government notification reference for central recovery | Placeholder text |
| Instalment threshold | Rs. 10,000 |
| Maximum instalments | 3 |
| Salary pay date | Last working day of the month |
| Nodal officer grace after pay date | 5 working days |
| Credit confirmation window | 15 days |
| Escalation after credit missing | 7 days |
| Pension recovery after retirement | Off (alternative: on) |
| Head of account code | Placeholder |
| Section 9 penalty ranges | As in the table above, editable |

## Mocks

- eGRAS: a payment page, GRN status changing on the simulated clock, and a demo control to force a GRN to fail.
- Staff records: employee ID, name, designation, office, monthly pay, payroll type, retirement date, status (active, suspended, retired, resigned, deceased).
- Payroll: a deduction confirmation reference.
- Treasury credit feed: credits arrive N days after deduction, with a demo control to drop one credit.
- SMS and email: the notification log.
- e-Sign: a "Sign" button that stamps name, role and time.

## Seed data and demo scenarios

Seed clearly fictional officers, offices and districts in Assam; do not use real officers' names. Include: about 10 officers covering DPS, FAA and SAA; one on deputation outside the State payroll; one retiring within 2 months; one suspended; a few seeded appeals with UINs ready for penalty orders.

Provide a "Demo scenarios" page that opens each of these directly:

1. **Paid by QR.** An FAA penalty of Rs. 2,000 on a DPS is paid on day 12. The GRN is matched and the penalty closes, with no ticket.
2. **Unpaid to closed (main flow).** An SAA penalty of Rs. 4,000 goes unpaid for 30 days. The Sewa Setu DDO confirms it unpaid, and the ticket goes to the nodal officer. The nodal officer deducts it and uploads proof. The Sewa Setu DDO verifies it and the officer gets the deduction message. The monthly statement confirms credit and the penalty closes.
3. **Commission penalises an FAA and a DPS.** Two penalties come from one Commission order. One is paid by QR; the other is recovered from salary.
4. **Pending payment on day 30 (E1).** The officer pays on day 30. The GRN is pending, so the system waits, then it succeeds and no ticket is raised. A variant has the GRN fail and recovery continue.
5. **Late payment and double recovery (E2, E3).** The officer pays after the ticket is raised, and the line is removed automatically. A second case is paid and deducted in the same month, which is flagged as double recovery and refunded.
6. **Stay, then set aside (E5, E6).** Deductions are on instalments when a court stay is recorded. Deductions stop, the penalty is later set aside, and the amount already deducted is refunded.
7. **Two penalties, instalments, partial deduction (E12, E13).** Rs. 5,000 and Rs. 8,000 on one officer go on one ticket and are split into 3 instalments. One month is only partly deducted.
8. **Outside the State payroll (E8).** An officer on deputation goes to the exceptions queue and is handled by hand.
9. **Retirement and write-off (E9, E18).** The retiring officer is flagged first. With pension recovery off, the case goes to the exceptions queue. A write-off is requested and approved by the Competent Authority.
10. **Credit missing (E15).** A deduction is not credited. It shows in the monthly statement, gets a follow-up, then is escalated to Finance and the Commission.
11. **Nodal officer misses the deadline (E14).** The backup is on leave too. The ticket escalates.
12. **"I never got the order" (E17).** The penalty screen shows the proof of service.

A "Reset demo data" button reseeds the database and resets the clock.

## Suggested stack

Next.js (App Router) with TypeScript and Tailwind CSS; Prisma with SQLite; Vitest for unit tests, Playwright for end-to-end tests; one command to run: `npm install && npm run setup && npm run dev`, where setup migrates and seeds.

## Out of scope

The rest of the appeal system (applications, appeal filing, hearings, escalation between appeal levels); real eGRAS, payroll, staff records, treasury, SMS, email or e-Sign; production security hardening; Assamese translation.

## How to work

- Plan first: PLAN.md with the data model, the state machine with every transition and guard, the scheduler jobs, the screens and the milestones. Under "Assumptions", note that central recovery by a Finance nodal officer differs from Rule 6(5) of the Assam Right to Public Services Rules, 2026, which places recovery with the penalised officer's own DDO under a Recovery Direction from the Competent Authority; the POC therefore assumes a Government notification designating the Finance nodal officer and the Sewa Setu DDO for this purpose. Wait for the go-ahead before writing code.
- Milestones, each ending in a runnable app: M1 data model, seed, sign-in and role switcher, simulated clock, issuing a penalty order, officer dashboard, mock eGRAS with GRN matching. M2 day-30 confirmation, Recovery Direction, tickets, deduction, verification, deduction message. M3 monthly statement, treasury feed and reconciliation, escalations. M4 exception cases E1 to E18, the Commission view, demo scenarios, polish.
- Unit tests for: due date from deemed service with working days and holidays; settlement wait and GRN outcomes; the guard against confirming unpaid while a GRN is pending; one ticket per officer and the instalment split; automatic removal of a line on late payment; double-recovery detection and refund; stay pause and resume with the remaining days; reduction or set-aside refunds; routing to the exceptions queue by payroll type and officer status; partial deduction carry-forward; nodal officer deadline escalation; the monthly statement and credit-missing escalation; section 9 range validation; every role permission guard. Playwright tests for Scenarios 2 and 5.
- After each milestone, run the tests, fix failures and update README.md. Finish with a README.md (setup and a 15-minute demo script covering Scenarios 1, 2, 5, 6 and 10) and a COVERAGE.md table (each step, exception case and control, with Done / Partial / Mocked and a note).
- If something is unclear, choose the option closest to the flow above, record it under "Assumptions", and carry on. Stop to ask only if the choice would change the data model substantially.
