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

### NC-20260929-01
- **Date opened:** 2026-09-29
- **Severity:** 2
- **Process:** P-BOOK
- **Description:** A visit existed without a Patient ID (MRN): Appointments showed "Vishnu Sharma — +971-5014526392 — Not set" (emergency walk-in, 28 Sep 13:18). Requirement: every patient and every visit has an MRN.
- **Evidence:** `practice_bookings.patient_id` null on 1 of 15 bookings; desk list showed MRN "Not set".
- **Containment:** `scripts/backfill-booking-patients.ts --apply` linked the booking to a new patient record (clinic prefix, MRN `PNCMR00000006`, `createdBy = booking_backfill`; gender / DOB left for the desk). Re-run reports 0 unlinked bookings.
- **Root cause:** `POST /procto/bookings` accepted name + phone only (public web guests and the portal *Book appointment* modal), and walk-ins created before the desk-patient rule had no patient.
- **Corrective action:** Server rule in `BookingService.createBooking`: `patientId` must be an existing patient (400 otherwise). `POST /procto/bookings` now needs a session (401 for guests); staff sessions go through `createDeskBooking` (desk-picked patient, phone must match the record, doctor own-list rule); patient sessions are forced to their own id. Portal modal uses the desk patient search / registration; public web booking asks guests to sign in (WhatsApp OTP creates the MRN).
- **Owner / due:** Engineering / 2026-09-29
- **Verification:** Refusal-path smoke (guest 401, staff without patient 400, wrong phone 400, walk-in without patient 400); desk search returns Vishnu with `PNCMR00000006`; Appointments row shows the MRN; tsc + 225 procto tests + builds.
- **Status:** Verified
- **Docs updated:** flow.md, decisions.md, risk-register.md (R30)

### CR-20260929-20
- **Date opened:** 2026-09-29
- **Severity:** 2
- **Process:** P-BOOK (slots / schedules) / P-NOTIFY / tenant isolation
- **Description:** User asked receptionists to create or extend schedule slots directly on the calendar — drag over an unallocated window, or a hover *+ Slot* on a doctor's column header / empty time — with an inline quick-create popover pre-filled with doctor and time. Building it exposed three existing defects: (1) override and token-session `DATE` columns (written from clinic midnight, stored under the previous UTC date) were compared in clinic time by `slotEngine#sameDay`, so `EXTRA_SLOT` windows never produced slots, leave / blocked days did not block slots, and token counts restarted at #1 (duplicate tokens); (2) creating any override — including `EXTRA_SLOT` — sent the *doctor's schedule changed* WhatsApp to every booked patient that day; (3) `GET …/calendar` did not check that the caller belongs to the practice.
- **Evidence:** Local smoke: an extra 5–6 PM window on Thu 5 Nov was stored but `timeSlots` stayed empty; the server log dated the row 2026-11-04. Read-only DB check: no override rows and no token bookings exist yet, so no stored data or real patient was affected. Code review of `createOverride` (notification loop not filtered by type) and the calendar route (no membership check).
- **Containment:** None needed in data (zero override / token rows). Fixed before any clinic used extra slots, leave overrides or token mode.
- **Root cause:** Two conventions for DATE columns (clinic midnight vs UTC midnight) with a comparator that assumed the other; override notification written for leave and applied to every type; calendar route relied on the scope check alone.
- **Corrective action:** `sameDay` compares the stored UTC date key (same convention as `isBookingStillUpcoming` / `localDayOfSessionDate`); override list returns the real `day`. `calendarSlots.ts` (`dayWindows`, `checkExtraWindow`, `DESK_ROLES`); `createExtraSlots` (reception / admin any doctor, doctor own; active doctor; not past / leave / overlapping; ≥ 1 slot; no patient message) and `deleteExtraSlots` (refused while booked); calendar returns `windows`, uses the booking path's slot length on days off, and requires membership. Frontend: Day view rebuilt as a doctor-column time grid (`CalendarDayGrid`) with drag-select, hover *+ Slot*, header *+ Slot*, extra / blocked / leave bands, now line; `QuickSlotPopover`; Week-view *+ Slot*; success notice with **Undo**.
- **Owner / due:** Engineering / 2026-09-29
- **Verification:** 215/215 procto tests (6 new: day windows / break split, day-off slot length, valid windows, every rejection rule, DB round-trip dates for extra slots + leave blocking + token numbering, 12-hour labels). Local API smoke (demo dr.solo, empty Thu 5 Nov): add 5–6 PM → 3 slots (5:00 / 5:20 / 5:40 PM listed); overlap, inside hours, past day, 15-min window → 400 with clear messages; foreign practice calendar → 403; delete → 200, again → 404, day empty. Browser: Day grid showed hours 10 AM–2 PM with both real Sep-30 visits in place; hover ghost *+ Slot 5:00 PM*; drag 5–6 PM → popover pre-filled (Dr. Priya Nair, 17:00–18:00, *3 bookable 20-min slots*); *Add 3 slots* → violet band + notice; **Undo** → band gone, API 0 extra / 0 slots; header *+ Slot* on Sep 30 suggested 2:00–2:20 PM (closed without saving); click inside hours opened nothing; Week-view *+ Slot* opened the popover for that day. No booking touched, no message sent.

