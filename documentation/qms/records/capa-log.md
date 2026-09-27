# CAPA / Nonconformity log (ISO 9001 §10.2)

Append new entries at the top. Do not delete closed records.

---

## Template (copy for each NC)

```
### NC-YYYYMMDD-##
- **Date opened:**
- **Severity:** 1 / 2 / 3
- **Process:** P-BOOK | P-PROV | P-NOTIFY | P-AUTH | P-REL | P-SUP | Other
- **Description:** (what requirement failed)
- **Evidence:** (logs, screenshots, ticket, Meta email)
- **Containment:** (immediate stop-gap)
- **Root cause:** (brief)
- **Corrective action:** (permanent fix)
- **Owner / due:**
- **Verification:** (how we proved it works)
- **Status:** Open | Verified | Closed
- **Docs updated:** (ISO-9000 / decisions / Meta rules / Cursor rules)
```

---

## Records

### NC-20260928-01
- **Date opened:** 2026-09-28
- **Severity:** 3
- **Process:** P-SUP (WhatsApp idle reminder / resume)
- **Description:** Idle nudge "It looks like you stepped away… Tap Continue" gave no context; tapping Continue replied "Reply below to continue" without repeating the pending question or its buttons (family DOB/ID, gender, relationship, Self/Family, pickers).
- **Evidence:** Patient screenshot 2026-09-27 22:33 (UAE); local repro on conv state `awaiting_register_family_details` → generic hint, no buttons.
- **Containment:** N/A (state was preserved; patient could still type the answer).
- **Root cause:** `repromptHintForStep` covered only a few steps and returned text only; Continue attached buttons for one step (`awaiting_nlu_book_confirm`).
- **Corrective action:** `continueFlowPrompt` re-sends each step's original prompt with its buttons/list from saved state (read-only). Reminder names the activity ("…while *adding Roopa Satheesh to your family*").
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** Repro: Continue on family DOB/ID, gender, relationship, book-whom, date → correct prompt + buttons, state unchanged; 137/137 procto tests (3 new).
- **Status:** Verified
- **Docs updated:** capa-log

### NC-20260927-05
- **Date opened:** 2026-09-27
- **Severity:** 2
- **Process:** P-BOOK (WhatsApp family registration)
- **Description:** Registering a second family member without their own mobile failed at the last step with "You're already registered as Rathul Satheesh… Reply BOOK" and looped back to the DOB/ID prompt.
- **Evidence:** Patient screenshot 2026-09-27 22:17; conv `10bfa009` stuck at `awaiting_register_family_details` with Roopa Satheesh / Spouse / 1979-12-20 / female. Old `syntheticDependentPhone("971507801104", any)` = `815078011041` = Rathul's login phone.
- **Containment:** Collected details kept in state; patient can resend DOB + ID after deploy to finish.
- **Root cause:** Placeholder dependent phone was `8 + last10(primary) + first digit of Date.now()` — deterministic per WhatsApp number, so every dependent after the first collided on `findByPhone` (409 self-registration message).
- **Corrective action:** `allocateDependentPhone` — `8 + last4 + 10 random digits`, checked unique on last-10 against user phone and patient contactNumber (6 attempts). Family save 409 now shows a family-specific message instead of the self-registration text.
- **Owner / due:** Engineering / 2026-09-27
- **Verification:** 10 allocations for 971507801104 → 10 distinct 15-digit numbers, none equal Rathul's, 0 `findByPhone` hits; backend `tsc` OK. Live WA confirmation pending deploy.
- **Status:** Verified
- **Docs updated:** capa-log

