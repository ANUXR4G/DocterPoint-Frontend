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
