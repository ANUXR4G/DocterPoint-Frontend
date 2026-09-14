# QA findings report

**Date:** 2026-08-27  
**Stack:** `frontend` `:3000` + `backend` `:3001`  
**Harness:** `yarn qa` → `backend/scripts/qa-suite.ts`  
**Checklists:** [process-test-checklist.md](../process-test-checklist.md), [pen-test-checklist.md](../pen-test-checklist.md)

## Automated summary

| Category | Result |
|----------|--------|
| Process smoke | **13/13** passed |
| Defensive security | **14/14** passed |
| Frontend route HTTP smoke | **40/40** passed (full `page.tsx` inventory) |
| **TOTAL** | **67/67** passed |

## Findings (this pass)

| ID | Sev | Area | Finding | Disposition |
|----|-----|------|---------|-------------|
| F1 | Sev-2 | Auth | `POST /auth/login` with `role: "admin"` was normalized to `user`, so admin portal login failed | **Fixed** — `normalizeAuthRole` accepts `admin` |
| F2 | Info | Rate limit | Rapid QA probes hit HTTP 429 on admin/webhook/search | Expected hardening; suite treats 429 as blocked for security probes |
| F3 | Info | IDOR cancel | No foreign booking in minimal seed to probe | Skip OK; create cross-patient booking in staging for full IDOR proof |

## Practo-genre features shipped this pass

- Find Care: fee max filter (≤ ₹500 / ₹1,000 / ₹2,000)
- Availability badge (`Available to book` when active schedules exist)
- Practice profile: Share profile (Web Share API / clipboard)
- My Bookings: optional cancel reason to clinic

## How to re-run

```bash
# terminals: backend :3001, frontend :3000, seeded DB
yarn qa
# or
npm run qa --prefix backend
```

## Residual risks / follow-ups

1. Manual walkthrough of process checklist A–E before LIVE.
2. Confirm WhatsApp `APP_SECRET` and Razorpay webhook signature enforced in production.
3. Staging IDOR cancel with two patients.
4. Expand FE smoke to assert page content (not only HTTP status) if needed.
5. Inventory gap closed for route *presence*: `yarn qa` now covers all 40 `frontend/app/**/page.tsx` routes (dynamic pages via sentinel IDs). Deep e2e (login→book→queue) and unit tests inside `backend/` remain optional next depth.
