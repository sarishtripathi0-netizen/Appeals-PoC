# Penalty payment and recovery: coverage against the brief

This table checks the penalty module against [docs/penalty-module-brief.md](docs/penalty-module-brief.md), covering each step, each exception case (E1–E18), each control, and the screens, mocks and settings.

What the statuses mean:

- **Done**: built, tested and demonstrable.
- **Partial**: works, with a gap that is noted.
- **Mocked**: an external system replaced by a stand-in, as the brief asks.

The "Demo" column gives the scenario number on the **Demo scenarios** page (`/demo`) that shows each item.

**One deliberate difference from the brief.** Recovery is central, through the Sewa Setu DDO and the Finance nodal officer, as the brief describes. Rule 6(5) of the Assam Right to Public Services Rules, 2026 places recovery with the officer's own DDO. Central recovery therefore assumes a Government notification. Its reference is a setting, and PLAN.md Part 2 records this as assumption P-A1.

## Main flow (steps 1–8)

| Step | Status | Demo | Notes |
|---|---|---|---|
| 1. Issue the penalty | Done | 1, 3 | **The order.** Penalties are set in the order builder (FAA, SAA, or the Commission bench). The amount is checked against the section 9 ranges, which can be edited in the settings, and the order is e-signed (mock).<br>**The penalty record.** It holds a snapshot of the officer from staff records: employee ID, name, designation and office. It also holds the UIN, appeal number, authority and order date.<br>**Deemed service.** The service date is when the order was posted to the dashboard and the SMS and email were sent; both times are kept. The last date is the service date plus 30 days, moved to the next working day if needed.<br>**Card and copies.** The officer's card has a QR code holding the reference, UIN, exact amount and head of account. Copies go to the officer, the public authority, the Competent Authority, the Sewa Setu DDO and the Finance nodal officer (or the backup if the nodal officer is on leave).<br>**Reminders.** The officer is reminded on days 20 and 27; both days are settings. |
| 2. Pay by QR | Done (eGRAS mocked) | 1 | The receipt (GRN) is PENDING until a settlement lag of 1 working day, then SUCCESS or FAILED. It is matched to the penalty by reference and amount. There is no manual "paid" anywhere. |
| 3. Day 30 | Done | 2, 4 | Unpaid penalties become OVERDUE. If a GRN is pending, confirmation waits up to 3 working days. They then appear in the Sewa Setu DDO's **Confirm unpaid** queue. Confirming switches off the QR code and tells the officer that recovery from salary will follow. |
| 4. Recovery Direction | Done | 2 | **Standing mode** (the default) attaches the standing order reference. **Per-case mode** sends a draft to the Competent Authority to e-sign (mock), with a reminder every 3 working days; this reminder interval is fixed. No ticket is sent until a direction is in place. |
| 5. Recovery ticket | Done | 2, 7, 11 | **Structure.** There is one open ticket per employee ID, with a line per UIN. Later penalties for the same officer join the open ticket.<br>**Contents.** The ticket shows details from staff records: pay and payroll type.<br>**Instalments.** A total above Rs. 10,000 is split into up to 3 monthly instalments.<br>**Due date and assignment.** The ticket is due by the salary pay date plus 5 working days. If the primary nodal officer is on leave, it goes to the backup. |
| 6. Deduction | Done (payroll mocked) | 2, 7 | **What is recorded.** The payroll reference (mock payroll supplies one if it is left empty), salary month, amount, treasury voucher and proof file.<br>**Statuses.** A deduction makes the penalty DEDUCTED or PARTLY_DEDUCTED, and any balance carries forward.<br>**Limits.** The nodal officer cannot close a penalty or change its amount.<br>**Gap.** Only the proof file's name is kept; the file itself is not stored. |
| 7. Verification | Done | 2 | The Sewa Setu DDO checks the proof against the employee ID, UIN and amount. They either mark it RECOVERED or return it to the nodal officer with a reason. The officer gets the brief's deduction message by SMS, email and dashboard, copied to the imposing authority and the Competent Authority. |
| 8. Monthly statement | Done (treasury feed mocked) | 2, 10 | **When.** On the first working day of each month, for the month before.<br>**What it shows, per penalty.** Imposed, eGRAS, deducted, credited, refunded, written off, difference and outstanding.<br>**Closing.** A matched credit makes the penalty CREDIT_CONFIRMED, and it is CLOSED when the statement runs. An eGRAS payment counts as credited directly.<br>**Missing credits.** After 15 days the penalty is CREDIT_MISSING and the nodal officer gets a follow-up task. After 7 more days it is ESCALATED to the Finance senior officer and the Commission.<br>**Formats and sharing.** CSV and PDF, shared with the Commission view. |

