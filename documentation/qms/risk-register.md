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

**Last reviewed:** 2026-09-20
