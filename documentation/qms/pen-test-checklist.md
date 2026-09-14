# Defensive security checklist (GlucoGuide)

Scope: auth, tenant isolation, IDOR, injection hardening, webhook gates.  
**Out of scope:** offensive exploit PoCs, credential cracking, destructive attacks.

Automated probes: `yarn qa` (security section). Manual checks below for release.

## 1. Authentication & session

| # | Check | Pass? |
|---|-------|-------|
| 1.1 | Unauthenticated `GET /procto/practices/mine` → 401/403 | |
| 1.2 | Unauthenticated `GET /procto/bookings/mine` → 401/403 | |
| 1.3 | Unauthenticated admin number/subscription routes → 401/403 | |
| 1.4 | Logout clears session; protected FE pages redirect | |

## 2. Role & tenant isolation

| # | Check | Pass? |
|---|-------|-------|
| 2.1 | Patient token cannot list/manage clinic practices | |
| 2.2 | Patient token blocked from `/procto/admin/*` | |
| 2.3 | Doctor A cannot mutate Doctor B practice (cross-tenant) | |
| 2.4 | Patient cannot cancel another patient's booking (IDOR) | |

## 3. Input hardening

| # | Check | Pass? |
|---|-------|-------|
| 3.1 | Public search `q` with SQL/XSS/path probes → no 500 | |
| 3.2 | Booking cancel `reason` truncated / sanitized (≤280) | |
| 3.3 | Unknown practice slug → 404 / unsuccessful (no data leak) | |

## 4. Webhooks & billing

| # | Check | Pass? |
|---|-------|-------|
| 4.1 | WhatsApp webhook without valid signature rejected in prod (`APP_SECRET`) | |
| 4.2 | Razorpay webhook verifies signature when secret set | |
| 4.3 | No passwords or PHI in WhatsApp UTILITY templates | |

## 5. Transport & cookies (manual / staging)

| # | Check | Pass? |
|---|-------|-------|
| 5.1 | HTTPS only in production; Secure + HttpOnly cookies | |
| 5.2 | CORS allows only known FE origins | |

Findings → [records/qa-findings.md](./records/qa-findings.md). Sev-1 → CAPA.

Sign-off: _____________ Date: _____________
