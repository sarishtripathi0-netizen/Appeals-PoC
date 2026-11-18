# Sewa Setu: Appeal Management System (POC)

A working proof of concept of appeals under the Assam Right to Public Services (ARTPS) Act, for Sewa Setu. It runs on a **simulated clock** with **fictional demo data**. Every external system (OTP, SMS, email, video, eGRAS, e-Sign, DigiLocker, payroll) is a mock.

- Plan and assumptions: [PLAN.md](PLAN.md)
- What is built, by feature ID: [FEATURE_COVERAGE.md](FEATURE_COVERAGE.md)
- Brief: [docs/poc-brief.md](docs/poc-brief.md)

## Run it

Needs Node.js 20 or later.

```
npm install && npm run setup && npm run dev
```

Open http://localhost:3000. `npm run setup` creates `prisma/dev.db` and loads the demo data. Run it again (or press **Reset demo data** on `/demo`) to start over.

| Command | What it does |
|---|---|
| `npm test` | Unit tests (domain rules) and integration tests (services on a separate test database) |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build |

## Using the demo

- The yellow **DEMO** bar shows the simulated date. **+1 / +7 / +30 days** and **Go** move the clock forward. The scheduler runs once for every day passed, so a 30-day jump fires each event on its proper date.
- **Switch role** becomes any seeded user at once. You can also sign in properly:
  - Citizens: mobile `9000000001` to `9000000004`. The OTP is shown on screen.
  - Officers: usernames are listed on `/login/officer`, password `demo123`, second-factor code `246810`.
- **Messages log** shows every SMS, email and dashboard alert that would be sent. **Audit log** shows every action and every refused attempt. The audit log cannot be edited; the database refuses it.
- **Hide feature tags** in the header hides the small blue tags that map each screen to feature IDs.

The demo starts on Monday 2 November 2026.

## Progress

| Milestone | Status |
|---|---|
| M1 Foundations: sign-in, roles, clock, apply + UIN + Form 1, DPS worklist (query, deliver, reject, close), Head of Office handover + ledger, audit and messages logs | **Done** |
| M2 Breach to first-appeal order: hold at breach, draft appeal + link, file / edit / decline, lapse switch, rejection appeals, late filing, DPS reply, hearings with notice rule, order builder with penalty and ledger, e-Sign, copies | **Done** |
| M3 Escalation, SAA, Commission: escalation on missed deadlines (both switch settings) with the missed deadline recorded, SAA one-time extension, citizen-filed second and third appeals, Registrar scrutiny, benches, votes with casting vote and dissent, authentication, remand, Commission penalties on FAA/SAA | **Done** |
| M4 Penalty payment and recovery module (PLAN.md Part 2): penalty from the order with deemed service, QR code and copies; mock eGRAS; reminders; day-30 flag and Confirm unpaid; Recovery Direction (standing or per case); one ticket per officer with instalments; deductions with proof; verification and the deduction message; treasury reconciliation and the monthly statement; all exception cases E1–E18 (stays, reductions and set-asides with refunds, double recovery, manual recovery, write-offs, staff-record changes); Commission penalty ledger; 12 demo scenarios; Playwright tests. See [COVERAGE.md](COVERAGE.md) | **Done** |
| M5 Compliance and closure | Planned |
| M6 Dashboards, settings, demo scenarios, polish | Planned |

Screens for later milestones exist as placeholders, so every menu link works.

### Try M1 in 5 minutes

1. Switch role to **Rina Kalita (Citizen)** → **Apply for a service** → Permanent Residence Certificate → fill in → attach the documents (**Fetch from DigiLocker** is quickest) → **Submit**. Form 1 opens, with the UIN and due date; download it as a PDF.
2. Switch to **Anjali Baruah (DPS, Dispur)**. The application is in the worklist with its timer. Open it → **Ask the citizen for information**. The timer pauses.
3. Back as Rina, reply. Move the clock a few days first to see the due date shift by the paused working days.
4. Switch to **Mitali Das (Head of Office, Kamrup Metro)** → **Link Officer handover** for Anjali. The Link Officer now holds the worklist for those dates, and the ledger on each application shows it.
5. Open the **Audit log** and **Messages log**.

