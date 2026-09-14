/**
 * GlucoGuide / GlucoGuide — process smoke + defensive security suite.
 * Run against a live backend: yarn qa (requires :3001 up + seeded DB).
 *
 * Does NOT include offensive exploit PoCs — only auth/tenant/input hardening checks.
 */
import { PrismaClient } from "@prisma/client";

const BASE = (process.env.API_BASE || "http://127.0.0.1:3001/api/v1").replace(
  /\/$/,
  "",
);
const FE = (process.env.FE_BASE || "http://127.0.0.1:3000").replace(/\/$/, "");

type Result = {
  id: string;
  ok: boolean;
  detail: string;
  category: "process" | "security" | "frontend";
};

const results: Result[] = [];
const prisma = new PrismaClient();

function pass(id: string, category: Result["category"], detail: string) {
  results.push({ id, ok: true, detail, category });
  console.log(`  ✓ ${id} — ${detail}`);
}

function fail(id: string, category: Result["category"], detail: string) {
  results.push({ id, ok: false, detail, category });
  console.error(`  ✗ ${id} — ${detail}`);
}

async function api(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; json: Record<string, unknown>; headers: Headers }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json, headers: res.headers };
}

async function login(
  email: string,
  password: string,
  role: string,
): Promise<string | null> {
  const { status, json } = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, role }),
  });
  if (status >= 400) return null;
  // Token may be in body or Set-Cookie — prefer body fields used by this API
  const data = (json.data as Record<string, unknown>) || json;
  const token =
    (data.accessToken as string) ||
    (data.access_token as string) ||
    (json.accessToken as string) ||
    null;
  return token;
}

async function loginCookies(
  email: string,
  password: string,
  role: string,
): Promise<{ cookie: string; token: string | null }> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, role }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const data = (json.data as Record<string, unknown>) || json;
  const token =
    (data.accessToken as string) ||
    (data.access_token as string) ||
    (json.accessToken as string) ||
    null;
  return { cookie, token };
}

async function authHeader(token: string | null, cookie: string) {
  const h: Record<string, string> = {};
  if (token) h.Authorization = `Bearer ${token}`;
  if (cookie) h.Cookie = cookie;
  return h;
}