### CR-20260928-19
- **Date opened:** 2026-09-28
- **Severity:** 2
- **Process:** P-BOOK (slots / schedules) / P-NOTIFY
- **Description:** User asked for patient & communication rules on schedule changes: a minimum notice period (doctors cannot set an effective date that shifts booked visits without notice, e.g. 48 hours or 7 days), and patient notifications (WhatsApp / SMS / email) sent only after conflicts are resolved, telling patients their updated time or asking them to confirm / reschedule.
- **Evidence:** After CR-18 a change could start today and move visits happening within hours; each resolver action messaged the patient immediately, so patients could hear partial results while other clashes were still open, and *activate anyway* left the remaining patients uninformed ("clinic contacts the patients").
- **Containment:** n/a (proactive).
- **Root cause:** No lead-time rule on effective dates; notifications were coupled to each booking write.
- **Corrective action:** `practices.schedule_notice_hours` (24/48/72/168, default 48) + `schedule_change_alerts` table (additive migration). `applyNoticePeriod` / `planVersionStart` in preview, save, per-day save, pending view and activate: start moves to the day after the last booked visit inside the window. Resolver writes with `skipPatientNotification` and holds one alert per booking; `ScheduleAlertService.dispatch` (claim → WhatsApp template / email → outcome) on full resolution, activate (plus `ASK_TO_RESCHEDULE` for remaining clashes), discard, *Send now* route, and the worker's 5-minute sweep (`dispatchDue`). UI: notice select on both Settings forms, *Booked patients need N notice* dialog, held-alerts box with *Send now*, resolver copy; provider app shows the notice message.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** 209/209 procto tests (5 new: notice blocking / start date, 7-day window, option normalisation, sweep due rules). Local read-only smoke on demo dr.solo: *Wednesday off* from today → start moved to Thu 1 Oct, both real Sep-30 visits listed in `blockedBy`, 0 conflicts; from Oct 5 / unchanged schedule → not adjusted; notice = 5 → 400; send-held with none pending → 0. Browser: notice select shows 48 hours; Save opened *Booked patients need 48 hours' notice* with both visits and *Apply from Thu, 1 Oct*; closed with *Back*, nothing saved (no pending version). Dispatch covered by unit tests only — no real patient was messaged.

### CR-20260928-18
- **Date opened:** 2026-09-28
- **Severity:** 2
- **Process:** P-BOOK (slots / schedules) / P-NOTIFY
- **Description:** User asked for a conflict resolution workflow for reception / doctors when a schedule change clashes with bookings: reschedule suggestions (closest equivalent slots under the new schedule), bulk actions (reschedule with Email / WhatsApp alert, reassign to another doctor, cancel with reason), and override exceptions that keep specific visits valid outside the new hours.
- **Evidence:** After CR-17 the pending panel only listed clashes; staff had to reschedule / cancel each visit elsewhere, one by one, with no suggestions, no reassignment, no cancel reason, and no way to mark a visit as an accepted exception. Slot engine counted a slot as taken only by a visit with the *same* start, so an off-grid visit kept after a slot-length change would not block overlapping new slots.
- **Containment:** n/a (proactive).
- **Root cause:** Impact assessment had no resolution step; bookings had no exception / cancel-reason fields.
- **Corrective action:** `practice_bookings.override_slot` / `override_note` / `cancel_reason` (additive migration). `scheduleResolution.service.ts`: plan (ranked + auto-matched slots under the schedule each day will have, doctors free at the same time, email availability) and resolve (per-visit RESCHEDULE / REASSIGN / CANCEL / KEEP, `dryRun`, batch slot claims). `BookingService.reschedule` accepts the target day's (pending) schedule and booking-type switch; new `reassignProvider`, `keepAsOverride`; `updateStatus` stores the cancel reason. Conflict checks skip override visits; discard / activate clear redundant flags; `countBookingsOccupying` makes overlapped grid slots unavailable. Resolver dialog (bulk bar, alert toggles, review → confirm, per-visit outcome) opened from the pending panel on Settings and Practice → Hours; *Override slot* badge on the calendar.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** 204/204 procto tests (4 new: override visits never flagged, suggestion ranking, auto-match uniqueness / token capacity, overlap blocking). Local smoke on demo dr.solo with a *Wednesday off* pending version (2 real Sep-30 visits): plan auto-matched Fri 2 Oct 10:20 and 11:00 with nearby alternatives; dry runs — reschedule both OK, same slot twice → second rejected, keep + cancel-with-reason OK, missing reason / slot outside new schedule / duplicate / stale booking rejected, reassign refused for a doctor account, bad input 400; alerts reported *email not configured* locally. Browser: resolver opened from the panel, review showed per-visit outcomes; closed with *Back*. One real write: *Keep* on one visit (no message, status unchanged) → clashes 2 → 1, calendar API returned `overrideSlot: true`; discarding the pending version cleared the flag. Both visits unchanged (ACCEPTED, same times, no cancel reason), 0 notifications created, schedule back to Mon/Wed/Fri 10:00–14:00.