### Try M2: breach to order (about 8 minutes)

Start from fresh data (**Reset demo data** on `/demo`). Rina Kalita's Permanent Residence Certificate is due today.

1. Press **+1 day**. The application is put on hold and a first appeal is drafted. The **Messages log** shows the SMS and email with the draft link (it opens the draft).
2. As **Anjali Baruah (DPS)**, open the held application and press **Close** with any reason. It is refused, and the refusal is in the **Audit log**.
3. As **Rina**, open the draft from the dashboard → **File this appeal now**.
4. As **Pranab Hazarika (FAA)**, open the appeal from the worklist. The case view shows the history, documents, ledger and who held the case during the delay. Fix a hearing: the earliest date with 7 clear working days' notice is filled in, and an earlier date is refused unless you give a reason.
5. Use **Go** in the yellow bar to jump to the hearing date, then record the hearing.
6. In the **Order builder**, keep "Allow the appeal and direct delivery", set 7 days, and impose Rs. 2,000 on the DPS (pre-selected as the officer with most delay days). **Save draft and preview**, then **Sign with e-Sign**.
7. As **Anjali**, record delivery (from **Appeals and directions**). As **Rina**, confirm receipt: the appeal closes.

Also try: the rejected Income Certificate of **Moonmoon Saikia** (appeal against rejection; the order can set the rejection aside), declining a draft, letting a link lapse (+30 days), and the open-point switches listed on `/admin/settings` (they become editable in M5).

### Try M3: escalation to the Commission (about 7 minutes)

Start from fresh data. Abdul Karim's Income Certificate appeal is with the FAA, two working days from its deadline.

1. Press **+7 days**. The appeal moves to the SAA; the FAA's missed deadline is recorded. As **Pranab Hazarika (FAA)**, see it under **Escalated** in the worklist.
2. As **Debajit Mahanta (SAA)**, open it and **Extend** to 75 days with a reason (a second extension is refused).
3. Note the new deadline, then **Go** to the day after it. The appeal moves to the Commission.
4. As **Pallavi Choudhury (Registrar)**, open **Cases** → the appeal → **Admit and assign bench** (all three Commissioners; choose the presiding member).
5. Vote as each member (role switcher): two **Allow**, one **Dismiss** with a note. The note becomes the recorded dissent. (A three-way split asks the Chief Commissioner for a casting vote.)
6. As the presiding member, draft the order: Rs. 5,000 on the DPS and Rs. 2,000 on the FAA (offered because of its missed deadline). Preview → **Sign**.
7. As the Registrar, **Authenticate**. Only now do penalties, the direction and copies go out.

Remand: vote **Remand**, and the order sends the case back to the lower authority with 15 working days; if that is missed, it returns to the Commission.

### Penalty module: 15-minute demo

Every scenario starts from **Demo scenarios** (`/demo`) → **Penalty payment and recovery** → **Start this scenario**. That resets the data, sets the scenario up through the real workflow, and signs you in as the first person in its steps. Each step has an **Open as …** button that switches to the right user. Every penalty is imposed on Monday 2 November 2026, so its last date is Wednesday 2 December 2026. To change the date, use **+1 day** or **Go** (choose a date) in the yellow bar. [COVERAGE.md](COVERAGE.md) maps each part of the brief to a scenario.

1. **Scenario 1: Paid by QR (2 minutes).**
   - As **Anjali Baruah (DPS)**, open **My penalties**. The card shows the UIN, appeal number, authority, amount, last date and QR code.
   - Press **Pay through eGRAS** → **Pay Rs. 2,000 (scan QR)**. The receipt is pending.
   - Press **+1 day**. The receipt settles and is matched, and the penalty closes. No ticket is raised.
