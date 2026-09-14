/**
 * Manual full-page QA — every Next.js route + authenticated role shells.
 * Run: npx tsx scripts/manual-page-qa.ts
 */
import { readdirSync, statSync } from "fs";
import { join } from "path";

const FE = (process.env.FE_BASE || "http://127.0.0.1:3000").replace(/\/$/, "");
const API = (process.env.API_BASE || "http://127.0.0.1:3001/api/v1").replace(
  /\/$/,
  "",
);
const PW = "Demo@12345";

type Row = {
  id: string;
  ok: boolean;
  severity: "P0" | "P1" | "P2";
  detail: string;
};
const rows: Row[] = [];

function rec(
  id: string,
  ok: boolean,
  detail: string,
  severity: Row["severity"] = "P1",
) {
  rows.push({ id, ok, detail, severity });
  console.log(`${ok ? "✓" : "✗"} [${severity}] ${id}: ${detail}`);
}

function collectPageRoutes(appDir: string): string[] {
  const out: string[] = [];
  function walk(dir: string, urlBase: string) {
    for (const name of readdirSync(dir)) {
      if (name.startsWith("_") || name === "api") continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        const seg = name.startsWith("(") && name.endsWith(")") ? "" : `/${name}`;
        walk(full, urlBase + seg);
      } else if (name === "page.tsx" || name === "page.ts" || name === "page.jsx") {
        out.push(urlBase || "/");
      }
    }
  }
  walk(appDir, "");
  return [...new Set(out)].sort();
}

async function loginCookie(
  email: string,
  role: string,
): Promise<{ cookie: string; token: string | null }> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PW, role }),
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const token =
    (json.access_token as string) ||
    (json.token as string) ||
    ((json.data as Record<string, unknown>)?.accessToken as string) ||
    null;
  return { cookie, token };
}

async function fetchPage(
  path: string,
  cookie?: string,
): Promise<{
  status: number;
  location: string | null;
  text: string;
  finalUrl: string;
}> {
  const res = await fetch(`${FE}${path}`, {
    redirect: "manual",
    headers: cookie ? { Cookie: cookie } : {},
  });
  const location = res.headers.get("location");
  // Follow one redirect if same-origin for authenticated content checks
  if (
    (res.status === 307 || res.status === 308 || res.status === 302) &&
    location &&
    cookie
  ) {
    const next =
      location.startsWith("http")
        ? location
        : `${FE}${location.startsWith("/") ? location : `/${location}`}`;
    if (next.startsWith(FE)) {
      const res2 = await fetch(next, {
        redirect: "follow",
        headers: { Cookie: cookie },
      });
      const text = await res2.text();
      return {
        status: res2.status,
        location,
        text,
        finalUrl: res2.url,
      };
    }
  }
  const text = await res.text();
  return { status: res.status, location, text, finalUrl: `${FE}${path}` };
}

function pageIssues(html: string): string[] {
  const issues: string[] = [];
  const lower = html.toLowerCase();
  if (lower.includes("application error") || lower.includes("uncaught")) {
    issues.push("application_error");
  }
  if (lower.includes("internal server error") || html.includes("HTTP ERROR 500")) {
    issues.push("http_500_body");
  }
  if (/docterpoint/i.test(html) && !/docline_/i.test(html)) {
    issues.push("docterpoint_brand");
  }
  // User-facing DocLine (not meta template names in scripts)
  if (/\bDocLine\b/.test(html) && !/docline_/i.test(html)) {
    issues.push("docline_user_facing");
  }
  if (lower.includes("cannot read properties of undefined")) {
    issues.push("js_undefined");
  }
  if (lower.includes("__next_error__") || lower.includes("digest\":")) {
    // Next error overlay markers sometimes in RSC payload
    if (lower.includes("server components render") || lower.includes("page crashed")) {
      issues.push("next_crash");
    }
  }
  return issues;
}