### CR-20260928-17
- **Date opened:** 2026-09-28
- **Severity:** 2
- **Process:** P-BOOK (slots / schedules)
- **Description:** User asked for safeguards for pre-existing appointments: an impact assessment against bookings on/after `effective_from` (outside new hours / disabled days, new breaks, awkward slot-interval alignment) and non-destructive saving — a clashing schedule must be held in a *Pending verification* state instead of going live.
- **Evidence:** After CR-16, *Apply anyway* wrote the clashing version as live immediately; conflicts carried only a free-text reason (no break / off-grid distinction); provider-app per-day saves had no conflict check at all.
- **Containment:** n/a (proactive; no bookings affected).
- **Root cause:** Schedule versions had no lifecycle state — every saved version was active.
- **Corrective action:** `provider_schedules.status` (`ACTIVE` / `PENDING_VERIFICATION`, additive migration, default ACTIVE) + `submitted_by_id`; every slot / booking reader filters `ACTIVE_VERSION`. `assessBooking` classifies `DAY_OFF` / `OUTSIDE_HOURS` / `IN_BREAK` / `OFF_GRID` (nearest grid times) / `MODE_CHANGED` / `OVER_CAPACITY`; `summarizeImpact` counts. Settings save and per-day upsert run the check server-side; conflicts → pending (current schedule stays, nothing cancelled). Activate (safe date / two-step anyway) and discard endpoints; pending panel on Settings and Practice → Hours; provider app shows a pending notice.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** 200/200 procto tests (8 new: each code + summary). Local smoke on demo dr.solo against the 2 real Sep-30 bookings (10:20, 11:00): previews returned OUTSIDE_HOURS (start 11:00), IN_BREAK (break 10:10–10:40), OFF_GRID (15-min, nearest 10:15 / 10:30), DAY_OFF ×2 (Wed off), MODE_CHANGED ×2 (Token), 0 (unchanged). Saving start 11:00 → `PENDING_VERIFICATION`, active rows unchanged, Sep-30 availability still 12 slots with both bookings; panel screenshot showed safe date Thu 1 Oct; *Discard* in browser removed it. Activate path: pending → activate from 2026-12-01 → active upcoming version, 0 conflicts → cancelled; demo back to Mon/Wed/Fri 10:00–14:00. No booking touched.

### CR-20260928-16
- **Date opened:** 2026-09-28
- **Severity:** 2
- **Process:** P-BOOK (slots / schedules)
- **Description:** User asked for an Effective Date model so schedule edits don't corrupt existing bookings. Before this, *Save* on provider settings deleted every `provider_schedules` row for the doctor and rewrote them: new hours applied to all future days at once, so visits already booked outside the new hours / days silently dropped out of the slot grid (only a Time ↔ Token switch was deferred, one day, via `Doctor.pendingSchedule`).
- **Evidence:** `syncProviderSettings` did `deleteMany({ practiceId, providerId, locationId })` + `createMany`; availability / booking / day view read all active rows with no date. DB: 15 schedule rows in 3 groups, 0 pending switches.
- **Containment:** n/a (no report of lost bookings; change made proactively).
- **Root cause:** Schedule stored as a single mutable weekly record with no validity period.
- **Corrective action:** `effective_from` on `provider_schedules` (additive migration, existing rows = baseline 2000-01-01, unique key now includes the date). `scheduleVersions.ts` picks the version per clinic day; all readers switched. Settings save writes a version at *Changes apply from* (≥ today; mode switch ≥ tomorrow) and supersedes later versions only; per-day upsert copies the version in force. Read-only preview endpoint + dialog (affected bookings, *Apply from {safe date}*, *Apply anyway*); upcoming-change banner with cancel (future only). Legacy `pendingSchedule` converted to a version.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** 192/192 procto tests (13 new). Local smoke on demo dr.solo: preview (shorter hours → 0 conflicts; Token switch → 2 real Sep-30 bookings listed, start pushed to Sep 29, safe date Oct 1; >1 year → 400; cancelling a started version → 409). Saved a 10:00–13:00 version from 2027-06-01 (outside the booking window): calendar 2027-05-31 kept 12 slots, 2027-06-07 showed 9; cancelled → 12 again, no upcoming rows. Browser: Settings shows the date field, mode dialog names the start date, conflict dialog lists both visits; *Back* wrote nothing (schedule unchanged). No booking touched.

