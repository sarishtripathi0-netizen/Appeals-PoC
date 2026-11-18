# AMS and the HR Utility

This note covers how the Appeal Management System (AMS) uses the HR Utility, what is ready, and what is missing before AMS can take officers from HR instead of its own assignments. It follows the MDM layer ([mdm-gap-analysis.md](mdm-gap-analysis.md)).

The HR Utility's own guide is in its `docs/integration.md`. It was checked on 4 November 2026 against the HR Utility at `http://127.0.0.1:8000`, which reflects MDM version 39019.

## 1. What AMS uses

| HR Utility call | Used by AMS for |
| --- | --- |
| `GET /v1/seat-holders` (office, post, function, `at`) | **Who is answerable.** For a role, it returns the first available holder in seniority order. If no holder is available, it returns the Link Officer under ARTPS rule 3(1). AMS always sends `at`. |
| `GET /v1/seat-holders` on each working day of delay | **The delay ledger from HR.** It records who was answerable on each day (the holder, or the Link Officer while the holder was on leave, tour or training). The days are split with AMS's own `attributeDelay`, as for penalties. |
| `GET /v1/employees/{id}/posts` | The posts an officer can act as, including Link Officer charges. IAM would offer these at sign-in. |
| `GET /v1/events?after=` | Postings, charges, function allotments and leave, read from the last id AMS has seen. Events for offices AMS uses are marked. An event counts only once `effective_at` has passed. |
| `GET /v1/mdm/status` and the `X-MDM-Version` header | Freshness. Each ledger answer AMS keeps (`HrResolution`) stores the MDM version it reflected, so a penalty can be explained later. |

- **Reads only.** AMS never writes to the HR Utility, so it never touches the shared MDM through it either.
- **Where to see it.** The admin screen is **Admin → Officers (HR)**.
- **Address.** Set it with `HR_URL`; the default is `http://127.0.0.1:8000`.

**What doesn't change yet.** AMS screens still use AMS's own authority mappings, Link Officers and handovers. The layer shows, role by role, when AMS can switch.

## 2. The seat table: a stand-in for the Rule Engine

The HR Utility answers for a seat (office, post, function); it never names application roles such as DPS or FAA. Mapping an AMS role to a seat is the Rule Engine's job. Until AMS calls the Rule Engine, `src/domain/hr-seats.ts` holds that mapping. Each entry gives its basis: MDM's `dpsText` / `faaText` / `saaText`, and the HR function catalogue.

| Service · AMS office | DPS seat | FAA seat | SAA seat |
| --- | --- | --- | --- |
| Income, PRC, NCL, Jamabandi · Dispur circle | `CO_DISPUR` / Circle Officer / INCOME_CERTIFICATE, REVENUE or LAND_RECORDS | `DC_KMM` / District Commissioner | `SEC_RDM` / Principal Secretary |
| Same services · Jorhat West circle | `AS-CR-290-01` / Circle Officer | `AS-D-290` / District Commissioner | `SEC_RDM` |
| SC certificate · DC Kamrup Metro | `DC_KMM` / ADC / SOCIAL_WELFARE (Dealing Assistant: SOCIAL_WELFARE) | `DC_KMM` / District Commissioner | `SEC_SJE` / Senior-most Secretary |
| SC certificate · Sonapur co-district | `SDO_KMM-SNP` / Co-District Commissioner / CASTE_CERTIFICATE | `DC_KMM` / District Commissioner | `SEC_SJE` |
| Trade licence · municipal zone | not in MDM | not in MDM | not in MDM |

- **Several available holders.** The Dispur circle has two Circle Officers. When several holders are available, AMS takes the first, in HR's seniority order. Choosing among them (by load or in turn) is for the Rule Engine.
- **Two MDM entries need confirming.** The PRC and NCL seats follow AMS's current setup, which MDM's service entries contradict (see the MDM gap report).

## 3. Readiness on 7 January 2027 (simulated date)

| Outcome | Roles | Which |
| --- | --- | --- |
| HR knows who | 10 | Every DPS and FAA role at the Dispur circle and DC Kamrup Metro. The FAA for the SC certificate in both offices. |
| HR knows only a demo officer | 1 | DPS for the SC certificate at DC Kamrup Metro (`DEMO-0008`, ADC holding Social Welfare). |
| No one in the seat | 2 | Dealing Assistant (Social Welfare) at DC Kamrup Metro: no chair is held. Co-District Commissioner at Sonapur: the chair is vacant. |
| Not covered by HR | 22 | Jorhat (HR covers Kamrup Metro, Nagaon, Dhubri, Nalbari and Tinsukia only), the secretariat offices (`SEC_RDM`, `SEC_SJE`), every SAA, and the municipal office. |

**Delay ledger check.** For a held income certificate at the Dispur circle, due 11 September 2026, HR gives all 85 working days of delay to the Circle Officer (EMP-0047). AMS's own ledger gives them all to its demo DPS. The split is the same; only the officer differs, as expected.

## 4. Gaps before AMS can switch

| Gap | Who closes it |
| --- | --- |
| Jorhat and the other districts AMS serves are not in the HR roster. | HR Utility (data load) |
| Secretariat offices and secretaries (SAA) are not covered. | HR Utility (data load) |
| ARTPS Commission members and the Registrar are not covered. Needed for TAA benches and the Commission's penalty orders. | MDM (designations, see the MDM gap report), then HR |
| Municipal (GMC) offices and posts are absent from MDM. | MDM, then HR |
| Vacant chairs: Sonapur Co-District Commissioner; Dealing Assistants in DC Kamrup Metro. | HR Utility (postings) |
| SC certificate DPS is a demo officer. | HR Utility (real posting) |
| Role → seat mapping lives in AMS. | Rule Engine (AMS should call it, then drop `hr-seats.ts`) |
| AMS's own employee IDs (`EMP-000101`). | MDM mints IDs; AMS stores HR/MDM `EMP-NNNN` |
| Staff data for penalty recovery: monthly pay, payroll type, service status. The HR Utility keeps DOB and retirement date, and deputation as an availability window, but not pay or payroll type. | HR Utility, or a payroll interface |
| Competent authority of an officer (for write-offs and Recovery Directions). | MDM (cadre), see the MDM gap report |
| HR answers `NO_HOLDER`, a status its documentation does not list. | HR Utility (document it) |

## 5. Next steps

1. **HR Utility:**
   - load Jorhat, the secretariats and the Commission;
   - fill the vacant chairs;
   - replace the demo ADC.
2. **AMS:**
   - **Fallback:** when HR resolves a seat, use the HR officer for new cases, with AMS's own mapping as the fallback.
   - **Link Officers:** replace AMS's handovers with HR leave windows and the Link Officer rule.
   - **Penalties:** build the ledger from HR, keeping the MDM version on each answer.
3. **Rule Engine:** AMS calls it for role → seat, instead of `hr-seats.ts`.
4. **Events:** poll on a schedule, and re-route pending AMS work on `posting.*`, `charge.*`, `function.*` and `availability.*`.