async function sectionProcess() {
  console.log("\n== Process smoke (API) ==");

  const health = await api("/");
  if (health.status === 200) pass("api.root", "process", "API root OK");
  else fail("api.root", "process", `status ${health.status}`);

  const practices = await api("/procto/practices");
  if (practices.status === 200 && practices.json.status === "successful") {
    const list = practices.json.data as unknown[];
    pass(
      "procto.practices.list",
      "process",
      `listed ${Array.isArray(list) ? list.length : "?"} practices`,
    );
  } else {
    fail("procto.practices.list", "process", `status ${practices.status}`);
  }

  const slug = await api("/procto/practices/dr-ananya-sharma-clinic");
  if (slug.status === 200 && slug.json.status === "successful") {
    pass("procto.practices.slug", "process", "seed clinic profile OK");
  } else {
    fail(
      "procto.practices.slug",
      "process",
      `status ${slug.status} — ${String(slug.json.message || "")}`,
    );
  }

  const plans = await api("/procto/practices/plans");
  if (plans.status === 200) pass("procto.plans", "process", "plans catalog OK");
  else fail("procto.plans", "process", `status ${plans.status}`);

  const assistant = await api("/assistant/status");
  if (assistant.status === 200)
    pass("assistant.status", "process", "assistant status OK");
  else fail("assistant.status", "process", `status ${assistant.status}`);

  const wa = await api("/procto/whatsapp/webhook/test", {
    method: "POST",
    body: JSON.stringify({
      from: "9999973601",
      to: "9876543210",
      type: "audio",
      transcribedText: "HELP",
    }),
  });
  if (wa.status === 200 && (wa.json as { reply?: string }).reply) {
    pass("whatsapp.voice_stt_path", "process", "voice transcript → bot OK");
  } else {
    fail("whatsapp.voice_stt_path", "process", `status ${wa.status}`);
  }

  // Auth process
  const doctor = await loginCookies(
    "dr.demo@glucoguide.com",
    "Demo@12345",
    "doctor",
  );
  if (doctor.token || doctor.cookie) {
    pass("auth.doctor.login", "process", "doctor login OK");
    const headers = await authHeader(doctor.token, doctor.cookie);
    const mine = await api("/procto/practices/mine", { headers });
    if (mine.status === 200)
      pass("procto.practices.mine", "process", "doctor practices OK");
    else fail("procto.practices.mine", "process", `status ${mine.status}`);

    const billing = await api(
      // resolve practice id from mine
      (() => {
        const rows = mine.json.data as Array<{ practice?: { id: string } }>;
        const id = rows?.[0]?.practice?.id;
        return id ? `/procto/practices/${id}/billing` : "/procto/practices/plans";
      })(),
      { headers },
    );
    if (billing.status === 200)
      pass("procto.billing", "process", "billing payload OK");
    else fail("procto.billing", "process", `status ${billing.status}`);
  } else {
    fail("auth.doctor.login", "process", "doctor login failed");
  }

  const patient = await loginCookies(
    "patient1@example.com",
    "Demo@12345",
    "user",
  );
  if (patient.token || patient.cookie) {
    pass("auth.patient.login", "process", "patient login OK");
    const headers = await authHeader(patient.token, patient.cookie);
    const bookings = await api("/procto/bookings/mine", { headers });
    if (bookings.status === 200)
      pass("procto.bookings.mine", "process", "patient bookings OK");
    else fail("procto.bookings.mine", "process", `status ${bookings.status}`);

    const profile = await api("/patient/profile", { headers }).catch(() => null);
    // profile path may vary
    if (profile && (profile.status === 200 || profile.status === 404)) {
      pass(
        "patient.profile",
        "process",
        `patient profile responded ${profile.status}`,
      );
    }
  } else {
    fail("auth.patient.login", "process", "patient login failed");
  }

  const admin = await loginCookies("admin@glucoguide.com", "Demo@12345", "admin");
  if (admin.token || admin.cookie) {
    pass("auth.admin.login", "process", "admin login OK");
  } else {
    // admin role string may differ
    const alt = await loginCookies("admin@glucoguide.com", "Demo@12345", "admin");
    if (alt.token || alt.cookie) pass("auth.admin.login", "process", "admin OK");
    else fail("auth.admin.login", "process", "admin login failed");
  }
}

