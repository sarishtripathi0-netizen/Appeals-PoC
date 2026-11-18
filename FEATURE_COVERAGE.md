# Feature coverage

Feature IDs are the **provisional** catalogue in [PLAN.md, Appendix A](PLAN.md#appendix-a-provisional-feature-id-catalogue). Screens show the same IDs in their blue "Feature reference" tags.

Status: **Done**, **Partial** (what is missing is noted), **Planned (Mx)**, or **Out of scope** for the POC.

Updated at the end of milestone M3, the Scheduled Caste Certificate configuration, and steps P1–P3 of the penalty module (M4).

## Common (COM)

| ID | Feature | Status | Where / notes |
|---|---|---|---|
| COM-01 | Citizen sign-in with mobile OTP | Done | `/login`; OTP mocked and shown on screen |
| COM-02 | Officer sign-in, password + second factor | Done | `/login/officer`; second factor mocked |
| COM-03 | Role-based access and role dashboards | Partial | Access checks on every screen; FAA/SAA, Commission, DDO and call-centre dashboards are placeholders |
| COM-04 | Session and sign-out | Done | Signed HTTP-only cookie |
| COM-05 | Mobile-usable UI | Partial | Mobile-first layouts; full mobile pass in M5 |
| COM-06 | User and role master, demo role switcher | Done | Yellow demo bar; `/admin/masters` |
| COM-07 | English / Assamese toggle | Partial | Navigation and citizen screens in draft Assamese |
| COM-08 | Notification service | Done | `/notifications` (SMS, email, dashboard stand-in) |
| COM-09 | Audit trail | Done | `/audit`; per-case history on each application |
| COM-10 | Document upload and storage | Partial | Upload and mock DigiLocker fetch record the file name; file contents are not stored |
| COM-11 | PDF generation and print | Done | Form 1, appeal acknowledgement, orders; closure certificate in M4 |
| COM-12 | Search by UIN / appeal number / mobile | Planned (M4–M5) | Audit log already filters by UIN |
| COM-13 | Plain-language help text | Partial | Throughout; reviewed in M5 |
| COM-14 | Integration adapters | Done | `src/adapters/index.ts`: OTP, SMS/email, video, eGRAS, e-Sign, DigiLocker, payroll |

## Application (AMS-01–13)

| ID | Feature | Status | Where / notes |
|---|---|---|---|
| AMS-01 | Service master | Done | 6 services. Notified particulars held as data: eligibility, extra form fields, documents fetched from records, alternative documents, live photo, fees, revert cap, workflow steps, appeal times (Scheduled Caste Certificate) |
| AMS-02 | Authority master, effective-dated | Done | Resolved by date at application time; read-only at `/admin/masters` |
| AMS-03 | Online application form | Done | `/citizen/apply/[code]` |
| AMS-04 | Completeness check before submission | Done | Server refuses submission until all required documents are attached or fetched from records (one of each set of alternatives); refusal audited |
| AMS-05 | UIN on complete submission | Done | `RTPS-<service>/<year>/<seq>` |
| AMS-06 | Form 1 acknowledgement | Done | Due date, DPS, FAA and SAA |
| AMS-07 | Acknowledgement PDF / print | Done | |
| AMS-08 | Working-day calendar with holidays | Done | Sundays, 2nd/4th Saturdays, seeded Assam holidays |
| AMS-09 | Timer from UIN in working days | Done | Shown on citizen, DPS and Head of Office screens |
| AMS-10 | DPS worklist with timer | Done | `/dps`, driven by the responsibility ledger |
| AMS-11 | One consolidated query; second needs a reason; timer pause | Done | Due date recomputed on reply. A service can carry a notified revert cap instead (Scheduled Caste Certificate: at most 2, no reason needed); the Dealing Assistant can revert during the document check |
| AMS-12 | Deliver / reject with reasons | Done | Close also supported, with reasons |
| AMS-13 | Link Officer handover and responsibility ledger | Done | `/hoo/handover`; ledger rebuilt for affected applications |

## Breach and filing (AMS-14–31)

| ID | Feature | Status | Where / notes |
|---|---|---|---|
| AMS-14 | Breach detection | Done | Scheduler, day by day; paused applications never breach |
| AMS-15 | Hold at breach | Done | |
| AMS-16 | Refuse and log close / reject of a held application | Done | Audited with code `HELD_CLOSE_ATTEMPT`; listed in the review register in M5 |
| AMS-17 | Citizen breach notice | Done | SMS, email and dashboard, combined with the draft link |
| AMS-18 | Auto-drafted first appeal | Done | |
| AMS-19 | Expiring draft link by SMS / email | Done | `/a/[token]`; validity follows the switch (30 or 45 days) |
| AMS-20 | One-click filing | Done | `/citizen/appeals/[id]` |
| AMS-21 | Edit grounds and file | Done | |
| AMS-22 | Decline draft | Done | |
| AMS-23 | Decline / lapse switch | Done | Hold + flag Head of Office (who can release after the window) or release to DPS |
| AMS-24 | Appeal against rejection (switch) | Done | Off: citizen starts it on the application page. On: portal drafts it |
| AMS-25 | Two grounds only | Done | Delay or rejection |
| AMS-26 | Validation against application and service | Done | Ground must match the application's state |
| AMS-27 | Appeal number = UIN + level code | Done | |
| AMS-28 | Filing window and late-filing reason | Done | Late appeals wait for the authority to accept the reason |
| AMS-29 | One live appeal per level | Done | One record per level; refiling a live appeal is refused |
| AMS-30 | Appeal acknowledgement | Done | `/doc/appeal/[id]` with PDF |
| AMS-31 | Assisted filing by call centre | Planned (M4) | Services already accept the call-centre role |

## First appeal (AMS-32–68)

| ID | Feature | Status | Where / notes |
|---|---|---|---|
| AMS-32 | Direct routing to authority | Done | Filed appeals land in the FAA worklist |
| AMS-33 | Worklist with deadline and days left | Done | `/authority/worklist` |
| AMS-34 | Deadline reminders | Done | At 50% and 80% of the time and 3 working days before (settings) |
| AMS-35–37 | Case view: history, timer pauses, documents | Done | `/authority/appeals/[id]` |
| AMS-38 | Case view: responsibility ledger | Done | With the delay split per officer |
| AMS-39 | DPS notified as respondent | Done | |
| AMS-40 | DPS reply on portal | Done | `/dps/appeals` |
| AMS-41 | Reply due date | Done | 5 working days (setting); overdue notice to DPS and authority |
| AMS-42 | Authority calendar | Done | `/authority/hearings` |
| AMS-43 | Hearing scheduling | Done | Earliest valid date suggested |
| AMS-44 | 7 clear working days' notice | Done | Enforced on the server |
| AMS-45 | Short notice with reason | Done | |
| AMS-46 | Notice served via dashboard + SMS/email | Done | |
| AMS-47 | Online by default, mock video link | Done | |
| AMS-48 | In person with reason | Done | Two reasons; suggested when the citizen has no digital access |
| AMS-49 | Attendance recording | Done | |
| AMS-50 | Adjournment | Done | Fixing a new date adjourns the scheduled hearing |
| AMS-51 | Hearing notes | Done | |
| AMS-52 | Decision on record without hearing | Done | Order can be drafted from "Being considered" |
| AMS-53 | Order templates | Done | Allow and direct delivery; set rejection aside; dismiss |
| AMS-54, 55 | Findings; reasons mandatory | Done | No signature without reasons |
| AMS-56 | Direction to deliver with deadline | Done | Assigned to the officer holding the case |
| AMS-57 | Set aside rejection | Done | Application goes back on hold for delivery |
| AMS-58 | Dismissal with reasons | Done | |
| AMS-59 | Penalty prompt on every order | Done | Penalty or a reason for none is required to sign |
| AMS-60 | Penalty range validation | Done | |
| AMS-61 | Officer chosen from ledger | Done | Officer with most delay days pre-selected |
| AMS-62 | Reason when no penalty | Done | |
| AMS-63 | Disciplinary recommendation | Done | |
| AMS-64 | Order preview | Done | DRAFT watermark; visible only to the authority |
| AMS-65 | Mock e-Sign | Done | |
| AMS-66 | Final only after signing | Done | Signed orders cannot be edited |
| AMS-67 | Copies to all parties | Done | Citizen, DPS, penalised officer, Head of Office |
| AMS-68 | Order on citizen dashboard / download | Done | PDF at `/api/doc/order/[id]` |

## SAA and Commission (AMS-69–85)

| ID | Feature | Status | Where / notes |
|---|---|---|---|
| AMS-69 | Auto-escalation on missed deadline | Done | Scheduler, day by day; scheduled hearings are cancelled |
| AMS-70 | Missed deadline recorded on appeal | Done | Shown on the case views and the authority dashboard |
| AMS-71 | Escalation notices to all | Done | Citizen, DPS, both authorities, Registrar |
| AMS-72 | Escalation destination switch | Done | Next level, or straight to the Commission |
| AMS-73 | Escalated appeals listed separately | Done | Worklist **Escalated** tab: moved up to you, and missed by you |
| AMS-74 | Citizen-filed second appeal (drafted when undelivered) | Done | Drafted after a decision that leaves the service undelivered |
| AMS-75 | SAA worklist and decision | Done | Same worklist, case view and order builder as the FAA |
| AMS-76 | SAA extension 60 → 75 with reason | Done | Once only; citizen and DPS told |
| AMS-77 | Citizen-filed third appeal, 90-day window, 120-day cap | Done | Late third appeals go to the Registrar with the reason |
| AMS-78 | Registrar scrutiny | Done | Admit, return for correction (citizen refiles), or not admit |
| AMS-79 | Bench assignment | Done | One or three Commissioners, with a presiding member |
| AMS-80 | Member votes | Done | Allow, dismiss or remand, with a note; changeable until the order is drafted |
| AMS-81 | Majority, Chief Commissioner's casting vote | Done | Casting vote only on a tie, only between the tied positions |
| AMS-82 | Dissent recorded | Done | Minority notes go into the order |
| AMS-83 | Registrar authentication | Done | A Commission order takes effect only on authentication |
| AMS-84 | Remand with 15-day deadline | Done | Same lower appeal reopens; a missed remand returns to the Commission |
| AMS-85 | Commission penalty on FAA / SAA | Done | Offered only for an authority with a missed deadline on record |

## Penalty and recovery (AMS-86–100)

| ID | Feature | Status | Notes |
|---|---|---|---|
IDs follow PLAN.md Part 2, §P11 (central recovery). The brief's own step / exception / control table is [COVERAGE.md](COVERAGE.md).

| ID | Feature | Status | Notes |
|---|---|---|---|
| AMS-86 | Penalty record from the order, with deemed service | Done | Officer snapshot from staff records (mock); dashboard and message times; last date = service + 30 days, moved to the next working day; copies to officer, public authority, Competent Authority, Sewa Setu DDO, Finance nodal officer |
| AMS-87 | eGRAS QR and mock payment | Done (mocked) | Real QR (reference, UIN, exact amount, head of account); challan for any amount; only the penalised officer can pay |
| AMS-88 | GRN settlement and automatic matching | Done (mocked) | Pending until the settlement lag; success or forced failure; matched by reference; no manual "paid" |
| AMS-89 | 30-day period, reminders, day-30 flag | Done | Reminders on day 20 and 27; OVERDUE the day after the last date; the Sewa Setu DDO is told |
| AMS-90 | Confirm unpaid (Sewa Setu DDO) | Done | Refused while a receipt is pending; QR off; officer told recovery will follow |
| AMS-91 | Recovery Direction | Done | Standing (reference attached) or per case (Competent Authority e-signs, reminders every 3 working days); no ticket without it |
| AMS-92 | Central recovery ticket | Done | One open ticket per employee ID, a line per UIN; staff-record details; instalments above Rs. 10,000; due by pay date + 5 working days; primary or backup nodal officer, leave toggle; retiring officers first |
| AMS-93 | Deduction entry with proof | Done | Payroll reference (mock payroll if empty), month, amount, voucher, proof file; part deductions carry forward; nodal officer cannot close or change the amount |
| AMS-94 | Verification and deduction message | Done | Checks proof, employee ID, UIN, amount; message to the officer copied to the imposing and Competent Authorities; return with reason |
| AMS-95 | Monthly statement and treasury reconciliation | Done (treasury mocked) | Credits matched to vouchers daily; statement on the first working day of the month for the month before; per penalty imposed, eGRAS (GRN), deducted (voucher), credited, refunded, written off, difference, outstanding; CSV and PDF; credit-confirmed penalties close; shared with Finance and the Commission |
| AMS-96 | Credit missing and escalation | Done | 15 days without credit → credit missing and a follow-up task for the nodal officer; 7 more days → escalated to the Finance senior officer and the Commission; follow-up makes the mock treasury re-send; ticket deadline (pay date + 5 working days) missed → escalated and carried forward |
| AMS-97 | Stay, reduction, set-aside and refunds | Done | Stay with order reference and copy: clock paused, QR off, line on hold, Finance told to stop; lift resumes with days left. Reduce or set aside only by the imposing or a higher authority (or a recorded court order); excess → refund task; refund recorded with a reference. Double recovery and excess challans → refund (E3, E4) |
| AMS-98 | Exceptions queue and write-off | Done | Not on State payroll, retired (pension switch), resigned, dismissed, deceased, suspended, employee ID mismatch, unknown eGRAS reference; manual recovery through the paying authority; correct and resume; write-off with Competent Authority e-Sign approval; staff-records demo screen |
| AMS-99 | Commission penalty ledger | Done | `/commission/penalties`: imposed, eGRAS, salary, credited, outstanding, refunded, written off; overdue recoveries, missing credits, double recoveries, write-offs, monthly statements |
| AMS-100 | Visibility by employee ID | Done | Officer, imposing authority, Competent Authority, Sewa Setu DDO, Finance, Commission only; a successor in the post never sees it |

## Compliance and closure (AMS-101–111)

| ID | Feature | Status | Notes |
|---|---|---|---|
| AMS-101 | Direction timer | Partial | Due date set and shown; the missed-direction rule comes in M4 |
| AMS-102 | DPS compliance worklist | Done | `/dps/appeals` |
| AMS-103 | Delivery record with reference | Done | Delivering the application meets the direction |
| AMS-104 | Citizen confirms receipt | Done | |
| AMS-106 | Close only on delivery + confirmation | Done | |
| AMS-105, 107–111 | Call-centre confirmation, closure certificate, missed direction, alerts, follow-up, dispute | Planned (M4) | |

## Dashboards and reports (AMS-112–125)

| ID | Feature | Status | Notes |
|---|---|---|---|
| AMS-112 | Citizen dashboard | Done | Drafts waiting, appeals, applications, messages |
| AMS-113 | DPS dashboard | Partial | Worklist, respondent appeals and directions; penalties in M4 |
| AMS-114 | FAA/SAA split by ground and origin | Done | `/authority`, with escalated appeals and missed deadlines |
| AMS-115 | Pending applications per DPS | Done | Head of Office and authority dashboards |
| AMS-116 | Head of Office dashboard | Done | Including release of held applications after the window |
| AMS-118 | Repeated-delay flag | Partial | Computed by the scheduler and shown to the Head of Office; Commission view in M5 |
| AMS-117, 119–125 | Commission dashboard and reports | Planned (M5) | |

## Platform (AMS-126–136)

| ID | Feature | Status | Notes |
|---|---|---|---|
| AMS-126 | Append-only audit log, per case | Done | SQLite triggers refuse UPDATE and DELETE; tested |
| AMS-127 | Rules held as settings | Done | Edited at `/admin/settings`, validated by type, audited; new calculations use the new value |
| AMS-128 | Policy switches for open points | Done | Editable with the other settings |
| AMS-129 | Scheduler with simulated clock | Done | Day-by-day run, logged at `/admin`; rules added per milestone |
| AMS-130 | Notification log | Done | |
| AMS-131 | Holiday calendar admin | Partial | Read-only list |
| AMS-132 | Authority master admin | Partial | Read-only |
| AMS-133–136 | Retention, departmental integration, DigiLocker issue, migration | Out of scope | |

## Master data integration (MDM)

| ID | Feature | Status | Notes |
|---|---|---|---|
| MDM-1 | Local copy of MDM masters | Done | 16 entity types, parent first; snapshot on first run, then `/mdm/changes` by version, newer-only upserts, snapshot again on 410; runs logged and audited; `npm run mdm:sync` |
| MDM-2 | Usage endpoint for MDM | Done | `GET /api/mdm/usage/{entityType}/{code}`: open applications, authority mappings, officers, live penalties |
| MDM-3 | Consumer registration | Done (not yet registered) | Admin only; refuses a localhost address. Waiting for the decision to register `ams-service` on the shared MDM |
| MDM-4 | Gap report AMS → MDM | Done | Admin → Master data (MDM), CSV at `/api/mdm/gaps`; write-up in docs/mdm-gap-analysis.md |
| MDM-5 | AMS screens read masters from MDM | Planned | After the gaps are closed; the crosswalk in `src/domain/mdm-crosswalk.ts` becomes stored MDM codes |
| MDM-6 | Live lookups (validate, geo context, office by jurisdiction) | Partial | Client methods only; not called from a screen yet |

## Officers and postings (HR Utility)

| ID | Feature | Status | Notes |
|---|---|---|---|
| HR-1 | Seat holder at a time (holder or Link Officer) | Done | `GET /v1/seat-holders` with `at`; first available holder, else the Link Officer |
| HR-2 | Readiness of every AMS role | Done | Admin → Officers (HR); role → seat table stands in for the Rule Engine |
| HR-3 | Delay ledger from HR | Done | Daily answers over the delay, split with `attributeDelay`; each answer kept with its MDM version (`HrResolution`) |
| HR-4 | HR events | Done | Outbox read from the last id; AMS offices marked; future events flagged |
| HR-5 | Posts an officer holds (for IAM) | Done | Lookup on the admin screen |
| HR-6 | AMS cases use HR officers | Planned | After the gaps in docs/hr-integration.md are closed |

## Appeals from service systems (Rule Engine)

| ID | Feature | Status | Notes |
|---|---|---|---|
| RE-1 | List appeal-eligible applications | Done | `GET /ams/applications?appealEligible=true` on each service system (MCC first) |
| RE-2 | Snapshot with the Rule Engine's officers, SLAs, timeline | Done | Admin → Appeals intake |
| RE-3 | Cross-check officers against MDM and HR | Done | Employee code in the MDM copy; chair holder in the HR Utility on the decision date |
| RE-4 | Bring into AMS for appeal | Done | Rejected → rejection appeal; overdue → held, delay appeal; FAA/SAA from the Rule Engine; snapshot kept with resolution ids and MDM version |
| RE-5 | Automatic intake and refresh | Planned | Needs polling or an event from service systems |

## Tests

- `tests/unit/penalty.test.ts` (18): last date from deemed service across holidays, money arithmetic (short, excess, double recovery, write-off, set-aside), reminders, QR payload, visibility, and the penalty machine's controls (no manual paid, no confirm while a receipt is pending, no ticket without a Recovery Direction, nodal officer limits, proof before recovered, stays, reviews, write-off approval, refund reference)
- `tests/integration/penalties.test.ts` (7): penalty from a signed order with deemed service and copies; backup nodal officer; QR payment settling and closing; short challan, failed receipt and repayment; excess challan refund; reminders; visibility

- `tests/unit/recovery.test.ts` (11): salary pay dates, deduction due dates, instalment split, re-planning and carry-forward, routing to exceptions by payroll type and officer status, pension setting, retirement window
- `tests/integration/recovery.test.ts` (8): day 30 → confirm → standing direction → ticket → deduction controls → verification and message; returning a deduction; pending receipt blocks confirmation; per-case direction with reminders; one ticket for two penalties with instalments and a part deduction; exception routing and retirement priority; leave and backup; settings editor

- `tests/unit/statement.test.ts` (7): statement figures (eGRAS credited directly, missing credit as a difference, returned and later entries excluded, refunds and write-offs), totals and CSV, first working day of the month, re-planning around months already deducted
- `tests/integration/reconciliation.test.ts` (5): credit confirmed and closed by the statement; dropped credit → missing → follow-up task → escalated → shown in the statement → re-sent; ticket deadline escalation; both nodal officers on leave; part deduction not escalated

### Earlier (M3)

- `tests/unit` (66 tests): calendar, filing windows, hearing notice, escalation targets, SAA extension, penalty ranges, payment and recovery timing, repeated-delay rule, ledger attribution, state-machine guards, order templates and penalty decisions (including Commission penalties), bench votes and constitution
- `tests/integration/applications.test.ts` (6): completeness and UIN, timer pause, held-application refusal, Link Officer handover, append-only audit
- `tests/integration/appeals.test.ts` (6): breach to closure, both decline/lapse switches, Head of Office release, rejection appeals under both switches, late filing
- `tests/integration/escalation.test.ts` (4): the full escalation chain with extension, split bench, dissent, authentication and penalties on DPS, FAA and SAA; straight-to-Commission switch with return and refile; tie broken by casting vote, remand and missed remand; citizen's next appeal after a dismissal
- `tests/unit/service-config.test.ts` (4): Scheduled Caste Certificate checklist with fetched documents, alternatives and live photo; workflow and fees; mock Government-records check
- `tests/integration/scheduled-caste.test.ts` (4): fetch + live photo + Dealing Assistant + DPS on one 30-day workflow; co-district office with a recommendation and the two-revert cap; required father's name; breach and first appeal to the District Commissioner