### CR-20260928-15
- **Date opened:** 2026-09-28
- **Severity:** 2
- **Process:** P-BILL (patient payments) / P-NOTIFY (WhatsApp)
- **Description:** User asked that a WhatsApp confirmation be sent after payment completes. Investigation showed a receipt existed in code but (1) it fired only when Razorpay's redirect / webhook reached us — the platform webhook has no `payment_link` events and clinics may skip theirs, so a patient closing the page got nothing; (2) it was fire-and-forget (no record, failures silent); (3) `docline_payment_request` / `docline_payment_received` had **never been submitted** to the live WABA, so out-of-window sends could not deliver; (4) prepay receipts didn't confirm the appointment.
- **Evidence:** Meta `message_templates` for WABA 1585598906596861: 8 templates, no payment templates. `applyLinkState` used `void …catch(() => undefined)`. Ledger empty (no paid links yet), so no patient had been affected.
- **Containment:** n/a (no paid links in production yet).
- **Root cause:** Confirmation depended on inbound Razorpay events only; template provisioning runs at WABA connect time, so catalog templates added later were never submitted; delivery outcome not persisted.
- **Corrective action:** `sendReceipt` claims once per row (`receipt_delivery`), stores SENT / FAILED / SIMULATED + error, broadcasts to Payments. New UTILITY template `docline_payment_booking_confirmed` (appointment time, doctor, amount due at clinic) for prepay; custom → `docline_payment_received`. Background `paymentPollWorker` (2 min) refreshes pending links and retries unattempted confirmations. Payments tab / provider app show confirmation status. Submitted the three payment templates to Meta (PENDING review).
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** 179/179 procto tests (new: balance due, appointment label, confirmation template render). Dry run with WhatsApp token cleared (simulated send, dummy phone, temp ledger rows deleted after): ADVANCE on an upcoming booking → `docline_payment_booking_confirmed` "₹300 … Dr. Priya Nair on 9/30/2026, 11:00 AM … Amount due at the clinic: ₹400"; CUSTOM → `docline_payment_received`; both rows `SIMULATED`; second poll sent nothing. Backend tsc + build, frontend tsc + build, provider tsc clean. **Open:** Meta approval of the three payment templates; other catalog templates (clinic alerts, visit summary, prescription) are also not on the WABA.

### CR-20260928-14
- **Date opened:** 2026-09-28
- **Severity:** 3 (change control — billing)
- **Process:** P-BILL (patient payments) / Settings
- **Description:** Clinics and solo doctors asked to collect patient payments into **their own Razorpay account** instead of the platform account (settlement was manual).
- **Evidence:** User request; all Payment Links (WA advance / fee, custom requests) used the platform `RAZORPAY_KEY_ID` (CR-20260928-11 / -12).
- **Containment:** n/a (new capability; platform account remains the fallback so existing flows are unchanged).
- **Root cause:** Single platform key hard-wired in `lib/razorpay.ts`; no per-practice credentials.
- **Corrective action:** Settings → **Online payments (Razorpay)** (owner / admin, or the solo doctor): Key ID + Key Secret + optional webhook secret, verified live with Razorpay (`GET /payments?count=1`) before saving; secrets AES-256-GCM encrypted (`core/security.encrypt`), excluded from every default Prisma read (global `omit`) and never returned (only `••••last4`). Payment Links use the clinic's account when connected, else the platform account; each `payment_requests` row stores the `razorpay_key_id` it was created with so callbacks / refresh / cancel use the right secret. Per-clinic webhook `POST /procto/payments/razorpay/webhook/:practiceId` verified with the clinic's webhook secret and limited to that clinic's links (platform webhook can't touch clinic-account links). Razorpay 401 mapped to 502 / a clear 400 so it is not mistaken for session expiry. Subscription billing stays on the platform account.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** 176/176 procto tests (new: key ID format / mode, per-account callback signature, webhook secret HMAC). Browser (dr.solo): panel shows *Not connected* + platform fallback + webhook URL; malformed Key ID → "Enter a valid Razorpay Key ID…"; well-formed fake keys → "Razorpay rejected this Key ID / Key Secret…" (session kept). Server script: save with real keys → connected, secret absent from response, DB values are ciphertext, default practice read has no secret columns; clinic webhook bad signature → 401, good signature → 200, no secret → 200 ignored; keys removed afterwards (practice back to platform fallback). Backend tsc + build, frontend tsc + build, provider tsc clean.

