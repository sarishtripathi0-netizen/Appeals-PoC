# AMS and MDM: integration and master-data gaps

This note covers how the Appeal Management System (AMS) uses the MDM service. It then lists the master data AMS holds that MDM doesn't have yet, to be moved into MDM later.

- **MDM checked:** version 39064 at `http://172.16.5.151:4001`, on 4 November 2026.
- **Live report:** **Admin → Master data (MDM)** in AMS, with a CSV download at `/api/mdm/gaps`.

## 1. How AMS uses MDM

AMS follows the consumer checklist in MDM's `integration.md`.

| Checklist item | In AMS |
| --- | --- |
| Local copy with MDM's UUIDs and codes | Table `MdmRecord`: id = MDM UUID, `(entityType, code)` unique, full record as JSON. |
| Sync state | Table `MdmSyncState` (applied version per entity type). Table `MdmSyncRun` logs each run. |
| Entity types copied, parent first | state, district, sub-division, circle, department, office-type, designation, office, office-jurisdiction, cadre, service-role-type, service, holiday, employee, sanctioned-post, link-officer-rule. |
| Freshness | The first run loads `GET /mdm/snapshot/:type`. Later runs use `GET /mdm/version`, then `GET /mdm/changes?since=`. A record is applied only if its `mdmVersion` is newer. A 410 `SNAPSHOT_REQUIRED` reloads the snapshots. |
| Usage endpoint | `GET /api/mdm/usage/{entityType}/{code}` returns `{ inUse, details }`. It counts open applications, authority mappings, officers and live penalties that still point at the record. |
| Consumer registration | **Admin → Master data (MDM) → Register**, as `ams-service`. It needs an address MDM can reach, such as `http://172.16.5.210:3000/api/mdm/usage`. **Not registered yet**: that writes to the shared MDM, so it waits for a decision. |
| Live lookups | The client also wraps `POST /mdm/validate`, `GET /mdm/geo/:code/context` and `GET /mdm/offices/by-jurisdiction`. AMS doesn't call them on any screen yet. |

**Running it.** Run `npm run mdm:sync`, or press **Synchronise now** on the admin screen. Set the address with `MDM_URL`; the default is `http://172.16.5.151:4001`. AMS only reads from MDM; it never writes master data back.

**What doesn't change yet.** AMS's screens and rules still run on AMS's own master tables. The crosswalk (`src/domain/mdm-crosswalk.ts`) maps each AMS record to its MDM code. Switching AMS to read from MDM is the next step, once the gaps below are closed.

## 2. Summary of gaps

| Area | In MDM | In MDM but differs | Missing in MDM |
| --- | --- | --- | --- |
| Departments | 3 | 0 | 2 |
| Districts | 2 | 1 | 0 |
| Offices | 1 | 5 | 3 |
| Services | 1 | 3 | 2 |
| Designations | 24 officers | 0 | 13 officers (11 designations) |
| Employees | 0 | 0 | 22 |
| Holidays (2026–27) | 12 | 4 | 26 |

Two more AMS users, the call-centre agent and the administrator, are portal roles rather than Government designations, so they don't belong in MDM.

## 3. To add to MDM (records)

**Departments**

- Housing and Urban Affairs (service-list code `HUA`)
- Finance (`FIN`)

**Offices**

| Office | Note |
| --- | --- |
| Guwahati Municipal Corporation zone office | Needs a new office type for an urban local body or municipal zone. |
| AITEC & CSD Society | The Sewa Setu DDO for central penalty recovery sits here. |
| Finance Department secretariat (`SEC_FIN`) | |

**Services** (both are in the Sewa Setu service list but not in MDM)

| Service | Service ID | Legacy ID |
| --- | --- | --- |
| Certified Copy of Jamabandi or Records of Right/Chitha | 4124 | 1054 |
| New General Trade Licence under the GMC area | 2712 | 1601 |

**Designations**

- Assistant Settlement Officer
- Zonal Revenue Officer (municipal)
- Additional Commissioner, Municipal Corporation
- Zonal Commissioner (municipal)
- Commissioner, Municipal Corporation
- Commissioner, ARTPS Commission (State Commissioner)
- Registrar, ARTPS Commission. This is different from MDM's `REGISTRAR`, which is the revenue Registrar.
- Drawing and Disbursing Officer
- Joint Secretary to the Govt. of Assam
- Deputy Secretary to the Govt. of Assam
- Additional Chief Secretary to the Govt. of Assam

**Employees**

- **The 22 officers.** All 22 AMS officers with employee IDs are missing from MDM. They are fictional demo officers, so this is about the process, not the names.
- **The code clash.** AMS invents codes like `EMP-000101`, but MDM's contract says only MDM mints employee codes (`POST /mdm/employees/mint`).
- **Proposed fix.** Mint the officers through MDM, store the minted `EMP-NNNN`, and stop issuing codes in AMS.

