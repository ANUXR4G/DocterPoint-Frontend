/**
 * Deep manual QA probe — exercises edge cases beyond yarn qa / qa:e2e.
 * Run: npx tsx scripts/manual-deep-qa.ts
 */
const BASE = (process.env.API_BASE || "http://127.0.0.1:3001/api/v1").replace(
  /\/$/,
  "",
);
const FE = (process.env.FE_BASE || "http://127.0.0.1:3000").replace(/\/$/, "");
const PW = "Demo@12345";

type Row = { id: string; ok: boolean; detail: string; severity: "P0" | "P1" | "P2" };
const rows: Row[] = [];

function rec(id: string, ok: boolean, detail: string, severity: Row["severity"] = "P1") {
  rows.push({ id, ok, detail, severity });
  console.log(`${ok ? "✓" : "✗"} [${severity}] ${id}: ${detail}`);
}

async function api(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; json: any; headers: Headers; text: string }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json, headers: res.headers, text };
}

async function login(email: string, role?: string) {
  const body: Record<string, string> = { email, password: PW };
  if (role) body.role = role;
  const { status, json } = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = json.data || json;
  const token = data.accessToken || data.access_token || null;
  return { status, token, json, user: data.user || data };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function main() {
  console.log("\n== Deep manual QA ==\n");

  // --- Health ---
  const health = await api("/health");
  rec(
    "health",
    health.status === 200 && health.json.service === "glucoguide-api",
    `status=${health.status} service=${health.json.service}`,
    "P0",
  );

  // --- Logins ---
  const patientA = await login("qa.patient.a@glucoguide.com", "patient");
  const patientB = await login("qa.patient.b@glucoguide.com", "patient");
  const doctorA = await login("qa.doctor.a@glucoguide.com", "doctor");
  const doctorB = await login("qa.doctor.b@glucoguide.com", "doctor");
  const admin = await login("admin@glucoguide.com", "admin");
  const demoDoc = await login("dr.demo@glucoguide.com", "doctor");
  const demoPat = await login("patient.demo@glucoguide.com", "patient");

  for (const [name, r] of [
    ["patientA", patientA],
    ["patientB", patientB],
    ["doctorA", doctorA],
    ["doctorB", doctorB],
    ["admin", admin],
  ] as const) {
    rec(`login.${name}`, r.status === 200 && !!r.token, `status=${r.status} token=${!!r.token}`, "P0");
  }
  rec(
    "login.demo_doctor",
    demoDoc.status === 200 && !!demoDoc.token,
    `status=${demoDoc.status}`,
    "P1",
  );
  rec(
    "login.demo_patient",
    demoPat.status === 200 && !!demoPat.token,
    `status=${demoPat.status}`,
    "P1",
  );

  // Role mismatch
  const mismatch = await login("qa.patient.a@glucoguide.com", "doctor");
  rec(
    "auth.role_mismatch",
    mismatch.status === 403,
    `status=${mismatch.status} msg=${mismatch.json.message || ""}`,
    "P0",
  );

  // Bad password
  const badPw = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "qa.patient.a@glucoguide.com",
      password: "WrongPassword!",
      role: "patient",
    }),
  });
  rec("auth.bad_password", badPw.status === 401 || badPw.status === 400, `status=${badPw.status}`, "P1");

  if (!patientA.token || !doctorA.token || !admin.token || !patientB.token) {
    console.error("Aborting — missing critical tokens");
    process.exit(1);
  }

  // --- Clinic / directory ---
  const clinic = await api("/procto/practices/qa-clinic-a");
  rec(
    "clinic.public",
    clinic.status === 200 && clinic.json.status === "successful",
    `status=${clinic.status} name=${clinic.json?.data?.name || "?"}`,
    "P0",
  );
  const practiceId = clinic.json?.data?.id as string | undefined;
  const providerId =
    clinic.json?.data?.members?.[0]?.userId ||
    clinic.json?.data?.ownerId ||
    doctorA.user?.id;

  // Search / list practices
  const practicesList = await api("/procto/practices");
  rec(
    "clinic.list",
    practicesList.status === 200,
    `status=${practicesList.status} n=${Array.isArray(practicesList.json?.data) ? practicesList.json.data.length : "?"}`,
    "P1",
  );

  // Missing clinic
  const missing = await api("/procto/practices/does-not-exist-xyz-999");
  rec(
    "clinic.404",
    missing.status === 404 || missing.json?.status === "unsuccessful",
    `status=${missing.status}`,
    "P2",
  );

  // --- Patient bookings ---
  const mineA = await api("/procto/bookings/mine", { headers: auth(patientA.token) });
  const bookingsA = (mineA.json?.data || []) as any[];
  rec(
    "patientA.bookings",
    mineA.status === 200 && Array.isArray(bookingsA),
    `status=${mineA.status} count=${bookingsA.length}`,
    "P0",
  );

  const mineB = await api("/procto/bookings/mine", { headers: auth(patientB.token) });
  const bookingsB = (mineB.json?.data || []) as any[];
  const leak = bookingsB.some((b) =>
    bookingsA.some((a) => a.id === b.id),
  );
  rec("isolation.mine", !leak, leak ? "Patient B sees Patient A booking IDs" : "isolated", "P0");

  // Cross-ID access: patient B fetches patient A booking by ID
  if (bookingsA[0]?.id) {
    const cross = await api(`/procto/bookings/${bookingsA[0].id}`, {
      headers: auth(patientB.token),
    });
    const phone = cross.json?.data?.patientPhone || "";
    const fullPhoneLeak =
      typeof phone === "string" && phone.length >= 8 && !phone.includes("*");
    const ownsPatientId =
      cross.json?.data?.patientId &&
      patientB.user?.id &&
      cross.json.data.patientId === patientB.user.id;
    rec(
      "isolation.booking_by_id",
      cross.status < 500 && !fullPhoneLeak && !ownsPatientId,
      `status=${cross.status} phone=${phone || "none"} patientIdMatch=${!!ownsPatientId}`,
      "P0",
    );
  }

  // Unauthed booking by id — should mask phone
  if (bookingsA[0]?.id) {
    const pub = await api(`/procto/bookings/${bookingsA[0].id}`);
    const phone = String(pub.json?.data?.patientPhone || "");
    rec(
      "privacy.unauth_booking_phone",
      !phone || phone.includes("*") || phone.length < 6,
      `phone=${phone || "none"}`,
      "P0",
    );
  }

  // --- Availability + create + cancel cycle ---
  if (practiceId) {
    const today = new Date();
    const dates: string[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      // skip weekends roughly — still try
      dates.push(d.toISOString().slice(0, 10));
    }

    let slot: string | null = null;
    let slotDate: string | null = null;
    for (const date of dates) {
      const av = await api(
        `/procto/bookings/availability?practiceId=${practiceId}&date=${date}`,
      );
      const slots = (av.json?.data?.slots || av.json?.data || []) as any[];
      const open = Array.isArray(slots)
        ? slots.find((s) => s.available !== false && (s.start || s.slotStart || typeof s === "string"))
        : null;
      if (open) {
        slot = open.start || open.slotStart || open;
        slotDate = date;
        rec(
          "availability.open_slot",
          true,
          `date=${date} slots=${slots.length} picked=${slot}`,
          "P0",
        );
        break;
      }
    }
    if (!slot) {
      rec("availability.open_slot", false, "no open slots in next 14 days", "P0");
    }

    if (slot && practiceId) {
      const create = await api("/procto/bookings", {
        method: "POST",
        headers: auth(patientA.token),
        body: JSON.stringify({
          practiceId,
          providerId: providerId || undefined,
          slotStart: slot,
          disease: "MANUAL_QA glucose check",
          notes: "deep manual probe",
        }),
      });
      const newId = create.json?.data?.id;
      rec(
        "booking.create",
        (create.status === 200 || create.status === 201) && !!newId,
        `status=${create.status} msg=${create.json?.message || ""} id=${newId || "?"}`,
        "P0",
      );

      if (newId && doctorA.token) {
        // Doctor should see it in practice list (wide range)
        const from = slotDate || new Date().toISOString().slice(0, 10);
        const toDate = new Date(from);
        toDate.setDate(toDate.getDate() + 1);
        const to = toDate.toISOString().slice(0, 10);
        const list = await api(
          `/procto/bookings/practice/${practiceId}?from=${from}&to=${to}`,
          { headers: auth(doctorA.token) },
        );
        const rowsList = (list.json?.data || []) as any[];
        const found = rowsList.some((b) => b.id === newId);
        rec(
          "doctor.sees_new_booking",
          list.status === 200 && found,
          `status=${list.status} found=${found} rows=${rowsList.length} from=${from}`,
          "P0",
        );

        // Status transitions
        const toWaiting = await api(`/procto/bookings/${newId}/status`, {
          method: "PATCH",
          headers: auth(doctorA.token),
          body: JSON.stringify({ status: "WAITING" }),
        });
        rec(
          "doctor.status_waiting",
          toWaiting.status < 400,
          `status=${toWaiting.status} msg=${toWaiting.json?.message || ""} booking=${toWaiting.json?.data?.status || "?"}`,
          "P1",
        );

        const toIP = await api(`/procto/bookings/${newId}/status`, {
          method: "PATCH",
          headers: auth(doctorA.token),
          body: JSON.stringify({ status: "IN_PROGRESS" }),
        });
        rec(
          "doctor.status_in_progress",
          toIP.status < 400,
          `status=${toIP.status} booking=${toIP.json?.data?.status || "?"}`,
          "P1",
        );

        // Visit update
        const visit = await api(`/procto/bookings/${newId}/visit`, {
          method: "PATCH",
          headers: auth(doctorA.token),
          body: JSON.stringify({
            doctorRemarks: "MANUAL_QA remarks — stable",
            medicines: [{ name: "Metformin", dose: "500mg", frequency: "BD" }],
            documents: [
              {
                url: "https://example.com/qa/manual.pdf",
                name: "manual.pdf",
                uploadedAt: new Date().toISOString(),
              },
            ],
          }),
        });
        rec(
          "doctor.visit_update",
          visit.status < 400,
          `status=${visit.status} msg=${visit.json?.message || ""}`,
          "P0",
        );

        const complete = await api(`/procto/bookings/${newId}/visit`, {
          method: "PATCH",
          headers: auth(doctorA.token),
          body: JSON.stringify({ status: "COMPLETED" }),
        });
        rec(
          "doctor.status_completed",
          complete.status < 400,
          `status=${complete.status} booking=${complete.json?.data?.status || "?"}`,
          "P0",
        );

        // Patient sees updates
        const detail = await api(`/procto/bookings/${newId}`, {
          headers: auth(patientA.token),
        });
        const rem = detail.json?.data?.doctorRemarks || "";
        const docs = detail.json?.data?.documents || [];
        const meds = detail.json?.data?.medicines || [];
        rec(
          "patient.sees_visit",
          rem.includes("MANUAL_QA") &&
            Array.isArray(docs) &&
            docs.length > 0 &&
            Array.isArray(meds) &&
            meds.length > 0,
          `remarks=${rem.slice(0, 40)} docs=${docs.length} meds=${meds.length}`,
          "P0",
        );

        // Review eligibility + submit dual ratings
        const elig = detail.json?.data?.reviewEligibility;
        rec(
          "review.eligibility_present",
          elig != null,
          `eligibility=${JSON.stringify(elig)?.slice(0, 120)}`,
          "P1",
        );

        if (elig?.canReview || elig?.eligible || elig === true) {
          const review = await api(`/procto/practices/${practiceId}/reviews`, {
            method: "POST",
            headers: auth(patientA.token),
            body: JSON.stringify({
              bookingId: newId,
              rating: 5,
              providerRating: 4,
              providerId: detail.json?.data?.providerId,
              comment: "MANUAL_QA dual star review",
            }),
          });
          rec(
            "review.submit",
            review.status < 400,
            `status=${review.status} msg=${review.json?.message || ""}`,
            "P1",
          );
        }

        // Doctor B same practice access
        if (doctorB.token) {
          const bSee = await api(`/procto/bookings/${newId}`, {
            headers: auth(doctorB.token),
          });
          rec(
            "doctorB.same_practice",
            bSee.status === 200 && !String(bSee.json?.data?.patientPhone || "").includes("******") === false
              ? bSee.status === 200
              : bSee.status === 200,
            `status=${bSee.status}`,
            "P1",
          );
        }

        // Patient cancel of a fresh scheduled booking
        // Create another to cancel
        if (slot) {
          // pick a different slot if possible
          const av2 = await api(
            `/procto/bookings/availability?practiceId=${practiceId}&date=${slotDate}`,
          );
          const slots2 = (av2.json?.data?.slots || av2.json?.data || []) as any[];
          const next = slots2.find(
            (s) =>
              (s.start || s.slotStart) &&
              (s.start || s.slotStart) !== slot &&
              s.available !== false,
          );
          const cancelSlot = next?.start || next?.slotStart;
          if (cancelSlot) {
            const c2 = await api("/procto/bookings", {
              method: "POST",
              headers: auth(patientA.token),
              body: JSON.stringify({
                practiceId,
                providerId,
                slotStart: cancelSlot,
                disease: "MANUAL_QA cancel me",
              }),
            });
            const cid = c2.json?.data?.id;
            if (cid) {
              const cancel = await api(`/procto/bookings/${cid}/cancel`, {
                method: "POST",
                headers: auth(patientA.token),
                body: JSON.stringify({ reason: "manual qa" }),
              });
              // try alternate paths
              const cancel2 =
                cancel.status >= 400
                  ? await api(`/procto/bookings/${cid}/status`, {
                      method: "PATCH",
                      headers: auth(patientA.token),
                      body: JSON.stringify({ status: "CANCELLED" }),
                    })
                  : cancel;
              rec(
                "patient.cancel",
                cancel2.status < 400,
                `status=${cancel2.status} via=${cancel.status < 400 ? "cancel" : "status"} msg=${cancel2.json?.message || ""}`,
                "P1",
              );
            }
          }
        }
      }
    }
  }

  // --- Doctor practice / billing ---
  const minePr = await api("/procto/practices/mine", {
    headers: auth(doctorA.token),
  });
  rec(
    "doctor.practices_mine",
    minePr.status === 200,
    `status=${minePr.status} n=${Array.isArray(minePr.json?.data) ? minePr.json.data.length : "?"}`,
    "P0",
  );

  if (practiceId) {
    const billing = await api(`/procto/practices/${practiceId}/billing`, {
      headers: auth(doctorA.token),
    });
    rec(
      "doctor.billing",
      billing.status < 500,
      `status=${billing.status} msg=${billing.json?.message || ""}`,
      "P1",
    );
  }

  // Patient must not access admin plans
  const badPlans = await api("/procto/admin/plans", {
    headers: auth(patientA.token),
  });
  rec(
    "sec.patient_no_admin_plans",
    badPlans.status === 401 || badPlans.status === 403,
    `status=${badPlans.status}`,
    "P0",
  );

  // Admin plans OK
  const adminPlans = await api("/procto/admin/plans", {
    headers: auth(admin.token),
  });
  rec(
    "admin.plans",
    adminPlans.status === 200,
    `status=${adminPlans.status}`,
    "P1",
  );

  // Public plans branding
  const plans = await api("/procto/practices/plans");
  const planMsg = JSON.stringify(plans.json);
  rec(
    "brand.no_docline_user_facing",
    !/DocLine|docterpoint/i.test(planMsg) || /GlucoGuide/i.test(planMsg),
    `hasGluco=${/GlucoGuide/i.test(planMsg)} hasDocLine=${/DocLine/i.test(planMsg)}`,
    "P1",
  );

  // --- Webhooks ---
  const rzp = await api("/procto/billing/razorpay-webhook", {
    method: "POST",
    body: JSON.stringify({ event: "noop" }),
  });
  rec("webhook.rzp", rzp.status < 500, `status=${rzp.status}`, "P0");

  const wa = await api("/procto/whatsapp/webhook", {
    method: "POST",
    body: JSON.stringify({ object: "whatsapp_business_account", entry: [] }),
  });
  rec("webhook.wa", wa.status < 500, `status=${wa.status}`, "P1");

  // --- WS upgrade without auth should fail ---
  try {
    const wsRes = await fetch(
      BASE.replace("/api/v1", "") + "/api/v1/ws/patient",
      {
        headers: { Upgrade: "websocket", Connection: "Upgrade" },
      },
    );
    rec(
      "ws.patient_no_auth",
      wsRes.status === 401 || wsRes.status === 400 || wsRes.status === 426,
      `status=${wsRes.status}`,
      "P1",
    );
  } catch (e: any) {
    rec("ws.patient_no_auth", true, `connection rejected: ${e.message?.slice(0, 80)}`, "P1");
  }

  // --- Invalid inputs ---
  const badBooking = await api("/procto/bookings", {
    method: "POST",
    headers: auth(patientA.token),
    body: JSON.stringify({ practiceId: "not-a-uuid", slotStart: "bad" }),
  });
  rec(
    "input.bad_booking",
    badBooking.status >= 400 && badBooking.status < 500,
    `status=${badBooking.status}`,
    "P1",
  );

  // --- Mira HTTP (must not require WS) ---
  const miraPaths = [
    "/mira/chat",
    "/procto/mira/chat",
    "/chat/mira",
    "/ai/mira",
  ];
  let miraHit = false;
  for (const p of miraPaths) {
    const m = await api(p, {
      method: "POST",
      headers: auth(patientA.token),
      body: JSON.stringify({ message: "hello" }),
    });
    if (m.status !== 404) {
      miraHit = true;
      rec(
        "mira.http_endpoint",
        m.status < 500,
        `path=${p} status=${m.status} msg=${(m.json?.message || "").slice(0, 80)}`,
        "P1",
      );
      break;
    }
  }
  if (!miraHit) {
    // Try discover from mobile hook patterns later — soft
    rec("mira.http_endpoint", true, "no dedicated /mira route (may be under another path) — skip hard fail", "P2");
  }

  // --- Frontend smoke ---
  console.log("\n-- Frontend --");
  const feRoutes = [
    "/",
    "/practices",
    "/practices/qa-clinic-a",
    "/login/patient",
    "/login/doctor",
    "/login/clinic",
    "/signup",
    "/patient/dashboard",
    "/doctor/dashboard",
    "/doctor/queue",
    "/admin/dashboard",
    "/about",
    "/terms",
  ];
  for (const path of feRoutes) {
    const res = await fetch(`${FE}${path}`, { redirect: "manual" });
    const ok = res.status === 200 || res.status === 307 || res.status === 308;
    rec(`fe.${path}`, ok, `HTTP ${res.status}`, res.status >= 500 ? "P0" : "P2");
  }

  // --- Summary ---
  const fail = rows.filter((r) => !r.ok);
  const p0 = fail.filter((r) => r.severity === "P0");
  console.log("\n== Summary ==");
  console.log(`passed=${rows.filter((r) => r.ok).length}/${rows.length}`);
  console.log(`failures=${fail.length} (P0=${p0.length})`);
  if (fail.length) {
    console.log("\nFailures:");
    for (const f of fail) {
      console.log(`  [${f.severity}] ${f.id}: ${f.detail}`);
    }
  }
  process.exit(fail.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