2. **Scenario 2: Unpaid to closed (5 minutes).** The clock is on 3 December, the day after the last date.
   - As **Dipika Choudhury (Sewa Setu DDO)**, press **Confirm not paid**. The QR code is switched off, the standing Recovery Direction is attached and a ticket goes to Finance.
   - As **Arup Kumar Das (Finance nodal officer)**, open the ticket. Record Rs. 4,000 for December with a voucher number and a proof file.
   - As the DDO, open **Verify proof** and press **Proof checked**. The officer receives the deduction message; see the **Messages log**.
   - **Go** to 8 December: the treasury credit arrives and is confirmed.
   - **Go** to 1 January 2027: the December statement is generated and the penalty closes. Open **Monthly statement** and download the CSV or PDF.
3. **Scenario 5: Late payment and double recovery (3 minutes).** Two officers are already with Finance. Anjali Baruah has had nothing deducted yet. Pallab Dutta's Rs. 2,500 has already been deducted.
   - As each officer, pay by **challan**; the QR code is off after confirmation.
   - Press **+1 day**. Anjali's line is removed from the ticket, Finance is told to stop, and her penalty closes. Pallab's payment is flagged as a double recovery, with a refund due.
   - As the Finance nodal officer, record the refund with its reference.
   - As **Pallavi Choudhury (Registrar)**, see the case under **Double recoveries** in the Commission ledger.
4. **Scenario 6: Stay, then set aside (3 minutes).** Pallab Dutta has two penalties on one ticket, and Rs. 2,500 has already been deducted on the Rs. 7,000 one.
   - As the DDO, open that penalty and choose **Record a stay**, entering the court order and attaching a copy. The ticket line goes on hold and Finance gets a "stop deduction" task; the other penalty continues.
   - Then choose **Set the penalty aside**. The Rs. 2,500 becomes a refund due.
   - Finance records the refund, and the penalty ends as set aside.
5. **Scenario 10: Credit missing (2 minutes).** Rs. 4,000 was deducted and verified, but the treasury credit was dropped.
   - **Go** to 19 December. The penalty shows "credit not yet seen" and Finance has a follow-up task.
   - **Go** to 27 December. The case is escalated to **Hrishikesh Barman (Finance senior officer) → Escalations** and to the Commission.
   - **Go** to 1 January 2027. The statement shows the difference.
   - As the nodal officer, press **Record follow-up**, then **+1 day**. The credit arrives.

The other scenarios cover:

- the Commission penalising both an FAA and a DPS (3)
- a payment pending on the last date (4)
- instalments with a part deduction (7)
- an officer on deputation (8)
- retirement and write-off (9)
- a missed Finance deadline (11)
- "I never got the order" (12)

**Tests.**

- `npm test` runs the unit and integration tests, including staging every scenario.
- `npm run test:e2e` clicks through Scenarios 2 and 5 in a browser. It uses its own database and a server on port 3100. The first time, run `npx playwright install chromium`.

### Penalty module: step by step

Recovery is central, through the **Sewa Setu DDO** (AITEC & CSD Society) and the **Finance nodal officer**, as set out in PLAN.md Part 2. The plan notes that this assumes a Government notification, because Rule 6(5) of the Assam Right to Public Services Rules, 2026 places recovery with the officer's own DDO.

1. Run the breach-to-order walkthrough above. When the FAA signs the order with Rs. 2,000 on the DPS, the penalty is created. It is posted on the DPS's dashboard and sent by SMS and email; that is deemed service. The last date is 30 days later, moved to the next working day if needed. Copies go to the head of office, the Competent Authority, the Sewa Setu DDO and the Finance nodal officer (the backup while the primary is on leave).
2. As **Anjali Baruah (DPS)**, open **My penalties**. The card shows the UIN, appeal number, authority, amount, last date and an eGRAS QR code. The QR encodes the reference, UIN, exact amount and head of account. The detail page shows the proof of service: dashboard and message times, and when the officer first opened it.
3. **Pay through eGRAS** → **Pay Rs. 2,000 (scan QR)**. The receipt (GRN) is pending. Press **+1 day**: it settles, is matched, and the penalty closes. No ticket is raised.
4. Try the demo controls on the eGRAS page: a short or excess challan (the balance stays due, or a refund is flagged), or **Make this receipt fail**.
5. Other officers never see a penalty, including a successor in the same post. The admin doesn't see it either.