### NC-20260927-04
- **Date opened:** 2026-09-27
- **Severity:** 2
- **Process:** P-NOTIFY / WhatsApp provisioning
- **Description:** Clinic line +91 99900 52082 stored with the Meta phone id of the +1 555 test number; outbound notifications failing (131037 display name, #100 invalid parameter).
- **Evidence:** Graph: +91 99900 52082 = `1378039178715653`, +1 555-498-8759 = `1288187721051113`, both `name_status: DECLINED`. `whatsapp_numbers` row for 9990052082 held `1288187721051113` (last written at boot 2026-09-26 18:12 UTC; unchanged by 2026-09-27 deploys ⇒ Railway env pins the test id). Webhook chain verified OK (verify handshake, signed POST, probe conversation written to prod DB).
- **Containment:** Row corrected to `1378039178715653` (approved).
- **Root cause:** Railway `WHATSAPP_PHONE_NUMBER_ID` / `GLUCOGUIDE_OTP_PHONE_NUMBER_ID` set to the test number id; `pinPlatformMetaPhoneId` re-applies it on every boot. Display name "Docter Point" declined by Meta.
- **Corrective action:** Set Railway env ids to `1378039178715653`; resubmit a compliant display name in WhatsApp Manager; clinic alerts must not target the clinic's own bot number (#100).
- **Owner / due:** Ops (Railway env, Meta display name) + Engineering / 2026-09-28
- **Verification:** Pending — after redeploy, row keeps `1378…`; notifications SENT.
- **Status:** Open
- **Docs updated:** —

### NC-20260927-03
- **Date opened:** 2026-09-27
- **Severity:** 2
- **Process:** P-NOTIFY / WhatsApp Branch F (document attach)
- **Description:** *General Document* on a shared number saved the file to an arbitrary profile (Self or first linked) without asking which patient.
- **Evidence:** `attachWhatsAppPatientDocument` used `linked.find(isSelf) ?? linked[0]`; clinic notification anchored to the latest booking on the phone (any family member).
- **Containment:** Picker before save when >1 profile is linked.
- **Root cause:** Branch F assumed one patient per WhatsApp number.
- **Corrective action:** New step `awaiting_document_patient` (pending file kept, pick by tap / number / name, cancel discards); `patientUserId` validated against `listLinkedToWhatsApp` before write; clinic anchor = chosen patient's booking (phone fallback only when single profile); confirmation names the patient.
- **Owner / due:** Engineering / 2026-09-27
- **Verification:** `yarn build`; WA smoke on 971507801104 → picker "Self · Satheesh / Rathul Satheesh · Child", invalid reply re-asks, pending file retained; foreign `patientUserId` rejected without write.
- **Status:** Closed 2026-09-27
- **Docs updated:** qms/risk-register.md (R16), decisions.md

### NC-20260927-02
- **Date opened:** 2026-09-27
- **Severity:** 3
- **Process:** P-BOOK / WhatsApp View–Manage booking
- **Description:** WhatsApp *View / Manage booking* listed a 25 Sep appointment (already elapsed, status still ACCEPTED) for reschedule / cancel.
- **Evidence:** Booking `c98b2009…` slotStart 2026-09-25 11:40 IST, status ACCEPTED, shown on 2026-09-27.
- **Containment:** Manage list filters out elapsed visits at query time.
- **Root cause:** `listUpcomingBookingsUncached` filtered by status only (no time check); `cancelByPatient` / `reschedule` had no elapsed guard. The list also read the oldest 50 bookings first, so heavy histories could hide real upcoming ones.
- **Corrective action:** `isBookingStillUpcoming` (slot not started / token day ≥ clinic today); `BookingService.listForPatient({ practiceId, statuses, upcomingOnly, take })` filters in SQL; patient cancel (except WAITING) and reschedule reject elapsed visits.
- **Owner / due:** Engineering / 2026-09-27
- **Recurrence (same day):** *Message doctor* list had its own status-only filter and still showed `c98b2009…`. Now: upcoming (not elapsed) + IN_PROGRESS/COMPLETED updated in last 30 days, filtered in SQL via `listForPatient({ updatedSince })`.
- **Verification:** `yarn build`; WA smoke on 971507801104 → only 28 Sep visit listed; reschedule of `c98b2009…` rejected; guard true for today/tomorrow token day, false for yesterday. Message doctor → 28 Sep (Rathul) + 23 Sep completed (Satheesh) only.
- **Status:** Closed 2026-09-27
- **Docs updated:** qms/risk-register.md (R15)

### NC-20260927-01
- **Date opened:** 2026-09-27
- **Severity:** 2
- **Process:** P-AUTH / WhatsApp booking identity
- **Description:** WhatsApp "Hi" / Book showed a family dependent (Rathul · Child) as *Self* instead of the account owner (Satheesh).
- **Evidence:** Dependent row created with synthetic phone (`wa8…` placeholder email) later had `user.phone` rewritten to the owner's WA MSISDN; `listLinkedToWhatsApp` marked every phone match as self and sorted by name.
- **Containment:** Self detection now excludes dependents; OTP login picks the owner.
- **Root cause:** `verifyOtp` used unordered `findFirst` over `phone OR patient.contactNumber` (dependents share contactNumber), logged in as the dependent and overwrote its phone. Self = "phone matches" with no dependent guard.
- **Corrective action:** `pickPrimaryPatientUser` (no `patient.relationship`, real email first, oldest) used by `findByPhone`, `listLinkedToWhatsApp` (exactly one self) and `phoneOtpAuth.verifyOtp`.
- **Owner / due:** Engineering / 2026-09-27
- **Verification:** `yarn build`; live read-only check on 971507801104 → self = Satheesh, Rathul = family. Data repair (approved): Rathul `user.phone` restored to `815078011041`, name → "Rathul Satheesh".
- **Status:** Closed 2026-09-27
- **Docs updated:** qms/risk-register.md (R14)

### NC-20260912-01
- **Date opened:** 2026-09-12
- **Severity:** 2
- **Process:** P-NOTIFY / WhatsApp multi-tenant
- **Description:** Multiple WhatsApp numbers appeared under / routed as the same clinic.
- **Evidence:** Boot `ensureWhatsAppInfrastructure` + `assignToPractice` stamped shared `WHATSAPP_PHONE_NUMBER_ID` onto every LIVE/assigned row; webhook `findPracticeByWhatsAppTo` used `findFirst` on that Meta id.
- **Containment:** Prefer phoneNumber routing; refuse ambiguous Meta ids; clear duplicate Meta ids on boot (keep oldest).
- **Root cause:** Platform env Meta phone id treated as shared identity for all clinics.
- **Corrective action:** Remove env backfill; assign keeps only row-owned Meta id; pool add rejects duplicate Meta ids; admin UI assigns only clinics without a line and captures Meta Phone Number ID.
- **Owner / due:** Engineering / 2026-09-12
- **Verification:** Restart API; each LIVE row has unique/non-shared Meta id or null; inbound `to` phone resolves correct practice.
- **Status:** Open
- **Docs updated:** Whatsapp-Meta-Rules.md (routing note if needed)

### NC-20260911-01
- **Date opened:** 2026-09-11
- **Severity:** 2
- **Process:** P-NOTIFY
- **Description:** WhatsApp notification_events stayed PENDING (54+); message_templates empty; bot treated "hi" as Hindi; LIVE pool missing wabaPhoneNumberId.
- **Evidence:** DB groupBy PENDING; Redis bull wait length 62; webhook/test reply in Hindi for "hi"; templates count 0.
- **Containment:** Drain via in-process worker on API boot.
- **Root cause:** Notification worker not started with `yarn dev`; seed never synced Meta UTILITY catalog; `parseLanguageChoice` matched bare `hi`.
- **Corrective action:** Inline worker in `index.ts`; `ensureWhatsAppInfrastructure` seeds templates (phone-id backfill later removed in NC-20260912-01); seed sync; language parser fix; Meta #131037 → SKIPPED; remove enqueue race timeout.
- **Owner / due:** Engineering / 2026-09-11
- **Verification:** templates=10; "hi" → language menu; worker logs re-queue; verify_token OK.
- **Status:** Verified
- **Docs updated:** decisions.md

### NC-20260910-01
- **Date opened:** 2026-09-10
- **Severity:** 2
- **Process:** P-BOOK
- **Description:** Using top-level `id` from `GET /procto/practices/mine` as practiceId caused `403 not a member of this practice` because `id` was the membership UUID.
- **Evidence:** Page QA / e2e scripts; doctor queue fetch with `mine[0].id` before normalize.
- **Containment:** Frontend already preferred `membership.practice.id` in most UI paths.
- **Root cause:** API returned membership row shape without remapping; scripts assumed `id === practiceId`.
- **Corrective action:** `getForUser` sets `id`/`practiceId` to practice UUID and exposes `membershipId`; FE `resolvePracticeId`; Cursor rule `practice-membership-id.mdc`; calendar validates UUIDs → 400.
- **Owner / due:** Engineering / 2026-09-10
- **Verification:** Queue with normalized `id` → 200; membershipId → 403; bad calendar providerId → 400.
- **Status:** Verified
- **Docs updated:** decisions.md; `.cursor/rules/practice-membership-id.mdc`

### NC-20260827-01
- **Date opened:** 2026-08-27
- **Severity:** 2
- **Process:** P-AUTH
- **Description:** Admin login with `role: "admin"` failed because `normalizeAuthRole` only mapped doctor vs user.
- **Evidence:** `yarn qa` `auth.admin.login` failed; curl with role=admin returned 403 wrong-portal hint.
- **Containment:** Login without role still worked for admin email.
- **Root cause:** Auth role normalizer omitted `admin`.
- **Corrective action:** Accept `admin` in `normalizeAuthRole` and improve mismatch hints (`backend/src/services/auth.ts`).
- **Owner / due:** Engineering / 2026-08-27
- **Verification:** `yarn qa` 55/55; curl admin login with role returns token.
- **Status:** Closed
- **Docs updated:** `documentation/qms/records/qa-findings.md`

### NC-20260826-01 (bootstrap)
- **Date opened:** 2026-08-26
- **Severity:** 3
- **Process:** P-REL
- **Description:** QMS documentation and enforcement rules were missing; quality controls were informal.
- **Evidence:** No `documentation/ISO-9000.md` / `documentation/qms` prior to this date.
- **Containment:** N/A (documentation gap).
- **Root cause:** Project prioritized feature delivery without a written QMS.
- **Corrective action:** Added `documentation/ISO-9000.md`, `documentation/qms/*`, and `.cursor/rules/iso9000-qms.mdc`.
- **Owner / due:** Engineering / 2026-08-26
- **Verification:** Files present; release checklist referenced from decisions.md.
- **Status:** Closed
- **Docs updated:** documentation/ISO-9000.md, documentation/qms/*, iso9000-qms.mdc, decisions.md