## Exception cases

| # | Case | Status | Demo | Notes |
|---|---|---|---|---|
| E1 | GRN pending on day 30 | Done | 4 | Confirmation is refused while a receipt is pending. A successful receipt closes the penalty with no ticket. A failed one (demo control **Make this receipt fail**) continues to Confirm unpaid. |
| E2 | Paid after the ticket, before deduction | Done | 5 | The line is removed automatically. The nodal officer gets a "stop deduction" task and a message. The penalty closes on the eGRAS route. |
| E3 | Paid and also deducted (double recovery) | Done | 5 | The penalty is flagged and becomes REFUND_DUE. The nodal officer gets a refund task and the officer is told. The refund is recorded with a reference (REFUNDED, then CLOSED). The case appears under **Double recoveries** in the Commission ledger. |
| E4 | Wrong amount by challan | Done | 1 (eGRAS page) | **Short payment:** the balance stays due, and the instalment plan is redone for the balance only. **Excess payment:** a refund task is created. |
| E5 | Stay | Done | 6 | **Recording.** The Sewa Setu DDO or the Commission records the stay with the order reference and a copy.<br>**Effect.** Before confirmation, the 30-day clock pauses. The QR code is switched off, the ticket line goes on hold, and the nodal officer is told to stop deductions.<br>**Lifting.** Lifting the stay restarts the clock with the days that were left, or returns the penalty to where it was. |
| E6 | Reduced or set aside | Done | 6 | Only the imposing authority, a higher authority, or the Sewa Setu DDO or Commission (recording a court order) can do this; the amount can only go down. If more was collected than is now due, a refund task is created. The officer and the imposing authority are told. |
| E7 | Officer transferred | Done | Admin → Staff records | Recovery follows the employee ID. The penalty stays on the officer's dashboard, and a successor in the post never sees it. |
| E8 | Not on the State payroll | Done | 8 | This is detected from the payroll type when the ticket is created, and the case goes to the exceptions queue. The DDO records the letter to the paying authority, its reply, the voucher and the proof by hand. The treasury credit is then checked as usual. |
| E9 | Retiring within 3 months | Done | 9 | The DDO and the nodal officer are alerted, and the ticket goes to the front of the queue. After retirement, the pension setting decides what happens: continue against pension (on), or move to exceptions (off, the default). |
| E10 | Resigned, dismissed or deceased | Done | Admin → Staff records | Detected from staff records; the case moves to exceptions, where the DDO can request a write-off. |
| E11 | Suspended | Partial | Admin → Staff records | The case moves to exceptions with a note that this is an open point. The DDO can record a decision to continue against the subsistence allowance. The rule itself is left to the Government. |
| E12 | Several penalties on one officer | Done | 7 | One ticket, with the instalment rule applied to the total. |
| E13 | Salary not enough | Done | 7 | The penalty is PARTLY_DEDUCTED and the balance is spread over the remaining months. A month with a part deduction is not counted as missed. |
| E14 | Nodal officer and backup miss the deadline | Done | 11 | The ticket is escalated to the Finance senior officer, noting when both nodal officers were on leave. It shows under overdue recoveries in the Commission ledger, and the amount moves to the next salary. |
| E15 | Deducted but not credited | Done | 10 | CREDIT_MISSING leads to a follow-up and then ESCALATED. The case shows in the statement's difference column. The follow-up makes the mock treasury re-send the credit. |
| E16 | Employee ID not found or mismatch | Done | Admin → Staff records | The case is held in exceptions until the DDO corrects the employee ID and resumes it. |
| E17 | "I never got the order" | Done | 12 | The penalty screen shows the proof of service: when it was posted to the dashboard, the SMS and email log entries, and when the officer first opened it. |
| E18 | Cannot be recovered | Done | 9 | A write-off needs a reason from the DDO and e-Sign approval from the officer's Competent Authority (mock). It appears in the monthly statement and in the Commission ledger. |
| — | eGRAS payment with an unknown reference | Done | Admin → Staff records | This one is not in the brief. Such a payment goes to the exceptions queue for the DDO to resolve. |