**Unpaid to recovered.** Leave a penalty unpaid and **Go** to the day after its last date.

6. As **Dipika Choudhury (Sewa Setu DDO)** → **Recovery workbench** → **Confirm unpaid**. Confirming is refused while an eGRAS payment is still pending. On confirming, the QR code is switched off and the officer is told that recovery from salary will follow. A standing Recovery Direction is attached and a ticket goes to the Finance nodal officer.
7. As **Arup Kumar Das (Finance nodal officer)** → **Recovery tickets**. There is one ticket per officer, with a line for each UIN. It shows pay and payroll type from the staff records and the instalment plan: over Rs. 10,000 is split into 3 monthly instalments. Record the deduction with the salary month, amount, treasury voucher and proof file; leave the payroll reference empty to fetch one. **Mark me on leave** moves the tickets to the backup.
8. As the **Sewa Setu DDO** → **Verify proof** → **Proof checked: mark verified**. The officer gets "Deduction for UIN … has been processed. Rs. … has been deducted from your salary for …", copied to the imposing and Competent Authorities. You can also **Return to Finance** with a reason.
9. Per-case mode: as **Admin** → **Rules and switches**, set **Recovery Direction** to "Per case". After confirmation, the Competent Authority (**Madhurima Kakati**, under **For signature**) must e-sign before any ticket is raised; she gets a reminder every 3 working days.
10. Officers on deputation (Rakesh Pegu), suspended (Moinul Haque) or with a staff-record mismatch go to the **Exceptions** tab. There the DDO records recovery through the paying authority by hand, corrects the record and resumes, or requests a write-off for the Competent Authority to approve. Retiring officers (Gitanjali Bora) go to the front of the queue. Stays, reductions and set-asides are recorded from the penalty's own page; any excess becomes a refund for Finance. **Admin → Staff records (demo)** changes an officer's payroll type, status, retirement date or posting to show how recovery responds.

**Credit and the monthly statement.**

11. Five days after a deduction, the mock treasury feed reports the credit to the head of account and the penalty shows "credit confirmed". On the first working day of the next month the statement is generated (**Recovery workbench → Monthly statement**, also for Finance and the Commission). It lists, per penalty: imposed, collected through eGRAS (GRN), deducted (voucher), credited, refunded, written off and the difference. Penalties with confirmed credit close. Download it as CSV or PDF.
12. **Credit missing (E15):** on **Recovery workbench → Credit missing**, use **Drop this credit** before it arrives. 15 days after the deduction, the penalty shows "credit not yet seen" and the Finance nodal officer gets a follow-up task. 7 days later it is escalated to the Finance senior officer (**Hrishikesh Barman → Escalations**) and the Commission, and the statement shows the difference. The nodal officer's **Record follow-up** makes the treasury re-send the credit.
13. **Missed deadline (E14):** if nothing is recorded by the salary pay date plus 5 working days, the ticket is escalated to the Finance senior officer and the amount moves to the next salary. A part deduction is not a miss; the balance carries forward.

### Scheduled Caste Certificate (configured from the department's notification)

The service follows the Social Justice and Empowerment Department's draft notification (revising E-No. 541695/58 dated 26.08.2025), with one change decided for the POC: **every application follows the same workflow with a 30-working-day time limit**, instead of the draft's three routes (3, 7 or 30 days by how documents are verified).

