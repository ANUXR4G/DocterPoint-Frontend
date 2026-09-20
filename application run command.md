# Application run commands (local + tunnel)

Use **separate terminals** for each process. Run everything from the repo root unless noted.

> **Ports:** Web UI `:3000` · API default `:3001` (this machine often uses `:3002` if Fabrigenie holds `:3001`) · Patient Expo `:8081` · Doctor Expo `:8082`.

---

## 1. Backend API

```bash
cd backend
yarn install
yarn run dev
```

If port `3001` is busy:

```bash
cd backend
PORT=3002 yarn run dev
```

Health check:

```bash
curl http://127.0.0.1:3001/health
# or
curl http://127.0.0.1:3002/health
```

Point the web proxy at the same port in `frontend/.env` / `frontend/.env.local`:

```bash
BACKEND_URL=http://127.0.0.1:3002
```

---

## 2. Frontend (web)

```bash
cd frontend
yarn install
yarn run dev
```

Open: [http://localhost:3000](http://localhost:3000)

---

## 3. Patient app — Expo tunnel

Physical phone (QR) via Expo tunnel:

```bash
# from repo root
npm run dev:mobile:tunnel
```

Or:

```bash
cd apps/mobile
npx expo start --tunnel -c
```

Set API for the device in `apps/mobile/.env` (tunnel cannot reach `localhost`):

```bash
# Production API (simplest with tunnel)
EXPO_PUBLIC_API_URL=https://docterpoint-backend-production.up.railway.app

# Or your Mac LAN IP when using --lan instead of --tunnel
# EXPO_PUBLIC_API_URL=http://192.168.x.x:3002
```

---

## 4. Doctor / clinic app — Expo tunnel

```bash
cd apps/provider
npx expo start --tunnel -c --port 8082
```

Set API in `apps/provider/.env`:

```bash
EXPO_PUBLIC_API_URL=https://docterpoint-backend-production.up.railway.app
# EXPO_PUBLIC_API_URL=http://192.168.x.x:3002
EXPO_PUBLIC_WEB_URL=http://localhost:3000
```

From root (no tunnel flag in package.json by default):

```bash
npm run start -w @glucoguide/provider -- --tunnel -c
```

---

## 5. Optional — tunnel the local API (ngrok)

So a phone on Expo tunnel can hit **your local** backend instead of Railway:

```bash
# API must already be running on 3001 or 3002
npx ngrok http 3002
```

Copy the `https://….ngrok-free.app` URL into Expo:

```bash
EXPO_PUBLIC_API_URL=https://YOUR-SUBDOMAIN.ngrok-free.app
```

Restart Expo after changing `.env` (`-c` clears cache).

Meta WhatsApp webhook (local test) can use the same HTTPS URL:

```text
https://YOUR-SUBDOMAIN.ngrok-free.app/api/v1/procto/whatsapp/webhook
```

---

## 6. Typical full stack (4 terminals)

| Terminal | Command |
|----------|---------|
| 1 · API | `cd backend && PORT=3002 yarn run dev` |
| 2 · Web | `cd frontend && yarn run dev` |
| 3 · Patient | `npm run dev:mobile:tunnel` |
| 4 · Doctor | `cd apps/provider && npx expo start --tunnel -c --port 8082` |

---

## 7. Playwright E2E (web)

Requires API + web (Playwright can start both via `webServer`):

```bash
cd frontend
yarn test:e2e
```

Interactive UI mode:

```bash
cd frontend
yarn test:e2e:ui
```

HTML report:

```bash
cd frontend
yarn test:e2e:report
```

Default: Chromium against `http://127.0.0.1:3000` with API on `http://127.0.0.1:3002`.
Specs live in `frontend/e2e/` (public pages, admin/clinic/doctor login, patient OTP UI).

See [documentation/login.md](documentation/login.md).

| Role | Email | Password |
|------|--------|----------|
| Clinic owner | `dr.demo@glucoguide.com` | `Demo@12345` |
| Clinic staff | `dr.staff@glucoguide.com` | `Demo@12345` |
| Solo doctor | `dr.solo@glucoguide.com` | `Demo@12345` |
| Patient | phone OTP / `patient1@example.com` | `Demo@12345` |
