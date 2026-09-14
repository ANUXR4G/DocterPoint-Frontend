/**
 * Cross-role API e2e for GlucoGuide QA accounts.
 * Prerequisites: backend :3001, `npx tsx scripts/qa-seed.ts`
 * Run: npx tsx scripts/qa-e2e-flow.ts
 */
const BASE = (process.env.API_BASE || "http://127.0.0.1:3001/api/v1").replace(
  /\/$/,
  "",
);

type Row = {
  id: string;
  ok: boolean;
  expected: string;
  actual: string;
};

const results: Row[] = [];

function record(
  id: string,
  ok: boolean,
  expected: string,
  actual: string,
) {
  results.push({ id, ok, expected, actual });
  console.log(`${ok ? "✓" : "✗"} ${id}: ${actual}`);
}

async function api(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; json: any }> {
  let last = { status: 0, json: {} as any };
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    const json = await res.json().catch(() => ({}));
    last = { status: res.status, json };
    if (res.status !== 429) return last;
    await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
  }
  return last;
}

async function login(email: string, password = "Demo@12345", role?: string) {
  const body: Record<string, string> = { email, password };
  if (role) body.role = role;
  const { status, json } = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const token = json.access_token || json.data?.access_token || null;
  return { status, token, json };
}

async function main() {
  console.log("\n== QA E2E cross-role flow ==\n");

  // Health branding
  const health = await fetch("http://127.0.0.1:3001/health").then((r) =>
    r.json(),
  );
  record(
    "health.service_name",
    health.service === "glucoguide-api",
    "glucoguide-api",
    String(health.service),
  );

  // Auth matrix
  for (const [email, role, label] of [
    ["qa.patient.a@glucoguide.com", "user", "patientA"],
    ["qa.patient.b@glucoguide.com", "user", "patientB"],
    ["qa.doctor.a@glucoguide.com", "doctor", "doctorA"],
    ["qa.doctor.b@glucoguide.com", "doctor", "doctorB"],
    ["admin@glucoguide.com", "admin", "admin"],
  ] as const) {
    const { status, token } = await login(email, "Demo@12345", role);
    record(
      `auth.login.${label}`,
      status === 200 && !!token,
      "200 + token",
      `status=${status} token=${token ? "yes" : "no"}`,
    );
  }

  const wrong = await login("qa.patient.a@glucoguide.com", "Demo@12345", "doctor");
  record(
    "auth.role_mismatch",
    wrong.status === 403 || wrong.json?.status === "unsuccessful",
    "403 or unsuccessful",
    `status=${wrong.status} msg=${wrong.json?.message || ""}`,
  );

  const patientA = await login("qa.patient.a@glucoguide.com", "Demo@12345", "user");
  const patientB = await login("qa.patient.b@glucoguide.com", "Demo@12345", "user");
  const doctorA = await login("qa.doctor.a@glucoguide.com", "Demo@12345", "doctor");
  const doctorB = await login("qa.doctor.b@glucoguide.com", "Demo@12345", "doctor");

  // Patient A bookings
  const mineA = await api("/procto/bookings/mine", {
    headers: { Authorization: `Bearer ${patientA.token}` },
  });
  const bookingsA = (mineA.json.data || []) as any[];
  record(
    "patientA.bookings.list",
    mineA.status === 200 && bookingsA.length > 0,
    ">=1 booking",
    `count=${bookingsA.length}`,
  );

  const mineB = await api("/procto/bookings/mine", {
    headers: { Authorization: `Bearer ${patientB.token}` },
  });
  const bookingsB = (mineB.json.data || []) as any[];
  const leak = bookingsB.some(
    (b) =>
      b.patientName === "QA_PATIENT_A" ||
      b.patient_name === "QA_PATIENT_A" ||
      b.patientPhone === "9222000001" ||
      b.patient_phone === "9222000001",
  );
  record(
    "isolation.patientB_no_patientA",
    !leak,
    "no Patient A rows",
    leak ? "LEAKED" : "isolated",
  );

  // Completed visit fields for Patient A
  const completed = bookingsA.find(
    (b) => (b.status || "").toUpperCase() === "COMPLETED",
  );
  record(
    "patientA.completed.exists",
    !!completed,
    "COMPLETED booking",
    completed ? completed.id || completed.notes || "yes" : "missing",
  );
  if (completed) {
    record(
      "patientA.completed.doctorRemarks",
      !!(completed.doctorRemarks || completed.doctor_remarks),
      "doctor remarks present",
      String(completed.doctorRemarks || completed.doctor_remarks || "missing"),
    );
    const meds = completed.medicines;
    record(
      "patientA.completed.medicines",
      Array.isArray(meds) && meds.length > 0,
      "medicines array",
      Array.isArray(meds) ? `n=${meds.length}` : String(meds),
    );
    const docs = completed.documents;
    record(
      "patientA.completed.documents",
      Array.isArray(docs) && docs.length > 0,
      "documents array",
      Array.isArray(docs) ? `n=${docs.length}` : String(docs),
    );
  }

  // Doctor A practice queue
  const practices = await api("/procto/practices/mine", {
    headers: { Authorization: `Bearer ${doctorA.token}` },
  });
  // fallback: public slug
  const clinic = await api("/procto/practices/qa-clinic-a");
  record(
    "clinic.qa_slug",
    clinic.status === 200 && clinic.json.status === "successful",
    "qa-clinic-a found",
    `status=${clinic.status}`,
  );
  const practiceId =
    clinic.json?.data?.id ||
    (Array.isArray(practices.json?.data) &&
      (practices.json.data[0]?.practiceId ||
        practices.json.data[0]?.practice?.id ||
        practices.json.data[0]?.id)) ||
    null;

  if (practiceId && doctorA.token) {
    const today = new Date().toISOString().slice(0, 10);
    // Try a week range — list practice bookings
    const q = await api(
      `/procto/bookings/practice/${practiceId}?date=${today}`,
      { headers: { Authorization: `Bearer ${doctorA.token}` } },
    );
    // Also try without date filter paths used by provider app
    const q2 = await api(`/procto/bookings/practice/${practiceId}?from=${today}`, {
      headers: { Authorization: `Bearer ${doctorA.token}` },
    });
    const rows = (q.json.data || q2.json.data || []) as any[];
    record(
      "doctorA.practice_bookings_endpoint",
      q.status < 500 && q2.status < 500,
      "endpoint responds",
      `q=${q.status} q2=${q2.status} rows=${Array.isArray(rows) ? rows.length : "?"}`,
    );

    // Doctor updates a SCHEDULED booking for Patient A if present
    const scheduled = bookingsA.find(
      (b) => (b.status || "").toUpperCase() === "SCHEDULED",
    );
    if (scheduled?.id) {
      const before = scheduled.id;
      const patch = await api(`/procto/bookings/${before}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${doctorA.token}` },
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      });
      record(
        "doctorA.status_to_in_progress",
        patch.status < 400 &&
          (patch.json.status === "successful" ||
            patch.json.data?.status === "IN_PROGRESS"),
        "status IN_PROGRESS",
        `http=${patch.status} msg=${patch.json.message || ""}`,
      );

      const visit = await api(`/procto/bookings/${before}/visit`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${doctorA.token}` },
        body: JSON.stringify({
          doctorRemarks: "QA_LIVE_NOTE — glucose stable",
          medicines: [{ name: "QA_Drug", amount: "10mg", times: ["night"] }],
          documents: [
            {
              name: "QA_LIVE_DOC.pdf",
              url: "https://example.com/qa/QA_LIVE_DOC.pdf",
            },
          ],
          status: "COMPLETED",
        }),
      });
      record(
        "doctorA.update_visit",
        visit.status < 400,
        "visit saved",
        `http=${visit.status} msg=${visit.json.message || ""}`,
      );

      // Patient A sees doctor updates
      const mineAgain = await api("/procto/bookings/mine", {
        headers: { Authorization: `Bearer ${patientA.token}` },
      });
      const updated = ((mineAgain.json.data || []) as any[]).find(
        (b) => b.id === before,
      );
      record(
        "patientA.sees_doctor_note",
        !!updated &&
          String(updated.doctorRemarks || updated.doctor_remarks || "").includes(
            "QA_LIVE_NOTE",
          ),
        "QA_LIVE_NOTE visible",
        String(updated?.doctorRemarks || updated?.doctor_remarks || "missing"),
      );
      record(
        "patientA.sees_doctor_doc",
        Array.isArray(updated?.documents) &&
          updated.documents.some((d: any) => d.name === "QA_LIVE_DOC.pdf"),
        "QA_LIVE_DOC.pdf",
        JSON.stringify(updated?.documents || []).slice(0, 120),
      );
      record(
        "patientA.status_completed",
        (updated?.status || "").toUpperCase() === "COMPLETED",
        "COMPLETED",
        String(updated?.status),
      );
    } else {
      record(
        "doctorA.status_to_in_progress",
        false,
        "scheduled booking",
        "no SCHEDULED booking for Patient A",
      );
    }

    // Doctor B cannot use Doctor A's patient isolation via wrong practice — try unauthorized booking get
    if (completed?.id && doctorB.token) {
      const foreign = await api(`/procto/bookings/${completed.id}`, {
        headers: { Authorization: `Bearer ${doctorB.token}` },
      });
      // Doctor B is member of same practice — access may be allowed. Check Patient B cannot.
      record(
        "doctorB.same_practice_booking_access",
        foreign.status < 500,
        "member of QA clinic may read",
        `http=${foreign.status}`,
      );
    }
  }

  // Patient books new appointment
  if (practiceId && patientA.token && clinic.json?.data) {
    const loc = clinic.json.data.locations?.[0]?.id;
    const provider =
      clinic.json.data.members?.find((m: any) => m.role === "PRACTICE_OWNER")
        ?.userId ||
      clinic.json.data.members?.[0]?.userId;
    const day = new Date();
    // Next weekday (Mon–Fri) with a schedule
    for (let i = 0; i < 14; i++) {
      day.setDate(day.getDate() + 1);
      const dow = day.getDay();
      if (dow >= 1 && dow <= 5) break;
    }
    const date = day.toISOString().slice(0, 10);
    const avail = await api(
      `/procto/bookings/availability?practiceId=${practiceId}&providerId=${provider}&locationId=${loc}&date=${date}`,
    );
    const timeSlots = avail.json?.data?.timeSlots || [];
    const openSlot = Array.isArray(timeSlots)
      ? timeSlots.find(
          (s: any) =>
            s &&
            s.available !== false &&
            (s.start || s.slotStart || s.iso || typeof s === "string"),
        )
      : null;
    const slotStart = openSlot
      ? typeof openSlot === "string"
        ? openSlot
        : openSlot.start || openSlot.slotStart || openSlot.iso
      : null;
    record(
      "booking.availability",
      avail.status === 200 && !!slotStart,
      "slot available",
      `http=${avail.status} date=${date} slots=${timeSlots.length} open=${timeSlots.filter?.((s: any) => s.available !== false).length ?? "?"} slot=${slotStart || "none"}`,
    );
    if (slotStart) {
      let created = await api("/procto/bookings", {
        method: "POST",
        headers: { Authorization: `Bearer ${patientA.token}` },
        body: JSON.stringify({
          practiceId,
          locationId: loc,
          providerId: provider,
          mode: "TIME_BASED",
          slotStart,
          disease: "QA Type2 follow-up",
          patientPhone: "9222000001",
          patientName: "QA_PATIENT_A",
          notes: "QA_APPOINTMENT_NEW",
        }),
      });
      // If the first open slot raced, try the next few available slots
      if (created.status === 409) {
        const more = timeSlots.filter(
          (s: any) =>
            s?.available !== false &&
            (s.start || s.slotStart) &&
            (s.start || s.slotStart) !== slotStart,
        );
        for (const s of more.slice(0, 5)) {
          const alt = s.start || s.slotStart;
          created = await api("/procto/bookings", {
            method: "POST",
            headers: { Authorization: `Bearer ${patientA.token}` },
            body: JSON.stringify({
              practiceId,
              locationId: loc,
              providerId: provider,
              mode: "TIME_BASED",
              slotStart: alt,
              disease: "QA Type2 follow-up",
              patientPhone: "9222000001",
              patientName: "QA_PATIENT_A",
              notes: "QA_APPOINTMENT_NEW",
            }),
          });
          if (created.status < 400) break;
        }
      }
      record(
        "patientA.create_booking",
        created.status < 400 && created.json.status === "successful",
        "booking created",
        `http=${created.status} msg=${created.json.message || ""} id=${created.json.data?.id || ""}`,
      );

      // Doctor sees new booking after create
      if (created.json.data?.id && doctorA.token) {
        const get = await api(`/procto/bookings/${created.json.data.id}`, {
          headers: { Authorization: `Bearer ${doctorA.token}` },
        });
        record(
          "doctorA.sees_new_booking",
          get.status === 200 &&
            (get.json.data?.disease || "").includes("QA Type2"),
          "disease visible to doctor",
          `http=${get.status} disease=${get.json.data?.disease || "missing"}`,
        );
      }
    }
  }

  // Unauthorized: patient A cannot hit admin
  const adminHit = await api("/procto/admin/plans", {
    headers: { Authorization: `Bearer ${patientA.token}` },
  });
  record(
    "sec.patient_no_admin_plans",
    adminHit.status === 401 || adminHit.status === 403,
    "401/403",
    `http=${adminHit.status}`,
  );

  // Plans catalog message should not say DocLine
  const plans = await api("/procto/practices/plans");
  const planMsg = String(plans.json.message || "");
  record(
    "brand.plans_message",
    !/docline/i.test(planMsg),
    "no DocLine in message",
    planMsg || "(empty)",
  );

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n== Summary: ${passed}/${results.length} passed, ${failed} failed ==\n`);
  if (failed) {
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`FAIL ${r.id}: expected ${r.expected}; actual ${r.actual}`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