### CR-20260928-13
- **Date opened:** 2026-09-28
- **Severity:** 2
- **Process:** P-BOOK (slots) / Settings
- **Description:** Found while verifying CR-20260928-12. (1) Doctor **Settings** sometimes showed default hours (09:00–17:00, 15-min slots) instead of the saved schedule; pressing *Save* would then overwrite the real slots. (2) **Solo doctors could not save their fee** (nor the new advance amount): `PATCH /procto/practices/:id/profile` returned 403 "only clinic owners…".
- **Evidence:** Browser (dr.solo): after reload the form showed 09:00–17:00 while DB rows were 10:00–14:00 / 20 min; resource timing showed `GET …/schedules?providerId=52T4p8AwTA-…` → 403. Direct profile PATCH → 403; the only member of the SOLO practice has role `DOCTOR`.
- **Containment:** DB schedule rows confirmed untouched (`updatedAt` 2026-09-17) before any further save.
- **Root cause:** (1) `DoctorAccountForm` took `userId` from `/users/doctor/info`, whose `id` is a public encoded ID, not the user UUID; when that request resolved first the schedule fetch 403'd and the form silently kept its defaults with *Save* enabled. (2) SOLO practices are created with the doctor as `DOCTOR` (no owner), but `updatePractice` required `PRACTICE_OWNER` / `PRACTICE_ADMIN`.
- **Corrective action:** (1) Use `membership.userId` (from `/practices/mine`); if the schedule fails to load show the error and disable *Save* (also blocked while loading). (2) New `PracticeService.assertProfileEditor`: owner / admin, or the **only active member** (role DOCTOR) of a **SOLO** practice; used by `updatePractice` only (`assertAdmin` unchanged for doctor / patient management).
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** Reloaded Settings repeatedly → schedules requested with the UUID (200) and real hours shown (10:00–14:00, 20 min). dr.solo saved advance ₹200 → DB 200 → reload shows 200 → cleared → DB `null`; schedule rows still Mon / Wed / Fri 10:00–14:00 / 20 min. Frontend + backend tsc clean.

### CR-20260928-12
- **Date opened:** 2026-09-28
- **Severity:** 3
- **Process:** P-BOOK / billing (WhatsApp + portals)
- **Description:** Requested: WhatsApp payment for an **advance booking amount**, plus **custom amount** requests sent by the doctor from the portal to the patient on WhatsApp (Razorpay), in all portals, and a **Payments** tab where the doctor sees payment status.
- **Evidence:** User request; only a consultation-fee prepay link per booking existed (CR-20260928-11).
- **Containment:** n/a.
- **Root cause:** No configurable advance amount, no way to request arbitrary amounts, no payment list.
- **Corrective action:** Additive migration `20260352000000_payment_requests` (`practices.advance_booking_amount`; `payment_requests` ledger with unique `link_id`, indexes, FKs; backfilled existing booking links) — applied to Supabase before backend deploy. `PaymentRequestService` (create custom link + WA `docline_payment_request`, resend, cancel, refresh, lazy expiry, list + summary, callback / webhook → `PAID` once + receipt `docline_payment_received`, booking fields synced only for matching prepay links). WA prepay uses the advance when set ("pay the advance booking amount (₹X)"), else the fee. Routes `/procto/payments/practice/:id`, `/requests`, `/requests/:id[/resend|/cancel]`; socket `payment_updated`. Settings: *Advance booking amount* in clinic + doctor forms. Web: `/doctor/payments` + `/clinic/payments` (sidebar + portal links), `PaymentRequestModal`, *Request payment* in the visit Payment status dialog. Provider app: **More → Payments** (list, status chips, request form, share / refresh / resend / cancel). Risk R19 added.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** 170/170 procto tests (new: advance vs fee offer, custom amount parse, link expiry clamp, phone normalisation, kind labels). Orchestrator smoke on a temp conversation + non-existent booking: re-prompt reads "pay the advance booking amount (₹300)", *No* → pay at clinic → document offer (conversation deleted). Browser (dr.solo): Payments page loads (summary, tabs, range, search), sidebar + portal link present, request modal validation ("Enter the amount…") and patient suggestions work — **no request sent** (live Razorpay key + real patients). Settings round-trip (see CR-20260928-13). Backend tsc + build, frontend tsc + build, provider tsc clean. **Open:** `docline_payment_request` / `docline_payment_received` need Meta approval per WABA for delivery outside the 24 h window; production Razorpay webhook needs `payment_link` events + `RAZORPAY_WEBHOOK_SECRET`.

