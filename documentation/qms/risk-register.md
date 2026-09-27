# Risk register (ISO 9001 §6.1)

Update when architecture, Meta policy, or providers change.  
Score: **Impact** (1–5) × **Likelihood** (1–5). Treat ≥12 as needing active control.

| ID | Risk | Impact | Likelihood | Score | Control | Owner | Status |
|----|------|--------|------------|-------|---------|-------|--------|
| R01 | Meta WhatsApp ban / Low quality | 5 | 3 | 15 | Whatsapp-Meta-Rules; UTILITY templates; STOP; LIVE gate | Ops + Eng | Open |
| R02 | Cross-practice / cross-doctor data leak | 5 | 2 | 10 | Membership asserts; WS auth; **clinic staff forced to own `providerId` on bookings/patients/bootstrap/analytics**; roster redacted in `/practices/mine` | Eng | Open |
| R03 | Double-book / wrong slot | 5 | 2 | 10 | Single slot engine; override + booking indexes | Eng | Open |
| R04 | Wrong API (`apps/api` vs `backend`) | 4 | 3 | 12 | login.md + Expo apiUrl → :3001; decisions.md | Eng | Open |
| R05 | JWT expiry locks mobile users | 3 | 3 | 9 | Refresh-token retry in Expo `lib/api.ts` | Eng | Mitigated |
| R06 | Clinical advice via bot / LLM | 5 | 2 | 10 | `whatsapp.policy` guardrails; AI disclosure | Eng | Open |
| R07 | Secrets in repo / logs | 5 | 2 | 10 | `.gitignore`; no PII in console beyond need | Eng | Open |
| R08 | Payment webhook spoof | 4 | 2 | 8 | Signature verify; simulate only in admin | Eng | Open |
| R09 | Redis down breaks local booking | 2 | 4 | 8 | Queues optional / soft-fail; booking not hard-dependent | Eng | Mitigated |
| R10 | Unapproved templates sent in prod | 4 | 3 | 12 | Template-first send; DRAFT≠LIVE gate | Ops | Open |
| R11 | Shared platform WABA OTP rate limits / wrong-number claim | 4 | 3 | 12 | In-app OTP only for VERIFYING own Tel; Meta request_code rate limits; practice membership gate | Eng + Ops | Open |
| R12 | `QA_EXPOSE_OTP` leaks codes in non-prod API/UI | 3 | 2 | 6 | Env-gated; never set in production; Playwright webServer only | Eng | Mitigated |
| R13 | Supabase session pooler `EMAXCONNSESSION` under E2E/admin fan-out | 3 | 4 | 12 | Transaction pooler + Prisma `connection_limit`; workers=1 in Playwright | Eng | Open |
| R14 | Shared WA number: OTP login / bot "Self" resolves to a family dependent | 4 | 3 | 12 | `pickPrimaryPatientUser` (dependents with `relationship` never owner) in OTP verify, `findByPhone`, `listLinkedToWhatsApp` | Eng | Mitigated |
| R16 | Shared WA number: general document saved to the wrong family member's record | 4 | 3 | 12 | `awaiting_document_patient` picker when >1 linked profile; `patientUserId` must be in `listLinkedToWhatsApp` | Eng | Mitigated |
| R15 | Elapsed appointments offered / accepted for patient cancel or reschedule | 3 | 4 | 12 | `isBookingStillUpcoming` in `listForPatient({ upcomingOnly })` (DB filter), WA manage list, `cancelByPatient` / `reschedule` guards | Eng | Mitigated |
| R17 | Emergency walk-in bypasses slot capacity → abused as a back door for over-booking, or added by a non-member / patient | 3 | 2 | 6 | Separate `POST /procto/bookings/walk-in` (`booking:update` scope — patients lack it) + active membership; DOCTOR role only for own list; plan quota still enforced; starts `WAITING` now (never a future slot), tagged `EMERGENCY_WALK_IN` + red *Walk-in* badge so usage is visible | Eng | Mitigated |
| R18 | Appointment prepay marked *Paid* without money received (forged callback / replay), or payment attributed to the wrong booking | 4 | 2 | 8 | Callback verified with HMAC-SHA256 (`linkId\|refId\|status\|paymentId`, key secret, timing-safe) before any write; webhook uses the existing `RAZORPAY_WEBHOOK_SECRET` check; booking matched by stored `paymentLinkId` only; `PAID` applied once via guarded `updateMany`; *Refresh* re-fetches the link server-side; link URL shown to staff only while pending | Eng | Mitigated |
| R20 | Clinic-owned Razorpay keys: secret leaked (API response / logs / DB dump), wrong or test keys saved so patients can't pay (or "pay" in test mode), keys changed while links are pending, or one clinic's webhook updating another clinic's payments | 4 | 2 | 8 | Keys verified live before save; secrets AES-256-GCM encrypted, globally omitted from Prisma reads, never returned (last 4 only), never logged; panel shows *Test mode* warning; each link stores the key it was created with (callback / refresh / cancel use that key; unknown key → cancel 409 with dashboard hint); per-clinic webhook verified with that clinic's secret and scoped to its own `practiceId` + `keyId`; platform webhook ignores clinic-account links; owner / admin / solo doctor only | Eng | Mitigated |
| R19 | Custom payment request sent to the wrong patient / wrong amount, sent across tenants, or not delivered (template not yet approved) so the patient never sees it | 3 | 3 | 9 | Server-side amount parse (₹1 – ₹5,00,000, ≤ 2 decimals) + purpose required; membership + `booking:update`; staff doctors pinned to own `providerId`; booking must belong to the practice and be visible; patient picked from the practice list (patientId kept only if known in the practice); staff can **Cancel** a pending link (Razorpay cancel, 409 if already paid); WhatsApp delivery status + error stored and shown with Copy / Share / Resend; UTILITY template `docline_payment_request` must be approved per WABA for out-of-window delivery | Eng | Mitigated (template approval open) |

**Last reviewed:** 2026-09-28