## Controls (enforced on the server)

All controls are in one state machine, `src/domain/penalty-machine.ts`. Every refused attempt is written to the audit log. A unit test checks, for every transition, that every role outside the allowed list is refused.

| Control | Status | Notes |
|---|---|---|
| Amount within the section 9 range | Done | Checked when the order is signed. The ranges are a setting. |
| No manual "paid" on the eGRAS route | Done | `settlePaid` is a SYSTEM-only transition, and it runs only from GRN matching. |
| No confirm-unpaid while a GRN is pending; no RECOVERED without proof | Done | |
| The nodal officer cannot close a penalty or change its amount | Done | Deductions can be recorded only on lines that are active and assigned to that officer. |
| No ticket without a Recovery Direction | Done | |
| Visibility | Done | The penalised officer (matched by employee ID), the imposing authority, the Competent Authority, the Sewa Setu DDO, Finance (nodal, backup, senior) and the Commission. No one else can see a penalty, including a successor in the post and the admin. |

## Screens, clock, settings and mocks

| Item | Status | Notes |
|---|---|---|
| Sign-in and role switcher | Done | Username, password and second factor (mock), plus the switcher in the yellow bar. |
| Appellate authority: issue penalty | Done | Done through the order builder, as part of the appeal order. |
| My penalties | Done | |
| Mock eGRAS page | Mocked | Pay the exact amount by QR, or any amount by challan; force a receipt to fail. |
| Sewa Setu DDO workbench | Done | Tabs: Confirm unpaid, Tickets, Verify proof, Exceptions, Refunds, Credit missing, Monthly statement, All penalties. |
| Finance nodal officer | Done | Tickets, deduction entry, refunds, stop-deduction tasks, follow-ups, and the leave toggle. |
| Finance senior officer | Done | Escalated tickets and missing credits. |
| Competent Authority | Done | Recovery Directions to sign and write-offs to approve. |
| Commission ledger | Done | Totals for imposed, eGRAS, salary, credited, outstanding, refunded and written off. Also lists overdue recoveries, missing credits, double recoveries, write-offs and statements. |
| Penalty detail timeline | Done | Built from the audit log, messages and documents. |
| Notification log | Mocked | Stands in for SMS and email. |
| Admin: settings, clock, reset | Done | All the brief's settings except the salary pay date (see below). |
| Salary pay date setting | Partial | Fixed at the last working day of the month, which is the brief's default; it is not editable. |
| Staff records | Mocked | An admin screen to change payroll type, status, retirement date and posting. |
| Treasury credit feed | Mocked | Credits arrive 5 days after a deduction. A demo control can drop one. |
| e-Sign | Mocked | A "Sign" button that stamps name, role and time. |
| Simulated clock and scheduler | Done | +1, +7 or +30 days, or a chosen date. The scheduler runs day by day and handles reminders, settlement, the day-30 flag, ticket deadlines, instalments, credits, the statement, missing credits and retirement alerts. |
| Calendar with Assam holidays 2026–27 | Done | |

## Tests

- **Unit** (`tests/unit/penalty.test.ts`, `recovery.test.ts`, `statement.test.ts`):
  - due dates and deemed service
  - amounts and the QR payload
  - visibility
  - every role guard and control
  - instalment plans and pay dates
  - statement rows and CSV
- **Integration** (`tests/integration/penalties`, `recovery`, `reconciliation`, `exceptions`, `penalty-scenarios`):
  - the main flow
  - E1–E18
  - every demo scenario stages correctly
  - Scenarios 2 and 5 run end to end
- **End to end** (`tests/e2e/penalty-scenarios.spec.ts`, Playwright): Scenarios 2 and 5 clicked through in the browser. Run them with `npm run test:e2e`.