### CR-20260928-11
- **Date opened:** 2026-09-28
- **Severity:** 3
- **Process:** P-BOOK / billing (WhatsApp booking)
- **Description:** Requested: on WhatsApp, ask the patient whether they want to **pay before the appointment**; *Yes* → send a Razorpay link for the consultation fee. Add a **Payment status** button on the appointment page.
- **Evidence:** User request; bookings had no payment fields and WA fee collection was deferred in `decisions.md`.
- **Containment:** n/a.
- **Root cause:** No per-appointment payment capability.
- **Corrective action:** Additive migration `20260351000000_booking_payment` (`payment_status`, `payment_amount`, `payment_link_id` (+ index), `payment_link_url`, `payment_id`, `paid_at`; applied to Supabase before backend deploy). `lib/razorpay.ts` Payment Links create / fetch / callback-signature verify. `BookingPaymentService` (create / reuse link, decline, apply state, refresh, callback, webhook). WA step `awaiting_pay_offer` after booking confirmation (skipped with no fee or no Razorpay keys) → then the existing document offer. `GET /procto/payments/razorpay/callback` (HTML result page), `payment_link.*` in the Razorpay webhook, `GET /procto/bookings/:id/payment[?refresh=1]`. Socket + list carry payment fields. UI: `PaymentStatusButton` pill + dialog in the Appointments table (desktop + mobile) and visit header. Risk R18 added.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** New `bookingPayment.test.ts` (amount, expiry clamp, status mapping, staff view, signature accept / reject) — 162/162 pass. Razorpay test-mode link created, fetched and cancelled via the API (request shape confirmed). Forged callback signature → 400, no booking change. Orchestrator smoke on a temp conversation with a non-existent booking ID: unclear reply re-prompts Yes/No; *No* → "pay at the clinic" → document offer; *Yes* with link failure → graceful fallback → document offer (conversation deleted; no real booking touched). Browser (dr.solo): Appointments *Payment* column shows *Not requested*; dialog shows ₹700 clinic fee + Refresh; visit header pill present. Backend + frontend tsc + builds clean. **Open:** production webhook needs `payment_link` events enabled in the Razorpay dashboard + `RAZORPAY_WEBHOOK_SECRET` (callback + Refresh work without it); production key mode (test / live) unverified.

### CR-20260928-10
- **Date opened:** 2026-09-28
- **Severity:** 3
- **Process:** P-BOOK (queue / visit)
- **Description:** Requested: patient **Arrival time** in the appointment tables and on the visit (inner) page. No arrival timestamp existed — only status.
- **Evidence:** User request; `PracticeBooking` had no arrival field.
- **Containment:** n/a.
- **Root cause:** Status changes were not time-stamped.
- **Corrective action:** Additive migration `20260350000000_booking_arrived_at` (`arrived_at TIMESTAMPTZ NULL`, applied to Supabase before backend deploy). `arrivalPatch` stamps on first move to WAITING / IN_PROGRESS / COMPLETED in `updateStatus` and `updateVisit`, clears on revert to SCHEDULED / REQUESTED / ACCEPTED or NO_SHOW; walk-ins stamped at creation. `listForPractice` selects it; socket `arrived_at`; `patchBookingFields` merges it; lists patch it from the status response. UI: *Arrival* column (Appointments + Queue), mobile "Arrived:" line, visit header *Arrival …*.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** 5 new `arrivalPatch` unit tests (152/152 pass). Column present in DB (`information_schema`); local API list returns `arrivedAt` on all 7 rows. Browser (dr.solo): Appointments headers "When · Arrival · Chief complaint", Queue headers "Appointment · Arrival · Name", visit header "Arrival not yet" (Accepted) / "Arrival —" (Finished, pre-change). No real booking status changed for the test. Backend + frontend tsc clean.

### CR-20260928-09
- **Date opened:** 2026-09-28
- **Severity:** 3
- **Process:** P-BOOK (clinic-side manual booking)
- **Description:** No way to add a patient who walks in with an emergency — the Appointments page had no manual-booking button in the doctor portal, and the clinic modal requires a free slot. Requested: button on the Appointments page; no time-slot question, just an emergency walk-in.
- **Evidence:** User request; `DoctorAppointmentsList` rendered *Book appointment* only for `portal="clinic"`; `ClinicBookAppointmentModal` blocks without an open slot.
- **Containment:** n/a.
- **Root cause:** Only slot/token-based booking existed; no desk-emergency path.
- **Corrective action:** New `BookingService.createWalkIn` + `POST /procto/bookings/walk-in` (`booking:update`, active membership, DOCTOR only for self, quota enforced) → booking at now in `WAITING`, `consultationType = EMERGENCY_WALK_IN`, no patient template. Appointments page (both portals): red **Emergency walk-in** button + modal (doctor, name, mobile, optional chief complaint) and **Book appointment** for everyone; after adding, list jumps to Today. Red *Walk-in* badge in Appointments / Queue / visit page; `consultationTypeLabel` shows "Emergency walk-in" instead of the raw code (web, provider app, patient app). Risk R17 added.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** API (local :3002, dr.solo): bad phone → 400, blank name → 400, foreign practice → 403, doctor → other provider → 403 "only to their own list", no auth → 401 (no booking created). Browser: header shows *Emergency walk-in* + *Book appointment*; modal has no slot picker, fixed doctor for solo, empty submit → "Enter the patient name." Backend tests 147/147; backend, frontend, provider, patient-app tsc clean.

