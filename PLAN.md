# PLAN: Sewa Setu Appeal Management System (POC)

Status: **Part 1 approved** (M1–M3 built, plus the Scheduled Caste Certificate configuration). **Part 2 (penalty payment and recovery module) is a draft for approval**; no Part 2 code is written until it is approved.

Reference: [docs/poc-brief.md](docs/poc-brief.md). `docs/appeal-features.md` was not available, so the brief sets both scope and behaviour. The feature IDs follow the ranges given in the brief; the individual assignments are **provisional** (Appendix A) and will be re-mapped if the real feature list turns up.

---

## 1. Stack and setup

| Item | Choice | Note |
|---|---|---|
| Web app | Next.js (App Router), TypeScript, React Server Components + Server Actions | Latest stable release that is at least two weeks old at install time, pinned exactly |
| Styling | Tailwind CSS | Mobile-first layouts |
| Data | Prisma + SQLite (`prisma/dev.db`) | Statuses held as strings with TypeScript union types (portable, no enum quirks in SQLite) |
| Session | Signed HTTP-only cookie (HMAC with `jose`) | Demo-grade only |
| PDF | `pdf-lib` on the server for Form 1, orders, closure certificate; print stylesheet for "Print" | English only in PDFs |
| Tests | Vitest (domain logic), Playwright (Scenario 2) | |
| Run | `npm install && npm run setup && npm run dev` | `setup` = `prisma migrate reset --force` + seed |

**Change from the suggested stack:** none.

**Machine prerequisite:** Node.js is **not installed** on this PC (no `node`/`npm` on PATH). On approval I'll install Node.js LTS with `winget install OpenJS.NodeJS.LTS`. That needs your OK, and possibly an admin prompt. I'll also run `git init` in the project folder so each milestone is a commit.

### Folder layout

```
src/
  app/                 routes (one folder per role area + /demo, /admin, /audit, /notifications)
  domain/
    state-machines.ts  ALL status flows + guards (single source of truth)
    calendar.ts        working-day maths, clear-day notice, calendar-day windows
    rules.ts           filing windows, penalty ranges, escalation targets, repeated-delay rule
    ledger.ts          responsibility ledger + delay attribution
    numbering.ts       UIN and appeal numbers
  services/            use-cases (fileAppeal, scheduleHearing, signOrder, ...) — call guards, write audit + notifications in one transaction
  scheduler/           runScheduler(from, to) + one module per rule
  adapters/            interfaces + mocks: otp, messaging (SMS/email), video, payment (eGRAS), esign, digilocker, payroll
  i18n/                en.json (complete), as.json (draft: nav + citizen screens)
  components/          FeatureRef tag, DemoBanner, RoleSwitcher, Timer, StatusBadge, ...
prisma/  schema.prisma, migrations/, seed/ (masters, holidays, history, scenarios)
tests/   unit/*.test.ts, e2e/scenario2.spec.ts
```

---

## 2. Assumptions (choices made where the brief is open)

