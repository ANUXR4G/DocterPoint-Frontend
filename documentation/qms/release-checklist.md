# Release checklist (ISO 9001 §8.5 / §9.1)

Complete before production deploy or “go-live” of a clinic WhatsApp number.  
Copy a dated row into `documentation/qms/records/release-log.md` when done.

Release id / date: _______________  
Git commit / tag: _______________  
Owner: _______________

## A. Build & verify

- [ ] `backend`: `yarn tsc --noEmit` passes  
- [ ] `frontend`: `npx tsc --noEmit` passes  
- [ ] Mobile / provider typecheck if Expo touched  
- [ ] Canonical API is **`backend` :3001** (not `apps/api` for GlucoGuide web/WA)  
- [ ] Smoke: doctor login (`login.md`) + `GET /procto/practices/mine`  
- [ ] Smoke: patient login + practices list / book path  
- [ ] Migrations applied; seed/demo data still coherent if required  

## B. Product / process

- [ ] Behaviour changes reflected in `decisions.md` and/or `flow.md`  
- [ ] No new cross-tenant data path without membership checks  
- [ ] Booking slot math unchanged or explicitly tested (availability + overrides)  

## C. WhatsApp / Meta (if messaging touched)

- [ ] Templates remain **UTILITY** only ([Whatsapp-Meta-Rules.md](../Whatsapp-Meta-Rules.md))  
- [ ] `POST .../admin/templates/sync-meta` run if catalog changed  
- [ ] Meta Manager shows required templates **APPROVED** before any number set LIVE  
- [ ] STOP opt-out still works; no passwords in WA copy  
- [ ] AI disclosure + clinical guardrails still present  

## D. Security & privacy

- [ ] No secrets committed (`.env` not staged)  
- [ ] Auth scopes / role portals still correct  
- [ ] Webhook signatures enabled where Meta/Razorpay live  

## E. Improvement

- [ ] Open Sev-1/2 CAPAs reviewed; none blocking this release without waiver  
- [ ] Waiver (if any) recorded in CAPA log with approver name  

**Sign-off:** _______________ (tech lead / product owner)