### CR-20260928-08
- **Date opened:** 2026-09-28
- **Severity:** 3
- **Process:** P-BOOK (visit page documents); P-AUTH (patient record access)
- **Description:** Doctors could not find a patient's *General* documents from the appointment page — only visit files were shown; general files were only behind the Patients-tab paperclip. Requested: *General* and *Appointment* document options on the visit page.
- **Evidence:** User report; visit page rendered `booking.documents` only.
- **Containment:** n/a.
- **Root cause:** No API exposed `Patient.documents` per booking for the visit page.
- **Corrective action:** Visit page Documents → tabs *Appointment (n)* / *General (n)*; General lists + uploads to `Patient.documents` via new `GET/POST /procto/bookings/:id/general-documents`. Access: view requires `assertCanViewBooking`; add requires active membership and own visit unless owner/admin. Patient resolved from `booking.patientId` or a single phone match only (no guessing on shared numbers). Finish still only from the visit page (list controls stop at *Appointment started*).
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** Browser (dr.solo): Roopa visit → Appointment (1) / General (0) "No general documents yet"; Satheesh visit → Appointment (3) / General (1) lists WhatsApp general doc "Logo myplex.png" with date. Backend + frontend + provider tsc.
- **Status:** Verified (local)
- **Docs updated:** `documentation/flow.md`

### CR-20260928-07
- **Date opened:** 2026-09-28
- **Severity:** 3
- **Process:** P-BOOK (WhatsApp Branch F — attach document)
- **Description:** Clinic could not find the *Select Appointment / General Document* choice: it only appeared after a file was uploaded, never after post-booking *Yes* (auto-attached to the new visit) and never with no upcoming visits. Requested: ask the choice before asking for the document.
- **Evidence:** User report; code path `startReportAttachFlow` → `awaiting_document_upload`; post-booking Yes set `lastBookingId` → `attach_preferred`.
- **Containment:** n/a (behaviour change).
- **Root cause:** Upload-first design of Branch F.
- **Corrective action:** Menu → Attach and post-booking *Yes* now go to `awaiting_document_link` with no file: buttons first. *General* → (shared number) patient pick → `docTarget: "general"` + `docPatientUserId` → upload saved to that record only (`receiveWhatsAppBranchFDocument({ general })` skips visit lookup; patient id re-validated). *Select Appointment* → visit (list if 2+) → upload prompt names the visit. *No* before upload cancels.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** Smoke on temp conversation (no uploads): attach → buttons; General → picker → "saved to *Rathul Satheesh*'s record"; reminder keeps General prompt; No → cancelled + state cleared; Select Appointment → visit prompt with label; post-booking Yes → buttons. Backend tsc; 147/147 procto tests.
- **Status:** Verified (local)
- **Docs updated:** `documentation/flow.md`, `documentation/decisions.md`

### CR-20260928-06
- **Date opened:** 2026-09-28
- **Severity:** 2 (includes a booking-safety defect found during the change)
- **Process:** P-BOOK (WhatsApp booking flow; Queue / Appointments UI)
- **Description:** (a) Ask *"Add chief complaint? Yes / No"* before collecting it; (b) show the chief complaint in its own column on the Queue and Appointments tables and on the visit page. **Defect found in testing:** a stale `complaint:yes` button tap arriving at `awaiting_confirm` was classified by NLU as `confirm_yes` and called `confirmBooking` — a booking could be created without the patient pressing *Confirm*.
- **Evidence:** Local smoke (`runOrchestrator`, temp conversation, date with no schedule) returned "no schedule configured" from `confirmBooking` after a `complaint:yes` tap; no booking created (count 7 → 7).
- **Containment:** Not deployed; found before release.
- **Root cause:** `awaiting_confirm` fell through to NLU for any non-`confirm:*` payload; affirmative button IDs mapped to `confirm_yes`.
- **Corrective action:** New step `awaiting_chief_complaint_opt` (Yes / No buttons; direct 2+ word complaint accepted; vague replies re-asked). At `awaiting_confirm`, any interactive payload that is not `confirm:*` re-shows the Confirm card and never books. Shared `chiefComplaintOf` + `ChiefComplaintCell`; "Chief complaint" column after *Name* (Queue) and after *When* (Appointments); line on mobile cards.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** Smoke: Yes → complaint prompt → saved; No → summary without complaint; direct complaint at opt step → saved; stale `complaint:no` at confirm → Confirm card re-shown, no booking (7 → 7). Browser (dr.solo, 1440 px): Queue headers `… Name | Chief complaint | MRN …`, Appointments `… When | Chief complaint | Status …`. Backend tsc, frontend tsc, 145/145 procto tests.
- **Status:** Verified (local)
- **Docs updated:** `documentation/flow.md` (book flow + chief complaint paragraph)