**Holidays**

- **2027.** MDM has no 2027 calendar, while AMS has 19 holidays for 2027.
- **2026.** The years disagree on these days:

| Date | AMS | MDM |
| --- | --- | --- |
| 31 Jan | Me-Dam-Me-Phi (office closed) | no holiday |
| 4 Mar | Doul Utsav (office closed) | no holiday |
| 20 or 21 Mar | Id-ul-Fitr on 21 Mar | Id-ul-Fitr on 20 Mar |
| 26 Jun | Muharram (office closed) | no holiday |
| 4 Sep | Janmashtami (office closed) | no holiday |
| 16 Apr | working day | holiday |
| 17 Oct | Kati Bihu (office closed) | no holiday |
| 19–21 Oct (Durga Puja) | closed 19 and 20 Oct | closed 19, 20 and 21 Oct |
| 26 Oct | Lakshmi Puja (office closed) | no holiday |
| 24 Nov | Lachit Divas (office closed) | Guru Nanak Jayanti, restricted only (office open) |

- **Proposed fix.** Agree the official calendar from the Government notification, load it into MDM, and have AMS take its calendar from MDM. Weekly offs already agree: Sundays and the 2nd and 4th Saturdays.

## 4. Records in MDM where AMS differs (to correct in AMS, or agree)

| AMS | MDM | Difference |
| --- | --- | --- |
| District SNP, Sonapur co-district | Sub-division `KMM-SNP` | AMS treats a co-district as a district. AMS should hold it as a sub-division. |
| Office of the DC, Kamrup Metro (AMS dept SJE) | `DC_KMM` (GAD) | AMS tagged the office with its service's department. The DC office belongs to GAD. |
| Co-District Office, Sonapur (AMS dept SJE) | `SDO_KMM-SNP` (GAD) | Same issue: the office belongs to GAD. |
| ARTPS Commission (AMS dept REV) | `ASCRTPS` (ARTPPG) | AMS has the wrong department. |
| One "Assam Secretariat" office | `SEC_RDM`, `SEC_SJE`, … | MDM has one office per department. Post each Secretary to their department's office. |
| Jorhat West Revenue Circle Office | `AS-CR-290-01` Jorhat Pachim | Name only. |
| Income Certificate: 15 working days | `100009`: 7 days | Time limit. Confirm which the notification gives. |
| Non-Creamy Layer: 20 working days, Revenue | `1492`: 30 days, SJE | Time limit and department. |
| Permanent Residence Certificate: Revenue, circle | `100030`: PRC for Higher Education, Home & Political, district, 14 days | MDM's entry may not be the same service. Confirm there is a general PRC. |

## 5. Data with no place in MDM yet (needs new entities or fields)

| Data in AMS | Proposal | Should live in |
| --- | --- | --- |
| Who is DPS, Link Officer, FAA, SAA and DA for a service at an office (`AuthorityMapping`) | **The largest gap.** MDM has only `dpsText` / `faaText` / `saaText` and `service-role-type`. Add a **service-authority** entity: service × role type → designation + office type, with validity dates. The person is then resolved through HR. | MDM |
| FAA and SAA decision days per service | Add `faaDays` and `saaDays` to `service`. | MDM |
| Document checklist, eligibility, fees | Add `service-document` and `service-fee` entities (fee with head of account), and eligibility text on `service`. | MDM |
| Competent (appointing or disciplinary) authority | Add a competent-authority designation to `cadre`. For example: IAS → Additional Chief Secretary, Personnel (A); ACS → Principal Secretary, Personnel. | MDM |
| Head of account for ARTPS penalties | A head-of-account code list. | MDM |
| Payroll types; employee statuses (suspended, retired, …) | Shared code lists. | MDM |
| Purpose text for citizens | Use MDM's `service.description` and drop the AMS copy. | MDM |
| Current posting (designation and office); head of office | Postings. | HR Utility |
| Monthly pay, payroll type, retirement date, status | Payroll data. | HR Utility |
| Workflow steps, extra form fields, maximum reverts; penalty ranges (section 9) | Rules and configuration. | Rule engine / service configuration |
| Appeal grounds, order templates, hearing modes, penalty statuses | Specific to appeals. | AMS |
| Roles and sign-in | Identity and access. | IAM |

## 6. Next steps

1. **MDM team:** add the records in section 3. Then add the service-authority entity and the new service fields in section 5.
2. **AMS:**
   - Correct the differences in section 4.
   - Mint employee codes through MDM.
   - Register `ams-service` as a consumer.
   - Switch AMS's departments, districts, offices, services and holidays to read from the MDM copy (the crosswalk then becomes the stored MDM code).
3. **Holidays:** agree the 2026 and 2027 calendar once, in MDM.