| # | Topic | Choice | Why |
|---|---|---|---|
| A1 | **Day basis** | Working days: service time limits, query pauses, hearing notice, appeal decision deadlines (FAA 30, SAA 60/75, Commission 90), direction deadlines, remand 15 days. Calendar days: filing windows (45/60/90/120), draft link validity, penalty payment period (30). Each period's basis is stored in Settings and can be flipped. | The brief says working days for all counting except filing windows. The link validity is set to "match the 45-day filing window" in the alternative, so it is treated as a calendar-day period like the window. Payment periods are normally calendar days. Please confirm the FAA "30 days" basis, which the brief marks as unconfirmed. |
| A2 | **Weekly offs** | Sundays plus 2nd and 4th Saturdays are non-working, plus seeded Assam public holidays for 2026–27. Both are editable in Admin. | Holiday dates are indicative and must be checked against the Government of Assam notification before any real use. |
| A3 | **"Clear" working days** | Notice served on day N and hearing on day H need ≥ 7 working days strictly between them (both N and H excluded). | Usual meaning of "clear days". |
| A4 | **Day on which counting starts** | Day 1 of the time limit is the first working day after the UIN is issued. A query pauses the timer from the day it is raised until the day the citizen replies; the due date is recomputed when it resumes. | |
| A5 | **Completeness** | No UIN is issued until every mandatory document on the checklist is attached and the form is valid. An unfinished form is a saved draft without a UIN. | "The timer starts only once complete." |
| A6 | **Filing-window start** | First appeal: from the breach date (delay ground) or the rejection date. Second: from the FAA order date. Third: from the SAA order date. | |
| A7 | **Late filing** | For FAA and SAA, filing after the window is allowed only with a reason. The appeal goes to the authority as "Late — reason to be accepted", and the authority accepts (case proceeds) or declines (closed with reasons). For the third appeal, days 91–120 work the same way through Registrar scrutiny, and filing after day 120 is refused by the server. | |
| A8 | **After the draft link lapses** | The citizen can still file manually from their dashboard while the 45-day window is open. The switch only decides what happens to the *application*. Default: it stays held and is flagged to the Head of Office, who can release it with a recorded reason once the filing window has closed. Alternative: it is released back to the DPS at once. | Keeps "nothing filed without the citizen" and still never closes the citizen's right early. |
| A9 | **Delivery during hold** | The DPS may always *deliver* a held application; only *close* and *reject* are refused. | Delivery is the outcome everyone wants. |
| A10 | **Missed direction** | When a direction to deliver passes its deadline, (a) the appeal reopens before the same authority for enforcement, (b) the next authority is alerted, and (c) the next-level appeal is drafted for the citizen (who still has to file it). | Reconciles "reopens before the same authority" with "portal drafts the next appeal". |
| A11 | **Remand** | Remand reopens the *same* FAA (or SAA) appeal record (same appeal number) with a remand cycle count, origin "Remanded", and a new 15-working-day deadline. If the remand deadline is missed, the appeal goes back to the Commission. | |
| A12 | **Escalation when straight-to-Commission is on** | Applies to both FAA and SAA misses. The FAA miss goes to the Commission (TAA) and skips the SAA. | Matches the earlier IGAMS FRS behaviour. |
| A13 | **Commission timing** | The 90-day target is shown and reported as overdue but never escalates (not binding). | |
| A14 | **Penalty attribution** | The ledger splits the delay days (due date + 1 to delivery or order date, working days) by holder. The order builder pre-selects the holder with the most delay days and shows the split; the authority can choose any officer in the ledger. For FAA or SAA penalties (Commission only), the choice comes from the recorded missed deadlines. | Scenario 5 needs the Link Officer to be chosen. |
| A15 | ~~**DDO**~~ | *(Superseded by Part 2: penalty payment and recovery module.)* Recovery is central (Sewa Setu DDO and Finance nodal officer), not through the officer's own DDO. | |
| A16 | ~~**Recovery timing**~~ | *(Superseded by Part 2: penalty payment and recovery module.)* | |
| A17 | **Repeated delay** | For each DPS, delayed cases ÷ cases whose time limit ended in the last 6 months (182 calendar days) on the simulated clock. Flag at ≥ 25%. A minimum of 4 cases avoids flagging on tiny numbers (setting). | |
| A18 | **Bulk / same-day disposals** | An authority disposing of ≥ 10 appeals on one simulated date goes into the register of cases for review (threshold is a setting). | |
| A19 | **Handover recorded after the fact** | A handover whose recorded date is after its start date goes into the register. | |
| A20 | **Call-centre user** | A seeded "Call Centre Agent" role (not in the brief's role list) can confirm receipt and file on a citizen's behalf, with the caller's consent noted. | Needed for "confirmed by the call centre". |
| A21 | **Commission bench** | Seeded with a Chief Commissioner and two Commissioners. The Registrar assigns a bench of 1 or 3. The Chief Commissioner casts the deciding vote on a tie even when not sitting on the bench. | |
| A22 | **Appeal per level** | Only one live appeal per application per level. A second filing is refused with a link to the existing one. | |
| A23 | **Demo staging** | Each scenario has its own "Start this scenario" button. It reseeds the database and sets the clock to that scenario's start date, so long fast-forwards in one scenario never disturb another. "Reset demo data" restores the baseline, which has all scenarios staged plus 6 months of history for dashboards. | Scenario 3 alone needs 150+ working days of clock movement. |
| A24 | **Real-time stamps** | Every audit row stores both the simulated date and the real wall-clock time. | |

---

## 3. Data model

Prisma models, abridged (ids, `createdAt` and obvious foreign keys omitted).

### Masters
- **Department** `code, name`
- **District** `code, name`
- **Office** `code, name, districtCode, departmentCode, headOfOfficeId`
- **User** `name, role, designation, officeId, mobile, email, username, passwordHash, ddoId, isActive`
  - roles: `CITIZEN, DPS, LINK_OFFICER, FAA, SAA, REGISTRAR, COMMISSIONER, CHIEF_COMMISSIONER, DDO, HEAD_OF_OFFICE, CALL_CENTRE, ADMIN`
- **Service** `code (PRC, INC, CST, NCL, TRL, ...), name, purpose, timeLimitWorkingDays, documents (JSON checklist: name, mandatory), departmentCode`
- **AuthorityMapping** `serviceId, officeId, dpsId, linkOfficerId, faaId, saaId, validFrom, validTo` (effective-dated)
- **Holiday** `date, name`; weekly-off rule kept in Settings
- **Setting** `key, value (JSON), basis?, category, label, description, isSwitch` (all rules: §6)
- **ClockState** `id=1, today`

### Application flow
- **Application** `uin, serviceId, citizenId, officeId, formData (JSON), status, submittedOn, timerStartOn, dueOn, pausedWorkingDays, queryCount, heldOn, holdFlaggedToHoO, releasedOn, deliveredOn, deliveryRef, rejectedOn, rejectionReasons, confirmedOn, dpsIdSnapshot, faaIdSnapshot, saaIdSnapshot`
- **ApplicationDocument** `applicationId, name, fileName, source (UPLOAD | DIGILOCKER_MOCK)`
- **InfoRequest** `applicationId, raisedById, raisedOn, items (JSON), secondRequestReason, respondedOn, response`
- **Handover** `fromDpsId, toLinkOfficerId, officeId, startOn, endOn, recordedOn, recordedById, reason`
- **LedgerEntry** `applicationId, officerId, capacity (DPS | LINK_OFFICER | SUCCESSOR), fromOn, toOn (null = open), source (ASSIGNMENT | HANDOVER | TRANSFER)`

### Appeal flow
- **Appeal** `appealNo (UIN-FAA/-SAA/-TAA), applicationId, level, ground (DELAY | REJECTION), origin (AUTO_DRAFT | CITIZEN | ASSISTED | AUTO_ESCALATED | REMANDED), parentAppealId, status, authorityId (FAA/SAA user; null for TAA), benchId, draftCreatedOn, linkToken, linkExpiresOn, filedOn, groundsText, reliefSought, windowEndsOn, isLate, lateReason, lateDecision, deadlineOn, extendedDeadlineOn, extensionReason, remandCycle, decidedOn, closedOn, reopenCount`
- **MissedDeadline** `appealId, level, authorityId, deadlineOn, detectedOn, escalatedToAppealId`
- **RespondentReply** `appealId, dpsId, dueOn, submittedOn, text, attachments`
- **Hearing** `appealId, scheduledOn, mode (ONLINE | IN_PERSON), inPersonReason, noticeServedOn, shortNoticeReason, videoLink, status, attendance (JSON: citizen, dps, others), notes, adjournedToHearingId`
- **Bench** `appealId, memberIds (JSON), presidingId, constitutedOn`
- **Vote** `appealId, memberId, position (ALLOW | DISMISS | REMAND), note, castOn, isCasting`
- **Order** `appealId, templateCode, outcome (ALLOWED | DISMISSED | REJECTION_SET_ASIDE | REMANDED | LATE_NOT_CONDONED), findings, reasons, directionText, directionDueOn, noPenaltyReason, disciplinaryRecommendation, majority (JSON), dissent, status, signedById, signedOn, esignRef, authenticatedById, authenticatedOn, pdfPath`
- **Direction** `orderId, appealId, applicationId, kind (DELIVER | DECIDE_ON_REMAND), assigneeId, dueOn, status, metOn, deliveryRef`
- **Penalty**, **Recovery**, **RecoveryDeduction**: *(Superseded by Part 2: penalty payment and recovery module.)* See Part 2, §P3.

### Cross-cutting
- **Notification** `recipientId, recipientLabel, channel (SMS | EMAIL | DASHBOARD), templateCode, text, sentOn (simulated), readOn, entityType, entityId`
- **AuditEvent** `simDate, realTs, actorId, actorRole, action, entityType, entityId, caseRef (UIN), beforeStatus, afterStatus, details (JSON), outcome (OK | REFUSED)`. **Append-only:** the migration adds SQLite triggers that `RAISE(ABORT)` on UPDATE or DELETE, and the code only ever inserts.
- **DelayFlag** `officerId, computedOn, delayed, total, ratio, isFlagged`

---

## 4. State machines (all in `src/domain/state-machines.ts`)

Each machine is a table of `{from, event, to, guard?, actor roles}`. Services call `transition(machine, entity, event, ctx)`. That function checks the role and guard, writes the AuditEvent (OK or REFUSED) and returns the new status. A refused transition throws a `DomainError` with a plain-language message for the UI.

### Application
```
DRAFT --submit[complete docs]--> IN_PROGRESS (UIN issued, timer starts)
IN_PROGRESS --raiseQuery[first, or second with reason]--> AWAITING_CITIZEN (timer paused)
AWAITING_CITIZEN --citizenResponds--> IN_PROGRESS (timer resumes, due date recomputed)
IN_PROGRESS --deliver--> DELIVERED
IN_PROGRESS --reject[reasons]--> REJECTED
IN_PROGRESS|AWAITING_CITIZEN --breach (scheduler)--> HELD
HELD --deliver--> DELIVERED                      (allowed, A9)
HELD --reject|close--> REFUSED  [guard: noAppealPossibleOrOpen] -> audit REFUSED, register entry
HELD --release[switch=release OR HoO after window, reason]--> IN_PROGRESS (released flag)
DELIVERED --citizenConfirms--> DELIVERED_CONFIRMED
```
Note: AWAITING_CITIZEN cannot breach because the timer is paused. The breach event comes only from IN_PROGRESS.

### Appeal
```
DRAFT --file|editAndFile[window or late reason]--> FILED
DRAFT --decline--> DECLINED ; DRAFT --linkExpires--> LAPSED
FILED(late) --acceptLate--> UNDER_REVIEW ; --refuseLate[reasons]--> CLOSED
FILED --(auto, FAA/SAA)--> UNDER_REVIEW            (no dealing assistant)
FILED --(TAA)--> SCRUTINY --admit--> ADMITTED --assignBench--> UNDER_REVIEW
                          --return[reason]--> RETURNED_TO_CITIZEN --refile--> SCRUTINY
                          --reject[reason]--> CLOSED
UNDER_REVIEW --scheduleHearing[7 clear WD or reason]--> HEARING_SCHEDULED --recordHearing--> UNDER_REVIEW
UNDER_REVIEW --draftOrder--> ORDER_DRAFTED --sign(e-Sign)[reasons, penalty decided]--> DECIDED
   (TAA: votes complete -> sign by presiding -> AUTHENTICATED by Registrar -> DECIDED)
DECIDED[direction issued] --> COMPLIANCE
DECIDED[dismissed / no direction] --> CLOSED (next-level draft created if service undelivered)
COMPLIANCE --deliveryRecorded--> AWAITING_CONFIRMATION --citizenConfirms--> CLOSED
COMPLIANCE --directionMissed (scheduler)--> REOPENED (= UNDER_REVIEW, reopenCount++) + alert next authority + draft next appeal
AWAITING_CONFIRMATION --citizenDisputes--> REOPENED
UNDER_REVIEW|HEARING_SCHEDULED|ORDER_DRAFTED --deadlineMissed (scheduler, FAA/SAA)--> ESCALATED (terminal at this level; child appeal created)
DECIDED(TAA, REMANDED) --> CLOSED at TAA; lower appeal --remand--> UNDER_REVIEW (origin REMANDED, 15 WD)
```
Guards enforced on the server: `orderHasReasons`, `penaltyDecided` (amount within range for capacity and level, OR noPenaltyReason), `penaltyOfficerInLedgerOrMissedDeadline`, `noticeClearDays>=7 || shortNoticeReason`, `inPersonHasReason`, `extensionOnlyOnce && extendedTotal<=75 && reason`, `secondQueryHasReason`, `thirdAppealWithin120`, `oneLiveAppealPerLevel`, `votesComplete && majorityOrCasting`.

### Hearing
`SCHEDULED → HELD (attendance recorded) | ADJOURNED (→ new Hearing) | CANCELLED`

### Order
`DRAFT → SIGNED (mock e-Sign; final) → [TAA] AUTHENTICATED`. Edits are allowed only in DRAFT.

### Direction
`OPEN → MET (delivery recorded) | MISSED (scheduler) → [reopened case] OPEN (new due date)`

### Penalty and Recovery
*(Superseded by Part 2: penalty payment and recovery module.)* See Part 2, §P4.

### LedgerEntry
Open entries are closed and reopened by assignment, handover start or end, transfer, and delivery. They are never edited after the fact; corrections are new entries.

---

## 5. Scheduler

`advanceClock(to)` loops **day by day** from the old date to the new one, so a 30-day jump fires every event on its proper date. On each day it runs the rules in this order. Each rule is idempotent and writes audit events with actor "System".

1. **Resume / pauses**: nothing automatic (pauses end on the citizen's reply).
2. **Breach**: `IN_PROGRESS` with `dueOn < today` → HELD. Close the ledger entry for breach marking, notify the citizen (SMS, email, dashboard), create a DRAFT FAA appeal (ground DELAY) with `linkExpiresOn = today + linkValidity`.
3. **Draft link expiry**: DRAFT with `linkExpiresOn < today` → LAPSED; apply the decline/lapse switch (flag to Head of Office, or release to DPS).
4. **Filing-window close**: once the window ends with no appeal, a held application flagged to the Head of Office becomes "eligible for release" on the HoO dashboard.
5. **Reply due**: an overdue DPS reply sends a notice to the DPS and the authority (no status change).
6. **Reminders**: notify the authority when an appeal reaches 50% and 80% of its deadline and 3 working days before it (points are a setting).
7. **Escalation**: FAA or SAA appeals not DECIDED with `deadlineOn` (or extended) `< today` → ESCALATED. Record a MissedDeadline, create the next-level appeal per the switch (origin AUTO_ESCALATED, filed today), and notify the citizen, DPS, both authorities and the Registrar.
8. **Commission overdue**: TAA past 90 working days is flagged only.
9. **Directions**: OPEN with `dueOn < today` → MISSED. Reopen the appeal, alert the next authority, draft the next appeal for the citizen (A10).
10. **Remand deadline**: missed → back to the Commission (MissedDeadline recorded).
11. **Penalty payment**: *(Superseded by Part 2: penalty payment and recovery module.)* See Part 2, §P5.
12. **Confirmation follow-up**: AWAITING_CONFIRMATION for 7+ days goes into the call-centre queue.
13. **Repeated-delay flags**: recompute DelayFlag for every DPS (end of each run).

---

## 6. Settings (AMS-127, AMS-128)

Admin screen, grouped, each with a label, plain-language help and a basis (working/calendar) where relevant:

- **Time limits:** per service (in the Service master), FAA 30 WD, SAA 60 WD (max extension 75), Commission target 90 WD, remand 15 WD, default direction period 15 WD, DPS reply period 5 WD.
- **Windows:** first appeal 45 CD, second 60 CD, third 90 CD, third hard cap 120 CD, draft link 30 CD.
- **Hearing:** notice 7 clear WD; in-person reasons list.
- **Penalty:** range table (level × officer capacity); payment period 30 CD. The recovery settings are in Part 2, §P7.
- **Flags:** repeated delay 25%, 6 months, minimum 4 cases; bulk disposal threshold 10/day; reminder points.
- **Calendar:** weekly offs; holidays (CRUD).
- **Switches (open points):** link validity 30/45; draft on rejection Off/On; escalation Next level / Straight to Commission; decline-lapse Hold + flag HoO / Release to DPS.

Changing a setting is audited. Running cases keep the deadlines already computed; new calculations use the new value. The screen says so.

---

## 7. Screens

All screens: header with language toggle (EN / অসমীয়া draft), "Feature reference" toggle, demo banner (simulated date, +1 / +7 / +30 days / pick a date, role switcher), mobile-first layout, plain English with full forms on first use.

| Area | Screens | Feature IDs |
|---|---|---|
| Sign-in | Citizen OTP (OTP shown in demo banner); Officer password + mock second factor | COM-01, COM-02, COM-04 |
| Citizen | Dashboard; Services list; Apply (form + checklist + mock DigiLocker fetch); Form 1 acknowledgement (PDF / print); My applications (timer, status, reply to query); Draft appeal (file / edit and file / decline); File appeal manually (incl. late reason); My appeals (hearing notice, join mock video, order, confirm receipt / dispute); Closure certificate | AMS-03–07, 17–31, 68, 104, 107, 112 |
| DPS / Link Officer | Dashboard; Worklist with timers; Application detail (query, deliver, reject, close — refused when held); Respondent replies; Compliance (directions to deliver); My penalties (pay via mock eGRAS) | AMS-10–12, 16, 39–40, 87–88, 101–103, 113 |
| Head of Office | Dashboard (held/flagged applications, release with reason); Handover form (date range → ledger); Pending per DPS | AMS-13, 23, 115–116 |
| FAA / SAA | Dashboard (by ground, citizen-filed vs moved up, escalated tab, pending per DPS); Worklist (deadline, days left); Case view (history, pauses, documents, ledger, reply, hearings, orders, audit); Hearing scheduler (calendar, notice check); Order builder (template sections, penalty prompt, ledger split, preview, mock e-Sign); SAA: extend to 75 | AMS-32–68, 73, 75–76, 114 |
| Registrar | Scrutiny queue (admit / return / reject); Bench assignment; Authenticate orders; Recovery Directions issued | AMS-78–79, 83, 91 |
| Commissioner / Chief Commissioner | Bench cases; Vote with note; Casting vote on ties; Order (majority, dissent); Remand; Penalty on FAA/SAA | AMS-80–82, 84–85 |
| Commission dashboard | Appeals by level; overdue by level; repeated-delay officers; penalty ledger; register of cases for review; time-to-decide bands | AMS-117–121 |
| ~~DDO~~ | *(Superseded by Part 2: penalty payment and recovery module.)* Replaced by the Sewa Setu DDO workbench and the Finance screens (Part 2, §P6). | |
| Call centre | Find citizen by mobile/UIN; confirm receipt on behalf; assisted filing; follow-up queue | AMS-31, 105, 110 |
| Admin | Settings & switches; Clock & scheduler run log; Holidays; Authority master (read/edit); Users | AMS-127–132 |
| Shared | Audit log (filter by case, actor); Notification log (SMS/email/dashboard stand-in); Demo scenarios page (start scenario, step list, jump links); Reset demo data | AMS-126, 130, COM-08–09 |

---

## 8. Seed data

- **Places and offices (fictional):** districts such as "Kamrup Metro", "Jorhat", "Nagaon", "Dibrugarh" (real district names, fictional offices such as "Circle Office, Dispur Revenue Circle (Demo)"). All officer names are fictional and clearly marked "(Demo)".
- **Services (6):**
  - Permanent Residence Certificate (PRC), 15 WD
  - Income Certificate (INC), 15 WD
  - Scheduled Caste Certificate (SCC), 30 WD — configured later from the SJE Department notification (one uniform workflow)
  - Non-Creamy Layer Certificate (NCL), 20 WD
  - Trade Licence (TRL), 30 WD
  - Birth Certificate (Delayed Registration) (BRC), 15 WD

  Time limits are illustrative, and each service has a checklist and a one-line purpose.
- **Users:** each role, plus a second DPS, a Link Officer, two DDOs, a Chief Commissioner, two Commissioners, a Registrar, a Call Centre Agent and four citizens.
- **History:** about 150 applications spread over the previous 6 months, so dashboards, bands, the penalty ledger and the 25% flag have real numbers. One DPS is seeded above 25%.
- **Scenarios 1–8:** each has a `stage(scenarioId)` function that builds its starting state and sets the clock. Baseline = all eight staged at once.

| # | Scenario | Starting state | Presenter steps (short) |
|---|---|---|---|
| 1 | On time | Application delivered on day 9 of 15 | Open → show no appeal, "Delivered within time" |
| 2 | Breach to delivery | PRC application at day 15 of 15, clock the day before breach | +1 day → held, draft, SMS in log → citizen files 1-click → FAA schedules hearing (+7 WD check) → +10 days → record hearing → order: deliver in 7 WD, Rs. 2,000 on DPS, e-Sign → DPS records delivery → citizen confirms → closed, certificate → +31 days → Recovery Advice on DDO → DDO records deduction |
| 3 | Escalation chain | FAA appeal filed, 2 WD from its 30-WD deadline | +7 days → escalated to SAA (missed deadline recorded) → SAA extends to 75 with reason → jump to past 75 WD → escalated to Commission → Registrar admits, assigns 3-member bench → votes 2–1 → order penalises DPS (Rs. 5,000) and FAA (Rs. 2,000), dissent recorded → Registrar authenticates |
| 4 | Rejection appeal | Application rejected 3 days ago | Citizen starts appeal (switch off) / sees draft (switch on) → FAA sets aside rejection, direction 10 WD → DPS delivers → citizen confirms |
| 5 | Link Officer | Handover (DPS on leave) covers 6 of 8 delay days | FAA case view → ledger split → order pre-selects Link Officer |
| 6 | Attempted closure | Held application, DPS signed in | DPS presses "Close" → polite refusal → Commission dashboard → register shows the refused attempt |
| 7 | Remand | TAA appeal with bench, ready to vote | Bench votes remand → FAA gets 15 WD → FAA decides within time → remand closed |
| 8 | Citizen declines | Draft appeal 1 day before link expiry | +2 days → lapsed → result per switch; flip switch, restart scenario, show the alternative |

---

## 9. Tests

**Vitest (unit, pure domain functions; no DB):**
- Working days: weekends, 2nd and 4th Saturdays, holidays, adding N working days, counting between dates, pauses shifting the due date
- Breach detection (exact boundary day, paused applications never breach)
- Filing windows: in time, late with reason, third appeal refused after 120
- Hearing notice: exactly 7 clear WD passes, 6 fails without a reason and passes with one
- Escalation target under both switch settings, and the SAA 60 → 75 extension guard
- Penalty ranges for every level × capacity (bounds inclusive) and the no-penalty-reason guard
- Ledger attribution: handover splits, open entries, choosing the maximum holder
- Payment → recovery timer (day 30 vs 31) and deduction until credited
- 25% repeated-delay rule (boundary 25%, 6-month window, minimum cases)
- State-machine guards: a held application can't be closed or rejected; an order needs reasons; vote majority and casting vote

**Integration (Vitest + temporary SQLite):** scheduler day-by-day run for Scenario 3 (escalation chain) and Scenario 8 under both switches.

**Playwright:** Scenario 2 end to end through the UI, using the role switcher and clock buttons.

---

## 10. Milestones

Each milestone ends with: `npm test` green, the app runs with the one command, README.md updated, FEATURE_COVERAGE.md updated, and a git commit.

| Milestone | Delivers | Feature IDs (provisional) |
|---|---|---|
| **M1** Foundations | Project scaffold, Prisma schema (all models), seed masters + holidays + users, mock OTP + officer sign-in + role switcher, role dashboards (shells), simulated clock + scheduler skeleton, service catalogue, apply + completeness + UIN, Form 1 acknowledgement PDF / print, DPS worklist with timer, query (pause) / deliver / reject, Head of Office handover + ledger, audit log + notification log, state-machine module, i18n scaffold, FeatureRef tag, calendar unit tests | COM-01–07, COM-09–11, COM-14 (adapters), AMS-01–13, AMS-126, AMS-130–132 (basic) |
| **M2** Breach to first-appeal order | Breach + hold + draft appeal + link expiry, refuse-and-log close or reject, citizen file / edit / decline, rejection appeal (switch), validation, filing windows + late flow, FAA worklist + reminders, case view, respondent reply, hearing scheduler + notice rule + mock video + attendance, order builder + penalty prompt + ledger choice + mock e-Sign + copies | AMS-14–68 |
| **M3** Escalation, SAA, Commission | Escalation rule (both switches) + missed-deadline record, escalated list, citizen-filed 2nd/3rd appeals (drafted when undelivered), SAA extension, Registrar scrutiny, bench, votes, majority / casting / dissent, authentication, remand, Commission penalty on FAA/SAA | AMS-69–85 |
| **M4** Penalty payment and recovery module (Part 2) | Built in four steps, P1–P4 (Part 2, §P10): officer dashboard, eGRAS, central recovery, statement and reconciliation, exceptions E1–E18, Commission view, penalty demo scenarios, Playwright Scenarios 2 and 5 | AMS-86–100, 119, 122 (Part 2 catalogue) |
| **M5** Compliance and closure | Direction timers, delivery record, citizen / call-centre confirmation, closure certificate, missed-direction reopen + alert, dispute (was in the old M4) | AMS-101–111 |
| **M6** Dashboards, settings, demo, polish | Role dashboards with counts and lists, FAA/SAA split views, Commission dashboard, register for review, time-to-decide bands, repeated-delay flags, settings screen + switches, Demo scenarios page with per-scenario staging + reset, Assamese draft strings, mobile pass, Playwright Scenario 2, README with 15-minute demo script (Scenarios 2, 3, 6), complete FEATURE_COVERAGE.md | AMS-112–125, AMS-127–129, COM-05, COM-07–08, COM-12–13 |

---

## 11. Open questions (I'll proceed on the assumptions above unless you say otherwise)

1. Are the day bases in A1 right? In particular, is the FAA's 30 days counted in working days?
2. Should the weekly offs be Sundays plus 2nd and 4th Saturdays (A2)?
3. Is the real `docs/appeal-features.md` coming? If so, I'll re-map the IDs in Appendix A. If not, the provisional list becomes the reference.

---

## Appendix A: Provisional feature ID catalogue

The ranges come from the brief. The individual assignments are mine and will be replaced if the real list arrives.

**Common (COM)**
COM-01 Citizen sign-in with mobile OTP · COM-02 Officer sign-in, password + second factor · COM-03 Role-based access and role dashboards · COM-04 Session and sign-out · COM-05 Mobile-usable UI · COM-06 User and role master (incl. demo role switcher) · COM-07 English/Assamese language toggle · COM-08 Notification service (SMS / email / dashboard) · COM-09 Audit trail · COM-10 Document upload and storage · COM-11 PDF generation and print · COM-12 Search by UIN / appeal number / mobile · COM-13 Plain-language help text · COM-14 Integration adapters (OTP, SMS, email, video, eGRAS, e-Sign, DigiLocker, payroll)

**Application (AMS-01–13)**
01 Service master (time limit, documents, purpose) · 02 Authority master, effective-dated · 03 Online application form · 04 Completeness check before submission · 05 UIN on complete submission · 06 Form 1 acknowledgement with due date and DPS/FAA/SAA · 07 Acknowledgement PDF / print · 08 Working-day calendar with holidays · 09 Timer from UIN in working days · 10 DPS worklist with timer · 11 One consolidated query, second needs reason, timer pause · 12 Deliver / reject with reasons · 13 Link Officer handover and responsibility ledger

**Breach and filing (AMS-14–31)**
14 Breach detection · 15 Hold at breach · 16 Refuse and log close / reject of held application · 17 Citizen breach notice · 18 Auto-drafted first appeal · 19 Expiring draft link by SMS / email · 20 One-click filing · 21 Edit grounds and file · 22 Decline draft · 23 Decline / lapse switch handling · 24 Appeal against rejection (switch) · 25 Two grounds only · 26 Validation against application and notified service · 27 Appeal number = UIN + level code · 28 Filing window and late-filing reason · 29 One live appeal per level · 30 Appeal acknowledgement · 31 Assisted filing by call centre

**First appeal (AMS-32–68)**
32 Direct routing to authority (no dealing assistant) · 33 Worklist with deadline and days left · 34 Deadline reminders · 35 Case view: application history · 36 Case view: timer pauses · 37 Case view: documents · 38 Case view: responsibility ledger · 39 DPS notified as respondent · 40 DPS reply on portal · 41 Reply due date · 42 Authority calendar · 43 Hearing scheduling · 44 7 clear working days' notice · 45 Short notice with reason · 46 Notice served via dashboard + SMS/email · 47 Online by default, mock video link · 48 In-person with reason · 49 Attendance recording · 50 Adjournment · 51 Hearing notes · 52 Decision on record without hearing · 53 Order templates · 54 Findings · 55 Reasons mandatory · 56 Direction to deliver with deadline · 57 Set aside rejection · 58 Dismissal with reasons · 59 Penalty prompt on every order · 60 Penalty range validation · 61 Officer chosen from ledger · 62 Reason when no penalty · 63 Disciplinary recommendation · 64 Order preview · 65 Mock e-Sign · 66 Final only after signing · 67 Copies to all parties · 68 Order on citizen dashboard / download

**SAA and Commission (AMS-69–85)**
69 Auto-escalation on missed deadline · 70 Missed deadline recorded on appeal · 71 Escalation notices to all · 72 Escalation destination switch · 73 Escalated appeals listed separately · 74 Citizen-filed second appeal (drafted when undelivered) · 75 SAA worklist and decision · 76 SAA extension 60 → 75 with reason · 77 Citizen-filed third appeal, 90-day window, 120-day cap · 78 Registrar scrutiny (admit / return / reject) · 79 Bench assignment · 80 Member votes · 81 Majority, Chief Commissioner casting vote · 82 Dissent recorded · 83 Registrar authentication · 84 Remand with 15-day deadline · 85 Commission penalty on FAA / SAA

**Penalty and recovery (AMS-86–100)**: *superseded by Part 2, §P11, which re-maps these IDs to the central-recovery model. The line below is kept for history.*
86 Penalty record from order · 87 Mock eGRAS link / QR · 88 Payment confirmation · 89 30-day payment period · 90 Payment reminders · 91 Recovery Direction · 92 Recovery Advice to DDO · 93 DDO dashboard · 94 Record salary deductions · 95 Track to full credit · 96 Recovery completion record · 97 Stay of penalty · 98 Refund · 99 Penalty ledger · 100 Recovery from transferred officer via current DDO

**Compliance and closure (AMS-101–111)**
101 Direction timer · 102 DPS compliance worklist · 103 Delivery record with document reference · 104 Citizen confirms receipt · 105 Call-centre confirmation · 106 Close only on delivery + confirmation · 107 Closure certificate · 108 Missed direction reopens before same authority · 109 Alert to next authority · 110 Unconfirmed-delivery follow-up queue · 111 Citizen disputes delivery

**Dashboards and reports (AMS-112–125)**
112 Citizen dashboard · 113 DPS dashboard · 114 FAA/SAA split by ground and origin · 115 Pending applications per DPS · 116 Head of Office dashboard · 117 Commission: by level, overdue by level · 118 Repeated-delay flag · 119 Penalty ledger report · 120 Register of cases for review · 121 Time-to-decide bands · 122 DDO report · 123 CSV export · 124 Filters (district, department, service) · 125 Charts

**Platform (AMS-126–136)**
126 Append-only audit log, per case · 127 Rules held as settings · 128 Policy switches for open points · 129 Scheduler (simulated clock in POC) · 130 Notification log · 131 Holiday calendar admin · 132 Authority master admin · 133 Data retention and archival · 134 Departmental system integration (mParivahan etc.) · 135 DigiLocker issue of certificates · 136 Data migration

---

# Part 2: Penalty payment and recovery module

Status: **draft for approval**. Reference: [docs/penalty-module-brief.md](docs/penalty-module-brief.md).

## P1. Scope and how it fits into this PoC

The module covers a penalty from the moment an appellate order imposes it until the penalty is closed: deemed service, payment by eGRAS QR, the day-30 check, central recovery from salary through the Sewa Setu DDO and the Finance nodal officer, verification, the monthly statement with treasury reconciliation, escalations, and exception cases E1–E18.

It is built **inside this PoC**, not as a separate application:

- **Penalties come from real orders.** The FAA and SAA order builder (and the Commission's authenticated order) already validates the section 9 ranges, lets the authority pick the officer from the case, and e-signs (mock). That is the brief's "Issue penalty order" screen; no separate screen is built. Part 2 changes what happens *after* signing.
- **Shared platform.** Reused as they are: the simulated clock and day-by-day scheduler, the working-day calendar with Assam holidays 2026–27, the append-only audit log, the notification log, sign-in and the role switcher, settings, the PDF builder and the adapters pattern.
- **Replaced.** The old per-office approach (Part 1, A15/A16): the `Penalty`, `Recovery` and `RecoveryDeduction` tables, the penalty and recovery state machines, the office `DDO` role and its `/ddo` screen, the "My penalties" placeholder, and the `recoveryAdviceLagDays` setting.
- **Not changed.** Applications, appeals, hearings, escalation, the Commission bench and the Scheduled Caste Certificate configuration.

Milestone order changes: the old M4 (penalty, recovery, compliance, closure) is split. **M4 is this module.** Compliance and closure becomes **M5**, and the old M5 (dashboards, settings, demo, polish) becomes **M6**.

## P2. Assumptions (Part 2)

| # | Topic | Choice |
|---|---|---|
| P-A1 | **Legal basis for central recovery** | Central recovery by a Finance nodal officer differs from **Rule 6(5) of the Assam Right to Public Services Rules, 2026**. That rule places recovery with the penalised officer's own Drawing and Disbursing Officer (DDO) under a Recovery Direction from the Competent Authority. The POC therefore assumes a **Government notification designating the Finance nodal officer and the Sewa Setu DDO** for this purpose. Its reference is a setting (placeholder text) and is printed on tickets and statements. |
| P-A2 | Where penalties come from | From signed FAA/SAA orders and authenticated Commission orders in this PoC. Demo scenarios stage their own appeals and orders, so each scenario starts in the right state. |
| P-A3 | Deemed service | The service date is the later of two moments: the order posted on the officer's dashboard, and the first SMS or email sent. Both are recorded with the simulated date and the real time. The first time the officer opens the penalty is also recorded (E17). |
| P-A4 | Due date ("service date + 30 days") | 30 calendar days after the service date. If that day is not a working day, the last date moves to the next working day. The basis (calendar or working days) is a setting. |
| P-A5 | Day 30 | The penalty becomes OVERDUE on the first day after the last date, if anything is still unpaid. |
| P-A6 | GRN settlement | A payment creates a GRN marked PENDING. It settles on the working day after the settlement lag (default 1 working day) as SUCCESS, or as FAILED if the demo control forced it. Matching uses the penalty reference in the QR, and the amount is then compared (E4). |
| P-A7 | Closing on the eGRAS route | PAID_EGRAS closes at once: an eGRAS SUCCESS counts as credited to the head of account. |
| P-A8 | Credit and closing on the salary route | Treasury credits are matched daily as they arrive, moving the penalty to CREDIT_CONFIRMED. The monthly statement closes CREDIT_CONFIRMED penalties, so "the statement confirms credit and the penalty closes". |
| P-A9 | Deduction message | Sent on **each** verified deduction (every instalment), with that deduction's amount and month. The final one coincides with RECOVERED. |
| P-A10 | Instalments | If the ticket total is above the threshold (Rs. 10,000), it is split into the maximum number of instalments (3) in equal amounts, with the last one rounded. The plan is recomputed when lines are added, removed, put on hold or partly deducted; any shortfall is added to the next month (E13). |
| P-A11 | One ticket per officer | Keyed by employee ID (it follows the person, not the post, E7). A ticket closes when all its lines are done or removed. |
| P-A12 | Nodal officer on leave | The primary gets tickets unless on leave; then the backup; if both are on leave, the primary, with a "both on leave" flag. Toggling leave moves open tickets. |
| P-A13 | Ticket deadline | Each instalment is due by the salary pay date (last working day of the month) plus 5 working days. Missing it escalates the ticket to the Finance senior officer and shows it as overdue in the Commission view (E14). |
| P-A14 | Stay (E5) | Before confirmation, the calendar days left until the last date are frozen. When the stay is lifted, the new last date is the lift date plus those days, then the next-working-day rule. After confirmation, ticket lines go on hold and resume on lift. |
| P-A15 | Who records stays, reductions and set-asides | The Sewa Setu DDO (court orders) and the Commission. The imposing authority or the higher appellate authority can also record a reduction or set-aside on review. An order reference and an uploaded document are required. Uploads are mock (the file name is recorded). |
| P-A16 | Reduced amounts | A reduction may go below the section 9 minimum, because the reviewing body decides; setting aside makes the amount Rs. 0. Neither can raise the amount. |
| P-A17 | Suspended officer (E11) | Goes to the exceptions queue with a note. The Sewa Setu DDO can choose to resume recovery from the subsistence allowance by hand. This is recorded as an open point. |
| P-A18 | Retirement (E9) | The alert fires when the retirement date is within 3 months (a setting): the ticket goes to the front of the queue, and the Sewa Setu DDO and the nodal officer are told. After retirement: with pension recovery on, lines continue and are marked "from pension"; with it off, the case goes to exceptions. |
| P-A19 | Copy to "the public authority" | Sent to the head of the penalised officer's office. If the office has none, the notification log records the office name as the recipient. |
| P-A20 | Competent Authority | Each officer's appointing or disciplinary authority comes from the mock staff records and is seeded per cadre. |
| P-A21 | Manual recovery (E8, E10) | The Sewa Setu DDO records the letter to the paying authority, its reply and the proof. The amount is then recorded as a deduction of kind "manual" with a voucher, and goes through the same credit check. |
| P-A22 | Write-off (E18) | Only the outstanding balance can be written off. It needs a reason and the Competent Authority's approval (mock e-Sign). It appears in the statement and the Commission view. |
| P-A23 | GRN with an unknown reference | Listed in the Sewa Setu DDO's exceptions tab as an unmatched payment; nothing is matched by hand. |
| P-A24 | Districts | The brief asks for fictional districts. This PoC already uses real district names with fictional offices and people (Part 1, §8), so the module keeps them; every officer and office is fictional. |
| P-A25 | Head of account | Placeholder code, editable in settings, to be confirmed by Finance. |
| P-A26 | Playwright | Set up now (it was planned for the old M5), for Scenarios 2 and 5 of this module. |

## P3. Data model

New or replaced Prisma models. Dates on the simulated clock are `YYYY-MM-DD` strings; "…At" fields also keep the real time.

- **User** (changed): + `employeeId?` (unique), + `onLeave`, + `isBackup` (for the Finance nodal officers). New roles: `SEWA_SETU_DDO`, `FINANCE_NODAL`, `FINANCE_SENIOR`, `COMPETENT_AUTHORITY`. The office `DDO` role is removed. An FAA or SAA user can also be a penalised officer, so "My penalties" appears for every officer with an employee ID.
- **StaffRecord** (mock external system, behind an adapter): `employeeId, name, designation, office, monthlyPay, payrollType (STATE | DEPUTATION_OUTSIDE | ULB | AUTONOMOUS | PSU | CONTRACTUAL), retirementOn, status (ACTIVE | SUSPENDED | RETIRED | RESIGNED | DISMISSED | DECEASED), competentAuthorityId`.
- **PenaltyOrder**: the existing **Order** (one order can carry several penalties, as in Scenario 3).
- **Penalty** (replaced): `ref (PEN-2026-000123), orderId, appealId, officerId, employeeId, officerName, designation, office (snapshot), capacity (DPS | LINK_OFFICER | SUCCESSOR | FAA | SAA), imposedByLevel, imposedById, uin, appealNo, originalAmount, amount (current), orderDate, dashboardPostedOn/At, messageSentOn/At, serviceDate, firstViewedOn/At, dueOn, status, priorStatus (for STAYED), qrActive, headOfAccount, doubleRecovery, retirementAlertOn, delayDaysAttributed`.
- **PaymentGRN**: `grn, scannedRef, penaltyId?, amount, channel (QR | CHALLAN), paidOn, settlesOn, status (PENDING | SUCCESS | FAILED), forceFail`.
- **RecoveryDirection**: `penaltyId, mode (STANDING | PER_CASE), reference, status (AWAITING_SIGNATURE | IN_PLACE), competentAuthorityId, sentOn, signedOn, esignRef, remindersSent`.
- **Ticket**: `ticketNo, employeeId, officerId, status (OPEN | CLOSED), assigneeId, bothOnLeave, priority (NORMAL | RETIREMENT), createdOn, plan (JSON: month → amount, dueOn), escalatedOn`.
- **TicketLine**: `ticketId, penaltyId, amount, status (ACTIVE | ON_HOLD | REMOVED | DONE), note`.
- **Deduction** (replaces RecoveryDeduction): `penaltyId, ticketLineId?, kind (SALARY | PENSION | MANUAL), payrollRef, salaryMonth, amount, voucherNo, proofFile, recordedById, recordedOn, verification (SUBMITTED | VERIFIED | RETURNED), returnReason, verifiedById, verifiedOn, credit (AWAITED | CREDITED | MISSING | ESCALATED), creditMissingOn, escalatedOn`.
- **CreditFeedEntry** (mock treasury feed): `voucherNo, amount, headOfAccount, expectedOn, arrivedOn?, dropped, deductionId?`.
- **Refund**: `penaltyId, reason (DOUBLE_RECOVERY | EXCESS_PAYMENT | REDUCED | SET_ASIDE), amount, status (DUE | REFUNDED), assigneeId, reference, createdOn, refundedOn`.
- **Stay**: `penaltyId, authority (HIGHER_AUTHORITY | COMMISSION | COURT), orderRef, documentName, recordedById, startOn, liftedOn, priorStatus, daysRemaining`.
- **Adjustment** (reductions and set-asides; not in the brief's list, but needed to keep the history): `penaltyId, kind (REDUCED | SET_ASIDE), fromAmount, toAmount, byAuthority, orderRef, documentName, recordedById, recordedOn`.
- **ExceptionCase**: `penaltyId?, grn?, kind (NOT_ON_STATE_PAYROLL | RETIRED_NO_PENSION | RESIGNED | DISMISSED | DECEASED | SUSPENDED | STAFF_RECORD_MISMATCH | UNMATCHED_PAYMENT), status (OPEN | RESOLVED), note, letterRef, letterOn, replyRef, replyOn, proofFile, resolution`.
- **WriteOff**: `penaltyId, amount, reason, requestedById, requestedOn, status (REQUESTED | APPROVED | REJECTED), decidedById, decidedOn, esignRef`.
- **MonthlyStatement**: `month (YYYY-MM), generatedOn, rows (JSON per penalty: imposed, collected through eGRAS, deducted, credited, refunded, written off, difference), totals (JSON)`.
- **Task** (follow-ups for the Finance nodal officer): `kind (STOP_DEDUCTION | CREDIT_FOLLOW_UP | DIRECTION_REMINDER), assigneeId, penaltyId?, ticketId?, dueOn, status (OPEN | DONE), text`.
- **Notification, AuditEvent, Setting, ClockState, Holiday**: existing. The audit log stays append-only, enforced by the database.

Derived amounts, all computed by one function: `collected` = eGRAS SUCCESS + deductions recorded; `refunded`; `writtenOff`; `outstanding = max(0, amount − collected + refunded − writtenOff)`; `excess = max(0, collected − refunded − amount)`.

## P4. State machine (one module: `src/domain/penalty-machine.ts`)

A table of `{ from, event, to, roles, guard }`, checked by the existing `decide()` helper. Every attempt is audited, whether it succeeds or is refused, with actor, role, simulated date, reason and before and after status. After any money event, a pure **`settle(penalty, amounts)`** function picks the next status. It is unit-tested, and it decides PAID_EGRAS, DEDUCTED, REFUND_DUE and similar outcomes in one place.

**Main route**

| From | Event | To | Who | Guard |
|---|---|---|---|---|
| — | `impose` (order signed / authenticated) | RAISED | System | Amount within the section 9 range for level × capacity |
| RAISED, OVERDUE | `grnSettled` SUCCESS, outstanding = 0 | PAID_EGRAS | System | GRN matched by reference |
| PAID_EGRAS | `close` | CLOSED | System | excess = 0 (otherwise REFUND_DUE) |
| RAISED | `dueDatePassed` | OVERDUE | System | today > dueOn, outstanding > 0, not stayed |
| OVERDUE | `confirmUnpaid` | UNPAID_CONFIRMED | Sewa Setu DDO | **No GRN PENDING**; outstanding > 0. Turns the QR off and tells the officer recovery from salary will follow |
| UNPAID_CONFIRMED | `directionInPlace` | (no change) | System (standing) / Competent Authority (per case: sign) | Per-case mode needs the e-Sign |
| UNPAID_CONFIRMED | `addToTicket` | IN_RECOVERY | System | **Recovery Direction in place**; staff record found and matching; payroll type STATE; status ACTIVE (or retired with pension recovery on) |
| UNPAID_CONFIRMED | `routeToException` | EXCEPTION | System | Any of the above checks failing (E8, E10, E11, E16, E9 without pension) |
| IN_RECOVERY, PARTLY_DEDUCTED | `recordDeduction` | PARTLY_DEDUCTED or DEDUCTED | Finance nodal officer (assignee) | Payroll reference, month, amount ≤ outstanding, voucher and proof file all required. **Cannot close or change the amount** |
| PARTLY_DEDUCTED, DEDUCTED | `verifyDeduction` | (no change) or RECOVERED | Sewa Setu DDO | **Proof present**; employee ID, UIN and amount match the line. RECOVERED when verified total = amount. Sends the deduction message |
| PARTLY_DEDUCTED, DEDUCTED | `returnDeduction` | (no change) | Sewa Setu DDO | Reason required; the deduction goes back to the nodal officer |
| RECOVERED | `creditsMatched` | CREDIT_CONFIRMED | System | Every deduction's voucher credited |
| CREDIT_CONFIRMED | `statementGenerated` | CLOSED | System | — |

**Side states**

| From | Event | To | Who | Guard / effect |
|---|---|---|---|---|
| RECOVERED | `creditWindowPassed` | CREDIT_MISSING | System | A deduction has no credit 15 days after it was recorded. Follow-up task for the nodal officer |
| CREDIT_MISSING | `escalationPeriodPassed` | ESCALATED | System | 7 days later. Shown to the Finance senior officer and the Commission |
| CREDIT_MISSING, ESCALATED | `creditsMatched` | CREDIT_CONFIRMED | System | — |
| any active* | `stay` | STAYED | Sewa Setu DDO, Commission | Order reference and document. Stores the prior status and the days remaining; QR off; lines ON_HOLD; "stop deductions" task |
| STAYED | `liftStay` | prior status | Sewa Setu DDO, Commission | New last date = lift date + days remaining; lines active again |
| any non-final | `reduce` | REDUCED → then `settle` | Sewa Setu DDO, Commission, imposing or higher authority | Lower amount, order reference, document. Notifies the officer and the imposing authority |
| any non-final, CLOSED | `setAside` | SET_ASIDE → REFUND_DUE (if anything was collected) or stays SET_ASIDE (final) | as above | Lines removed, QR off |
| any (via `settle`) | `excessFound` | REFUND_DUE | System | excess > 0 (E3 double recovery, E4 excess, E6). Refund task for the nodal officer; officer told; double recovery flagged for the Commission |
| REFUND_DUE | `recordRefund` | REFUNDED → then `settle` | Finance nodal officer | Refund reference required |
| IN_RECOVERY, PARTLY_DEDUCTED | `officerStatusChanged` | EXCEPTION | System | Officer resigned, dismissed, deceased, suspended, or retired without pension recovery |
| EXCEPTION | `resolveAndResume` | UNPAID_CONFIRMED (then ticket) | Sewa Setu DDO | Staff record corrected (E16) or decision to resume (E11) |
| EXCEPTION | `recordManualRecovery` | RECOVERED | Sewa Setu DDO | Letter, reply and proof recorded (E8) |
| EXCEPTION, IN_RECOVERY, PARTLY_DEDUCTED | `requestWriteOff` | WRITE_OFF_REQUESTED | Sewa Setu DDO | Reason; outstanding > 0 |
| WRITE_OFF_REQUESTED | `approveWriteOff` | WRITTEN_OFF | Competent Authority | e-Sign (mock) |
| WRITE_OFF_REQUESTED | `rejectWriteOff` | EXCEPTION | Competent Authority | Reason |

\*Active means RAISED, OVERDUE, UNPAID_CONFIRMED, IN_RECOVERY or PARTLY_DEDUCTED. Final states are CLOSED, WRITTEN_OFF and SET_ASIDE (with nothing to refund).

**Late eGRAS payment.** A GRN that settles SUCCESS after recovery has started goes through `settle`:

- **E2:** no deduction recorded yet. The ticket line is removed, the nodal officer gets a "stop deduction" task, and the penalty goes to PAID_EGRAS, then CLOSED.
- **E3:** a deduction has also been recorded. This is flagged as double recovery and goes to REFUND_DUE.
- **E4 short payment:** the outstanding balance stays due, and recovery continues for the balance only.

**Visibility guard (one function).** A penalty is visible only to: the penalised officer (matched by employee ID, so not a successor in the post), the imposing authority, the Competent Authority, the Sewa Setu DDO, the Finance nodal officers, the Finance senior officer, and Commission users. It is checked on every page, PDF and server action.

## P5. Scheduler jobs (added to the existing daily run, in this order)

1. **GRN settlement**: settle PENDING GRNs due today (SUCCESS or forced FAILED), match them, and call `settle`.
2. **Reminders**: on day 20 and day 27 after the service date (setting), if anything is unpaid and the penalty is not stayed.
3. **Day-30 flag**: RAISED past the last date moves to OVERDUE. Penalties with a pending GRN wait up to the settlement window before they appear in "Confirm unpaid".
4. **Recovery Directions (per case)**: remind the Competent Authority every few working days until signed. Once a direction is in place, add the penalty to a ticket or route it to exceptions.
5. **Retirement alerts and changes in officer status**: retirement within 3 months gives priority and alerts. Retirement date passed, or a status change in staff records, applies the pension rule or routes to exceptions.
6. **Ticket deadlines**: when an instalment's due date passes, any shortfall carries to the next month (plan recomputed) and the ticket escalates (E14).
7. **Treasury credit feed**: credits whose expected date is today arrive (unless dropped) and are matched to vouchers, giving CREDIT_CONFIRMED.
8. **Credit missing**: no credit 15 days after recording gives CREDIT_MISSING and a follow-up task; 7 more days gives ESCALATED.
9. **Monthly statement**: on the first working day of the month, generate last month's statement and close CREDIT_CONFIRMED penalties.

Every job is idempotent and fires on a single day, as in Part 1.

## P6. Screens

All pages use plain English with full forms on first use, for example "Penalty not yet paid; recovery from salary will follow".

| Who | Screen | Notes |
|---|---|---|
| FAA, SAA, Commission | Existing order builder | After signing: deemed service, QR, copies to the five recipients |
| Penalised officer (DPS, Link Officer, FAA, SAA) | **My penalties** `/penalties`, penalty card and detail | Status, amount, last date, QR (when active), proof of service, payments, deductions, messages |
| Penalised officer | **Mock eGRAS** `/egras/[ref]` | Pay the exact amount; demo only: pay a different amount, force the GRN to fail; shows the GRN |
| Sewa Setu DDO | **Recovery workbench** `/recovery` | Tabs: Confirm unpaid · Tickets (open, due, overdue) · Verify proof · Exceptions (including unmatched payments) · Refunds · Credit missing · Monthly statement. Also record stay, reduction and set-aside |
| Finance nodal officer (primary, backup) | **Recovery tickets** `/finance` | Queue (retirement cases first), ticket page with deduction entry and proof upload, refund tasks, follow-up tasks, the "I am on leave" toggle |
| Finance senior officer | **Escalations** `/finance/escalations` | Overdue tickets and missing credits |
| Competent Authority | **For signature** `/competent` | Recovery Directions (per-case mode), write-off approvals |
| Commission | **Penalty ledger** `/commission/penalties` | Imposed, paid through eGRAS, recovered from salary, credited, outstanding, refunded, written off; overdue recoveries; missing credits; double recoveries; write-offs; statements |
| Any permitted user | **Penalty detail** `/penalties/[id]` | Full timeline from the audit log: status changes, documents, messages |
| Admin | Settings (penalty settings editable now), **mock staff records** (transfer, status change, pay), demo controls | Clock and reset already exist |
| Presenter | **Demo scenarios** `/demo` | Penalty scenarios 1–12, each with "Start this scenario" |

The monthly statement downloads as CSV and PDF.

## P7. Settings (new, editable on the admin screen)

Reminder days (20, 27); eGRAS settlement lag (1 working day); settlement wait before confirming unpaid (3 working days); payment period basis (calendar days, moved to the next working day); Recovery Direction mode (standing, or per case); standing order reference (placeholder); notification reference for central recovery (placeholder); instalment threshold (Rs. 10,000); maximum instalments (3); salary pay date (last working day of the month); nodal officer grace (5 working days); credit window (15 days); escalation after credit missing (7 days); pension recovery after retirement (off); retirement alert window (3 months); mock treasury credit lag (5 days); head of account code (placeholder); section 9 penalty ranges (existing, editable). A change applies to new calculations only, and is audited.

## P8. Mocks (adapters)

eGRAS (QR payload, payment, GRN, settlement, force fail); staff records (`StaffRecord` table behind a lookup interface); payroll (deduction reference); treasury credit feed (scheduled credits, "drop this credit" control); SMS and email (notification log); e-Sign (stamps name, role and time). Each sits behind a small interface in `src/adapters`, as the existing mocks do.

## P9. Seed data and demo scenarios

- **Officers.** Staff records and employee IDs for the existing fictional officers, plus four new fictional DPS officers: one on deputation to a public sector undertaking (outside the State payroll), one retiring in under 2 months, one suspended, and one spare for multi-penalty cases. That gives about 10 penalisable officers across DPS, FAA and SAA.
- **New role users.** Sewa Setu DDO (AITEC & CSD Society), Finance nodal officer and backup, Finance senior officer, and Competent Authorities per cadre.
- **Scenarios.** Each one reseeds and stages its starting point: an appeal with a signed order and penalty, with the clock set to the right day.

The 12 scenarios are as in the brief:

1. Paid by QR.
2. Unpaid to closed.
3. Commission penalises an FAA and a DPS.
4. GRN pending on day 30, with the variant where it fails.
5. Late payment and double recovery.
6. Stay, then set aside.
7. Two penalties, instalments and a partial deduction.
8. Outside the State payroll.
9. Retirement and write-off.
10. Credit missing.
11. Nodal officer misses the deadline.
12. "I never got the order".

"Reset demo data" restores the baseline.

## P10. Steps within M4, each ending in a runnable app with tests green, README updated and a commit

| Step | Delivers |
|---|---|
| **P1** | Schema and migration; staff records; new roles in sign-in and the role switcher; penalty creation from orders (deemed service, due date, QR, copies); My penalties; mock eGRAS with GRN settlement and matching; reminders; visibility guard |
| **P2** | Day-30 flag and "Confirm unpaid"; Recovery Direction (standing and per case); one ticket per officer with instalments; deduction entry with proof; verification and the deduction message; leave and backup |
| **P3** | Treasury feed and reconciliation; monthly statement (screen, CSV, PDF); credit missing → ESCALATED; ticket deadline escalation; Finance senior officer screen |
| **P4** | Exceptions E1–E18; Commission penalty ledger; penalty demo scenarios 1–12; Playwright for Scenarios 2 and 5; README 15-minute penalty demo (Scenarios 1, 2, 5, 6, 10); COVERAGE.md (step, exception, control → Done / Partial / Mocked) |

**Unit tests** (pure functions plus the machine table):

- due date from deemed service, across holidays
- settlement wait and GRN outcomes
- no "confirm unpaid" while a GRN is pending
- one ticket per officer and the instalment split
- line removal on late payment
- double-recovery detection and refund
- stay pause and resume with the remaining days
- reduction and set-aside refunds
- routing to exceptions by payroll type and officer status
- partial-deduction carry-forward
- the ticket deadline escalation
- statement figures and credit-missing escalation
- section 9 ranges
- every role guard in the machine, plus the visibility function

**Integration tests** run each scenario's core path through the clock. **Playwright** covers Scenarios 2 and 5.

## P11. Feature IDs for this module (replacing Appendix A, AMS-86–100)

86 Penalty record from the order, with deemed service · 87 eGRAS QR and mock payment · 88 GRN settlement and automatic matching · 89 30-day period, reminders, day-30 flag · 90 Confirm unpaid (Sewa Setu DDO) · 91 Recovery Direction (standing or per case) · 92 Central recovery ticket to the Finance nodal officer, with instalments · 93 Deduction entry with proof · 94 Verification and deduction message · 95 Monthly statement and treasury reconciliation · 96 Credit missing and escalation · 97 Stay, reduction, set-aside and refund · 98 Exceptions queue and write-off · 99 Commission penalty ledger · 100 Transfer-proof visibility (by employee ID). AMS-119 (penalty ledger report) and AMS-122 (DDO report) are delivered by 99 and 95.