async function main() {
  const appDir = join(
    process.cwd().endsWith("backend")
      ? join(process.cwd(), "../frontend/app")
      : join(process.cwd(), "frontend/app"),
  );
  // Prefer absolute known path
  const routesFromFs = collectPageRoutes(
    "/Users/anuragnanda/Documents/glucoguide/frontend/app",
  );

  // Replace dynamic segments with sentinels
  const routes = routesFromFs.map((r) =>
    r
      .replace(/\[slug\]/g, "qa-clinic-a")
      .replace(/\[bookingId\]/g, "smoke-booking-id")
      .replace(/\[id\]/g, "smoke-id"),
  );

  console.log(`\n== Page inventory: ${routes.length} routes ==\n`);

  // Public / unauth crawl
  console.log("-- Unauthenticated --");
  for (const path of routes) {
    const { status, location, text } = await fetchPage(path);
    const okRedirect =
      status === 307 || status === 308 || status === 302 || status === 301;
    const ok = status === 200 || okRedirect || status === 404;
    const issues = status === 200 ? pageIssues(text) : [];
    const sev: Row["severity"] =
      status >= 500 || issues.includes("application_error") ? "P0" : "P2";
    rec(
      `fe.anon${path}`,
      ok && issues.length === 0,
      `HTTP ${status}${location ? ` → ${location}` : ""}${issues.length ? ` issues=${issues.join(",")}` : ""} body=${text.length}`,
      sev,
    );
  }

  // Role logins
  const patient = await loginCookie("qa.patient.a@glucoguide.com", "patient");
  const doctor = await loginCookie("qa.doctor.a@glucoguide.com", "doctor");
  const admin = await loginCookie("admin@glucoguide.com", "admin");
  rec("auth.patient", !!patient.cookie || !!patient.token, `cookie=${!!patient.cookie} token=${!!patient.token}`, "P0");
  rec("auth.doctor", !!doctor.cookie || !!doctor.token, `cookie=${!!doctor.cookie} token=${!!doctor.token}`, "P0");
  rec("auth.admin", !!admin.cookie || !!admin.token, `cookie=${!!admin.cookie} token=${!!admin.token}`, "P0");

  const roleRoutes: Array<{ role: string; cookie: string; paths: string[] }> = [
    {
      role: "patient",
      cookie: patient.cookie,
      paths: [
        "/patient/dashboard",
        "/patient/bookings",
        "/patient/profile",
        "/patient/appointments",
        "/patient/info",
        "/patient/diet",
        "/patient/monitoring",
        "/practices",
        "/practices/qa-clinic-a",
        "/settings",
      ],
    },
    {
      role: "doctor",
      cookie: doctor.cookie,
      paths: [
        "/doctor/dashboard",
        "/doctor/queue",
        "/doctor/practice",
        "/doctor/patients",
        "/doctor/appointments",
        "/doctor/appointments/patients",
        "/doctor/analytics",
        "/doctor/calendar",
        "/doctor/onboard",
        "/doctor/subscription",
        "/clinic/dashboard",
        "/clinic/subscription",
      ],
    },
    {
      role: "admin",
      cookie: admin.cookie,
      paths: [
        "/admin/dashboard",
        "/admin/bookings",
        "/admin/support",
        "/admin/inbox",
        "/admin/payments",
        "/admin/whatsapp",
        "/admin/whatsapp/signup",
        "/admin/approvals",
        "/admin/approvals/reviews",
        "/admin/approvals/templates",
        "/admin/approvals/numbers",
        "/admin/approvals/escalations",
        "/admin/clinics",
        "/admin/doctors",
        "/admin/patients",
        "/admin/hospitals",
        "/admin/users/patients",
        "/admin/users/doctor",
        "/admin/users/doctor/appointments",
      ],
    },
  ];

  for (const group of roleRoutes) {
    console.log(`\n-- Authenticated ${group.role} --`);
    if (!group.cookie) {
      rec(`auth.${group.role}.pages`, false, "no cookie — skip", "P0");
      continue;
    }
    for (const path of group.paths) {
      const { status, location, text, finalUrl } = await fetchPage(
        path,
        group.cookie,
      );
      const issues = status === 200 ? pageIssues(text) : [];
      // Auth pages should be 200 after cookie; redirect to login is a fail
      const bouncedToLogin =
        (location && /login/i.test(location)) ||
        /\/login/i.test(finalUrl);
      const ok =
        status === 200 &&
        !bouncedToLogin &&
        issues.length === 0;
      rec(
        `fe.${group.role}${path}`,
        ok || (status === 200 && issues.length === 0 && !bouncedToLogin),
        `HTTP ${status}${location ? ` → ${location}` : ""}${bouncedToLogin ? " BOUNCE_LOGIN" : ""}${issues.length ? ` issues=${issues.join(",")}` : ""}`,
        status >= 500 || bouncedToLogin ? "P0" : "P1",
      );
    }
  }

  // API-backed page data sanity for key shells
  console.log("\n-- API data for pages --");
  async function api(
    path: string,
    token: string | null,
  ): Promise<{ status: number; json: any }> {
    const res = await fetch(`${API}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  }

  if (patient.token) {
    const mine = await api("/procto/bookings/mine", patient.token);
    rec(
      "api.patient.bookings",
      mine.status === 200 && Array.isArray(mine.json.data),
      `status=${mine.status} n=${mine.json.data?.length ?? "?"}`,
      "P0",
    );
  }
  if (doctor.token) {
    const mine = await api("/procto/practices/mine", doctor.token);
    rec(
      "api.doctor.practices",
      mine.status === 200,
      `status=${mine.status}`,
      "P0",
    );
    const pid =
      (Array.isArray(mine.json.data) &&
        (mine.json.data[0]?.practiceId ||
          mine.json.data[0]?.practice?.id ||
          mine.json.data[0]?.id)) ||
      mine.json.data?.[0]?.id ||
      mine.json.data?.id;
    if (pid) {
      const today = new Date().toISOString().slice(0, 10);
      const q = await api(
        `/procto/bookings/practice/${pid}?date=${today}`,
        doctor.token,
      );
      rec(
        "api.doctor.queue",
        q.status === 200,
        `status=${q.status} rows=${Array.isArray(q.json.data) ? q.json.data.length : "?"}`,
        "P0",
      );
      const bill = await api(`/procto/practices/${pid}/billing`, doctor.token);
      rec("api.doctor.billing", bill.status < 500, `status=${bill.status}`, "P1");
    }
  }
  if (admin.token) {
    const plans = await api("/procto/admin/plans", admin.token);
    rec("api.admin.plans", plans.status === 200, `status=${plans.status}`, "P1");
    const reviews = await api("/procto/admin/reviews", admin.token);
    rec(
      "api.admin.reviews",
      reviews.status === 200,
      `status=${reviews.status}`,
      "P1",
    );
    const templates = await api("/procto/admin/templates", admin.token);
    rec(
      "api.admin.templates",
      templates.status === 200 || templates.status === 404,
      `status=${templates.status}`,
      "P1",
    );
  }

  const clinic = await api("/procto/practices/qa-clinic-a", null);
  rec(
    "api.clinic.public",
    clinic.status === 200 && clinic.json.status === "successful",
    `status=${clinic.status} reviews=${clinic.json.data?.reviews?.length ?? 0}`,
    "P0",
  );

  // Summary
  const fail = rows.filter((r) => !r.ok);
  const p0 = fail.filter((r) => r.severity === "P0");
  console.log("\n== Summary ==");
  console.log(`passed=${rows.filter((r) => r.ok).length}/${rows.length}`);
  console.log(`failures=${fail.length} (P0=${p0.length})`);
  if (fail.length) {
    console.log("\nFailures:");
    for (const f of fail) console.log(`  [${f.severity}] ${f.id}: ${f.detail}`);
  }
  // Write machine-readable for follow-up
  const { writeFileSync } = await import("fs");
  writeFileSync(
    "/tmp/page-qa-results.json",
    JSON.stringify({ rows, fail }, null, 2),
  );
  process.exit(fail.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