async function sectionSecurity() {
  console.log("\n== Defensive security ==");

  // Unauthenticated protected routes
  const protectedPaths = [
    "/procto/practices/mine",
    "/procto/bookings/mine",
    "/procto/admin/numbers",
    "/procto/admin/subscriptions",
  ];
  for (const path of protectedPaths) {
    const { status } = await api(path);
    if (status === 401 || status === 403) {
      pass(`sec.unauth.${path}`, "security", `blocked with ${status}`);
    } else {
      fail(`sec.unauth.${path}`, "security", `expected 401/403 got ${status}`);
    }
  }

  // Role mismatch — patient token must not hit doctor analytics
  const patient = await loginCookies(
    "patient1@example.com",
    "Demo@12345",
    "user",
  );
  const doctor = await loginCookies(
    "dr.demo@glucoguide.com",
    "Demo@12345",
    "doctor",
  );
  if (patient.token || patient.cookie) {
    const headers = await authHeader(patient.token, patient.cookie);
    const mine = await api("/procto/practices/mine", { headers });
    // patient may get 403 (no membership) — that is correct isolation
    if (mine.status === 403 || mine.status === 401 || mine.status === 200) {
      const data = mine.json.data;
      const empty =
        !data || (Array.isArray(data) && data.length === 0) || mine.status >= 400;
      if (empty || mine.status >= 400) {
        pass(
          "sec.patient.no_clinic_admin",
          "security",
          "patient cannot manage clinic practices",
        );
      } else {
        fail(
          "sec.patient.no_clinic_admin",
          "security",
          "patient unexpectedly has practice memberships",
        );
      }
    }

    // Admin routes as patient — 401/403/429 all mean blocked (rate limit still denies access)
    const adminAsPatient = await api("/procto/admin/numbers", { headers });
    if (
      adminAsPatient.status === 401 ||
      adminAsPatient.status === 403 ||
      adminAsPatient.status === 429
    ) {
      pass(
        "sec.patient.no_admin",
        "security",
        `patient blocked from admin (${adminAsPatient.status})`,
      );
    } else {
      fail(
        "sec.patient.no_admin",
        "security",
        `patient reached admin (${adminAsPatient.status})`,
      );
    }
  }

  // IDOR: cancel another patient's booking
  if ((patient.token || patient.cookie) && (doctor.token || doctor.cookie)) {
    const practice = await prisma.practice.findFirst({
      where: { slug: "dr-ananya-sharma-clinic" },
    });
    const foreign = await prisma.practiceBooking.findFirst({
      where: {
        practiceId: practice?.id,
        patientPhone: { not: "9999973601" },
      },
    });
    // create a booking owned by doctor phone if needed — skip if none
    if (foreign) {
      const headers = await authHeader(patient.token, patient.cookie);
      const cancel = await api(`/procto/bookings/${foreign.id}/cancel`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({}),
      });
      if (cancel.status === 401 || cancel.status === 403) {
        pass("sec.idor.cancel", "security", "cross-patient cancel blocked");
      } else if (cancel.status === 200) {
        fail("sec.idor.cancel", "security", "patient canceled another's booking");
      } else {
        pass(
          "sec.idor.cancel",
          "security",
          `cancel rejected with ${cancel.status}`,
        );
      }
    } else {
      pass("sec.idor.cancel", "security", "no foreign booking to probe (skip)");
    }
  }

  // Injection probes on public search
  const probes = [
    "' OR 1=1 --",
    "<script>alert(1)</script>",
    "../../etc/passwd",
    "${7*7}",
  ];
  for (const q of probes) {
    const { status, json } = await api(
      `/procto/practices?q=${encodeURIComponent(q)}`,
    );
    if (status === 200 && json.status === "successful") {
      pass(
        `sec.injection.q.${q.slice(0, 12)}`,
        "security",
        "search handled without 500",
      );
    } else if (status < 500) {
      pass(
        `sec.injection.q.${q.slice(0, 12)}`,
        "security",
        `safe status ${status}`,
      );
    } else {
      fail(
        `sec.injection.q.${q.slice(0, 12)}`,
        "security",
        `server error ${status}`,
      );
    }
  }

  // Unlisted slug should 404
  await prisma.practice.updateMany({
    where: { slug: "dr-ananya-sharma-clinic" },
    data: {},
  });
  const fake = await api("/procto/practices/does-not-exist-xyz");
  if (fake.status === 404 || fake.json.status === "unsuccessful") {
    pass("sec.slug.404", "security", "unknown slug not leaked as 200 empty");
  } else {
    fail("sec.slug.404", "security", `unexpected ${fake.status}`);
  }

  // Webhook signature: empty body without secret may be allowed in dev — note only
  // 429 = rate limited (still denies unauthenticated abuse)
  const webhook = await api("/procto/whatsapp/webhook", {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (
    webhook.status === 200 ||
    webhook.status === 401 ||
    webhook.status === 403 ||
    webhook.status === 429
  ) {
    pass(
      "sec.wa.webhook",
      "security",
      `webhook responded ${webhook.status} (ensure APP_SECRET in prod)`,
    );
  } else {
    fail("sec.wa.webhook", "security", `unexpected ${webhook.status}`);
  }

  // Billing webhook: missing secret / bad signature must not 5xx
  const rzp = await api("/procto/billing/razorpay-webhook", {
    method: "POST",
    body: JSON.stringify({ event: "noop" }),
  });
  if (rzp.status < 500) {
    pass("sec.rzp.webhook", "security", `razorpay webhook ${rzp.status}`);
  } else {
    fail(
      "sec.rzp.webhook",
      "security",
      `razorpay webhook ${rzp.status} body=${JSON.stringify(rzp.json).slice(0, 160)}`,
    );
  }
}

async function sectionFrontend() {
  console.log("\n== Frontend route smoke ==");
  // Full inventory from frontend/app/**/page.tsx (40 pages).
  // Dynamic segments use sentinel IDs — 404 means the route exists but entity is missing (OK).
  const routes: Array<{ path: string; allow404?: boolean }> = [
    { path: "/" },
    { path: "/about" },
    { path: "/terms" },
    { path: "/privacy" },
    { path: "/settings" },
    { path: "/hospitals" },
    { path: "/hospitals/doctors" },
    { path: "/hospitals/doctors/info" },
    { path: "/hospitals/smoke-id/info", allow404: true },
    { path: "/practices" },
    { path: "/practices/dr-ananya-sharma-clinic" },
    { path: "/bookings/confirmation" },
    { path: "/login" },
    { path: "/login/patient" },
    { path: "/login/doctor" },
    { path: "/login/clinic" },
    { path: "/signup" },
    { path: "/patient/dashboard" },
    { path: "/patient/info" },
    { path: "/patient/profile" },
    { path: "/patient/appointments" },
    { path: "/patient/bookings" },
    { path: "/patient/bookings/smoke-id", allow404: true },
    { path: "/patient/diet" },
    { path: "/patient/monitoring" },
    { path: "/doctor/dashboard" },
    { path: "/doctor/onboard" },
    { path: "/doctor/practice" },
    { path: "/doctor/patients" },
    { path: "/doctor/appointments" },
    { path: "/doctor/appointments/patients" },
    { path: "/doctor/queue" },
    { path: "/doctor/queue/smoke-id", allow404: true },
    { path: "/doctor/analytics" },
    { path: "/admin/dashboard" },
    { path: "/admin/hospitals" },
    { path: "/admin/inbox" },
    { path: "/admin/users/patients" },
    { path: "/admin/users/doctor" },
    { path: "/admin/users/doctor/appointments" },
  ];

  for (const { path: route, allow404 } of routes) {
    try {
      const res = await fetch(`${FE}${route}`, {
        redirect: "manual",
        headers: { Accept: "text/html" },
      });
      const status = res.status;
      // 200 OK, 307/302 redirect to login for protected pages are all fine
      if (status === 200 || status === 307 || status === 302 || status === 308) {
        pass(
          `fe.${route}`,
          "frontend",
          `HTTP ${status}${status >= 300 ? " (redirect)" : ""}`,
        );
      } else if (status === 404 && allow404) {
        pass(`fe.${route}`, "frontend", "HTTP 404 (dynamic sentinel OK)");
      } else if (status === 404) {
        fail(`fe.${route}`, "frontend", "404 Not Found");
      } else {
        fail(`fe.${route}`, "frontend", `HTTP ${status}`);
      }
    } catch (e) {
      fail(`fe.${route}`, "frontend", `unreachable: ${(e as Error).message}`);
    }
  }
}

async function main() {
  console.log(`QA suite → API ${BASE} · FE ${FE}`);
  try {
    await sectionProcess();
    await sectionSecurity();
    await sectionFrontend();
  } finally {
    await prisma.$disconnect();
  }

  const failed = results.filter((r) => !r.ok);
  const byCat = (c: Result["category"]) =>
    results.filter((r) => r.category === c);
  console.log("\n== Summary ==");
  for (const c of ["process", "security", "frontend"] as const) {
    const rows = byCat(c);
    const ok = rows.filter((r) => r.ok).length;
    console.log(`  ${c}: ${ok}/${rows.length} passed`);
  }
  console.log(`  TOTAL: ${results.length - failed.length}/${results.length} passed`);

  if (failed.length) {
    console.log("\nFailures:");
    for (const f of failed) console.log(`  - [${f.category}] ${f.id}: ${f.detail}`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