| Item | As configured |
|---|---|
| Where | Office of the District Commissioner (Kamrup Metropolitan), or of the Co-District Commissioner (Sonapur), chosen by the applicant |
| Officers | DPS: Assistant Commissioner (Social Welfare). Link Officer: Assistant Commissioner (ARTPS). FAA: District / Co-District Commissioner, 30 working days. SAA: senior-most Secretary, SJE Department, 60 working days. Third appeal: the Commission |
| Workflow | System check against Government records (same day) → Dealing Assistant checks the documents → DPS decides and issues |
| Documents | Live photo captured at application (no upload). Date of birth and residence proof only if not fetched from Aadhaar. Father's SC certificate (fetched from the e-District repository if possible) **or** a recommendation, not both. Other documents optional |
| Reverts | At most 2; the time limit pauses until the applicant replies |
| Fees | Rs. 30 user charges + Rs. 10 convenience fee, paid at submission (mock eGRAS) |

Try it: as **Rina Kalita**, apply for the Scheduled Caste Certificate with father **Ramen Kalita** and certificate **SC/KMM/2019/004512**. Everything except the photo is fetched from records. As **Abdul Karim**, apply in **Sonapur Co-District**: nothing is found in records, so he uploads proofs and a recommendation. Then switch to the **Dealing Assistant** (Document checks) and the **DPS (Social Welfare)**.

Government records (Aadhaar, PAN, e-District repository) are fictional demo data in `src/adapters/index.ts`.

### Master data (MDM)

AMS keeps a local copy of the Sewa Setu master data from the MDM service (`MDM_URL` in `.env`, default `http://172.16.5.151:4001`). It follows the MDM consumer contract: snapshots on the first run, then version-based changes, with a usage endpoint at `/api/mdm/usage/{entityType}/{code}`.

- `npm run mdm:sync`, or **Admin → Master data (MDM) → Synchronise now**, refreshes the copy.
- The same screen shows the gap report: which AMS departments, districts, offices, services, designations, employees and holidays are in MDM, differ, or are missing. Download it as CSV.
- [docs/mdm-gap-analysis.md](docs/mdm-gap-analysis.md) is the write-up for the MDM team.
- AMS screens still use AMS's own master tables; switching them to the MDM copy comes after the gaps are closed.

### Officers and postings (HR Utility)

AMS asks the HR Utility (`HR_URL` in `.env`, default `http://127.0.0.1:8000`) who holds a seat at a given time, whether they are available, and who covers as Link Officer. AMS only reads from it.

- **Admin → Officers (HR)** shows a readiness check for each AMS role (DPS, FAA, SAA, Dealing Assistant): whether HR can name the officer on a date.
- The same screen builds a delay ledger from HR for an application held past its time limit, looks up the posts an officer holds, and fetches HR events.
- The role → seat table (`src/domain/hr-seats.ts`) stands in for the Rule Engine.
- [docs/hr-integration.md](docs/hr-integration.md) lists what is ready and what is missing.
- AMS screens still use AMS's own assignments.

### Appeals from service systems (Rule Engine)

Service systems such as the Minority Community Certificate service (`MCC_URL` in `.env`) expose their applications to AMS with the officers the Rule Engine resolved: the DPS, the Link Officer, workflow officers, and the FAA, SAA and TAA.

- **Admin → Appeals intake** lists the appeal-eligible applications: rejected, or still open after the due date. It shows each snapshot with its officers, checked against MDM and the HR Utility.
- **Bring into AMS for appeal** creates the case. The citizen then signs in with the same mobile number and files the appeal, which goes to the FAA the Rule Engine named.
- [docs/rule-engine-integration.md](docs/rule-engine-integration.md) describes the interaction and the problems found.

## Layout

```
src/domain/      pure rules: calendar, filing windows, penalties, ledger, state machines (unit-tested)
src/services/    use-cases; each checks the state machine, writes audit + notifications in one transaction
src/scheduler/   simulated clock; rules run once per simulated day
src/adapters/    mock external systems behind small interfaces
src/seed/        masters, holidays, demo users and live work
src/app/         screens (one folder per role) and server actions
tests/unit/      domain tests;  tests/integration/  service tests on prisma/test-integration.db
```

All names, offices and cases are fictional. Holiday dates are indicative and must be checked against the Government of Assam notification before any real use.