### NC-20260928-05
- **Date opened:** 2026-09-28
- **Severity:** 2
- **Process:** P-BOOK (Appointments page ← WhatsApp bookings)
- **Description:** WhatsApp bot bookings "not showing" on the Appointments page. Page defaults to *Today* (range fetched from backend); a WA booking for a later date (Roopa Satheesh, booked 00:12 IST for 30 Sep) was invisible with no hint, and a booking made while the page was open never appeared (no refetch on socket events).
- **Evidence:** DB has the booking (`WHATSAPP_AI`, ACCEPTED); `listForPractice` returns it for 28 Sep–4 Oct but not for today-only; production commit `27bfbde` has no refetch on `bookingTick`.
- **Containment:** Use *This week* / *Custom* filter until deploy.
- **Root cause:** Range-only fetch (introduced with date filters) dropped the live-update path and gave no signal that future bookings exist outside *Today*.
- **Corrective action:** Refetch the selected range on `booking_created/updated` socket ticks (debounced), on tab focus, and every 60 s when the socket is down; *Upcoming* preset (today → +90 days); on *Today*, "N more upcoming appointment(s) after today · View upcoming".
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** Browser (dr.solo): Today → Rathul 10:40 + "1 more upcoming… View upcoming"; Upcoming → Rathul + Roopa (30 Sep); This week → both. Backend `listForPractice` checked with TZ=UTC (Railway) for today/week/month. Frontend tsc.
- **Status:** Verified (local)
- **Docs updated:** capa-log

### CR-20260928-04 (change request — booking flow)
- **Date opened:** 2026-09-28
- **Process:** P-BOOK (WhatsApp booking)
- **Change:** Ask the patient's chief complaint (typed or voice note, *Skip* allowed) after slot/token selection and before the booking summary; save to `practice_bookings.disease`; show on doctor queue + visit page.
- **Risk review:** No clinical advice sent (collects patient words only); complaint text bypasses NLU; outbound-guard trigger words are not echoed ("Noted ✓") so the summary is never replaced; bare "ok/yes" re-asked. Tenant/booking engine unchanged (single `BookingService.createBooking`).
- **Verification:** DB smoke on temp conversation (slot tap → prompt + Skip; "ok" → re-ask; voice transcript → summary line; "need diagnosis…" → "Noted ✓"; Skip → no line; bookings 7 → 7, temp conv deleted); `whatsapp.chiefComplaint.test.ts`; tsc backend + frontend; 144/144 procto tests.
- **Status:** Verified (local; not deployed)
- **Docs updated:** flow.md, capa-log

### NC-20260928-03
- **Date opened:** 2026-09-28
- **Severity:** 3
- **Process:** P-BOOK (WhatsApp booking confirmation → attach document)
- **Description:** After booking, the Yes/No "attach document" card showed only "Tap *Yes* or *No* below." — the question ("Would you like to send a report or document to your doctor?") was missing; the .ics file arrived after the card, burying it.
- **Evidence:** Patient report 2026-09-28; `processInbound` long-confirm path built the button body from `reply.split("\n\n").slice(-1)`, and `askAttachDocument` is two paragraphs.
- **Containment:** N/A (full text was in the preceding message; Yes/No still worked).
- **Root cause:** Card body derived by guessing the last paragraph of a combined reply instead of an explicit prompt.
- **Corrective action:** `OrchestratorResult.buttonPrompt` carries the attach question; `splitReplyForButtonCard` sends confirmation (without the question) → .ics → card with the full question + Yes / No / Main Menu. `.ics` sent once via `sendIcsOnce`.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** `whatsapp.confirmCard.test.ts` (EN + HI full question on card, fallback); tsc; 140/140 procto tests.
- **Status:** Verified
- **Docs updated:** capa-log

### NC-20260928-02
- **Date opened:** 2026-09-28
- **Severity:** 3
- **Process:** P-BOOK (Practice Patients roster)
- **Description:** Patients tab listed only people with a booking; patients who registered (WhatsApp self/family, or with the practice MRN prefix) but had not booked yet were invisible to the clinic.
- **Evidence:** `PracticeService.listPatients` built rows only from `practiceBooking`; profile "123" (MR00000004, registered via WhatsApp 2026-09-25, no bookings) missing on both practices whose lines it messaged.
- **Containment:** N/A (data intact; list-only gap).
- **Root cause:** Roster derived from bookings; there is no patient→practice link other than practice MRN prefix and WhatsApp conversation phone.
- **Corrective action:** `listRegisteredWithoutBookings` adds profiles whose MRN starts with `{practice.mrnPrefix}MR` or whose phone/contact number matches a WhatsApp conversation on this practice (last 10 digits), deduped against booked rows by patientId and phone+name. Shown to clinic owners/admins and solo doctors; clinic staff doctors keep booking-scoped lists. UI shows a "Registered" badge, 0 visits, and registration date.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** DB run: Dr. Priya Nair Clinic (solo) 6 rows incl. "123" (0 visits); Dr. Ananya Sharma Clinic owner 3 rows incl. "123", staff doctor 0 registered-only rows; no duplicates for booked profiles. Browser check as dr.solo: "Registered" badge + Phone/Registered details. tsc (backend + frontend), 137/137 procto tests.
- **Status:** Verified
- **Docs updated:** capa-log

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
