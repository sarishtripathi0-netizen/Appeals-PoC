# How the Rule Engine and service systems work with AMS

This note covers how an application decided in a Sewa Setu service system reaches the Appeal Management System (AMS), and what AMS takes from the Rule Engine's resolution.

- **Checked against:** the Minority Community Certificate (MCC) service at `http://172.16.5.151:4005`, on 4 November 2026. Its Swagger page is `/docs`.
- **Builds on:** [mdm-gap-analysis.md](mdm-gap-analysis.md) and [hr-integration.md](hr-integration.md).

## 1. Who owns what

| System | Owns | AMS uses it for |
| --- | --- | --- |
| **Service system** (MCC first; every service built the same way exposes the same `/ams` API) | The application: applicant, documents, workflow tasks, decision, certificate | Which applications can be appealed, and their snapshot |
| **Rule Engine** (inside the service system's submission) | Who the officers are: DPS, Link Officer with ranked candidates, workflow officers, and the FAA, SAA and TAA. Each comes with a resolution id and rule version. | The officers an appeal goes to, and the SLAs |
| **HR Utility** | Who actually holds each chair on a date | Cross-checking the Rule Engine's officers |
| **MDM** | Codes: services, offices, designations, employees | Cross-checking codes |
| **AMS** | The appeal: filing, hearing, order, penalty, compliance | — |

## 2. The interaction

```mermaid
sequenceDiagram
  participant Cit as Citizen
  participant Svc as Service system (MCC)
  participant RE as Rule Engine
  participant AMS
  Cit->>Svc: applies
  Svc->>RE: resolve officers (location, service, date)
  RE-->>Svc: DPS, Link, workflow, FAA/SAA/TAA + resolutionId
  Svc->>Svc: workflow, decision (or the due date passes)
  AMS->>Svc: GET /ams/applications?appealEligible=true
  AMS->>Svc: GET /ams/applications/:no (snapshot)
  AMS->>AMS: create the case: officers from the Rule Engine, citizen by mobile
  Cit->>AMS: signs in with the same mobile, files the first appeal
  AMS->>AMS: FAA named by the Rule Engine hears it; SAA and Commission follow
```

**Appeal-eligible** means one of two things:

- **Rejected.** AMS opens the case as *rejected*, with the decision date and reason. The citizen appeals against the rejection.
- **Still open after the statutory due date** (deemed refusal). AMS opens it as *held* from the day after the due date. The citizen appeals against the delay.

The first appeal always goes to the FAA.

## 3. What AMS does with the snapshot

The administrator does this on **Admin → Appeals intake → Bring into AMS for appeal**. It can later be automated by polling the list.

| From the snapshot | Becomes in AMS |
| --- | --- |
| `application` (number, service, dates, decision) | An AMS application with the same number. Rejected: `rejectedOn` and reason. Overdue: `heldOn` = due date + 1. |
| `designatedPersons.actingDps` (or `dps`) | The DPS of the case, which also seeds the responsibility ledger from the submission date. |
| `linkOfficer`, if a different person | The Link Officer. |
| `appeal.levels` FAA / SAA | The First and Second Appellate Authorities. Their `slaDays` (30 / 60) become the service's decision times. |
| TAA | Not mapped. The third appeal goes to the Commission through AMS's own bench process. |
| `applicant.mobile` | The citizen. They sign in to AMS with the same mobile number. |
| `documents` | The documents list, by file name. |
| The whole snapshot, `rule`, the resolution ids and `mdmVersion` | Kept in `ExternalApplication` for provenance. A refresh updates them. |

- **Stand-in user records.** The Rule Engine's officers have no AMS accounts, so AMS creates one per role, for example `ext-faa-EMP-0139`. In production these would come from IAM.
- **Service, office and department.** AMS adds these by their MDM codes when they are missing.
- **Tested live.** MCC-2026-000002 was brought in and Mary Das filed her appeal. It went to Jayanta Phukan, the District Commissioner the Rule Engine named, with a decision due by 11 December 2026.

## 4. Problems found

**The Rule Engine's officers don't line up with MDM or the HR Utility.** For MCC-2026-000002, none of the nine persons agrees with both systems:

| Role | Rule Engine | MDM | HR Utility, on the decision date |
| --- | --- | --- | --- |
| DPS / Link | EMP-0141 Bornali Medhi, `DC_KMM:ADC:2` | no such code | Hemanga Nabish (EMP-0026) holds the chair |
| Dealing Assistant | EMP-0147 Karabi Baruah | no such code | chair vacant |
| Circle Officer, Azara | EMP-0026 Hemanta Hazarika | EMP-0026 is Hemanga Nabish | Bilaob Sarma Bordoloi (EMP-0044) |
| Supervisor Kanungo / Lot Mondol | EMP-0027 / EMP-0028 | other people | chairs vacant |
| FAA | EMP-0139 Jayanta Phukan | no such code | Swapnil Paul (EMP-0008) |
| SAA | EMP-0210 Rina Ahmed | no such code | not covered |
| TAA | EMP-0001 Bikash Deka | EMP-0001 is Rajib Das | not covered |

**What this means:**

- **Employee codes clash.** The Rule Engine appears to resolve people through a different source of postings from the HR Utility. Its person records carry posting UUIDs and order numbers such as `GAD/EST/2025/241`, which the HR Utility doesn't have. This is inferred from the data, not confirmed; the likely source is the older `hr-service` registered in MDM. That source has its own `EMP-` codes, so the same code means different people in different systems.
- **Some facts can't be checked.** An appeal can't yet be traced to a person that MDM or HR would recognise.
- **Penalties need the right person.** A penalty imposed on "EMP-0139" would land on the wrong officer, or on no one.

**Other points:**

1. **Persons are fixed when the application is submitted.** The snapshot's officers are those at submission (`resolutionId`), not when the appeal is filed or heard. Example: the District Commissioner is Jayanta Phukan on the older MCC applications, but Swapnil Paul on the RTPS application submitted on 4 November. The service system has `POST /applications/{no}/re-resolve`, but AMS shouldn't change a service system's application. AMS needs its own rule here: hear the appeal with the FAA in post on the filing date.
2. **The TAA's `slaDays` is null ("from the rule").** AMS uses its own Commission timelines.
3. **Penalty data is missing.** There is no employee data for penalties: pay, payroll type, status. See the HR note.
4. **There is no change feed.** The `/ams` API is read-only and has no events. A status change in the service system (for example, delivered after the due date) reaches AMS only when AMS re-reads it.
5. **The list returns at most `limit` rows** and has no paging cursor.
6. **No authentication.** The `/ams` API returns names and mobile numbers with no sign-in. That is acceptable for a PoC only.
7. **AMS's application number is the service system's number** (`MCC-2026-000002`). AMS's own `RTPS-…` numbers and the RTPS-series numbers from service systems could clash if two systems ever issue the same number.

## 5. Next steps

1. **Unify officer identity:**
   - The Rule Engine resolves through the HR Utility, or at least through MDM-minted employee codes.
   - Then AMS's MDM and HR cross-checks should show all green.
2. **Agree the appeal-time rule:** which FAA hears a case — the one named at submission, or the one in post when the appeal is filed. Today AMS uses the Rule Engine's snapshot.
3. **Automate intake:**
   - Poll `appealEligible=true`, or better, have service systems publish an `application.appealEligible` event.
   - Refresh imported cases when their status changes.
4. **Add the other service systems** to `SERVICE_SYSTEMS` in `src/adapters/service-systems.ts` as they expose `/ams`.
5. **Retire AMS's stand-in seat table** (`src/domain/hr-seats.ts`) for services that come through a service system, because the Rule Engine already resolved the officers.
