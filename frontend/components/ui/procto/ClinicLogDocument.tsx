"use client"

import {
  normalizeClinicalAssessment,
  type ClinicalAssessment,
} from "@/lib/clinicalMasters"
import { chiefComplaintOf } from "@/lib/bookingDisplay"
import { withDrTitle } from "@/lib/doctorName"
import { formatPhoneDisplay } from "@/lib/formatPhone"
import {
  formatPracticeDate,
  formatPracticeDateTime,
  formatPracticeTime,
} from "@/lib/practiceTime"
import type { ProctoBooking } from "@/lib/services/procto"

type Medicine = { name: string; amount?: string; times?: string[] }

function dash(v?: string | number | null) {
  if (v == null || v === "") return "—"
  return String(v)
}

function formatTimes(times?: string[]) {
  if (!times?.length) return ""
  return times
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join(", ")
}

function dosageLine(m: Medicine) {
  const parts = [formatTimes(m.times), m.amount?.trim()].filter(Boolean)
  return parts.join(" · ") || "—"
}

function allergySummary(a: ClinicalAssessment | null): string {
  if (!a) return "No known allergy"
  if (a.noKnownAllergies) return "No known allergy"
  const rows = (a.allergies ?? []).filter((r) => r.name?.trim())
  if (!rows.length) return "No known allergy"
  return rows
    .map((r) => {
      const bits = [r.name, r.severity, r.active === "Yes" ? "Active" : null].filter(
        Boolean,
      )
      return bits.join(" — ")
    })
    .join("; ")
}

function painSummary(a: ClinicalAssessment | null): string {
  if (!a) return "No Pain Complaints Recorded"
  const rows = (a.pain ?? []).filter(
    (r) => r.scale?.trim() || r.score?.trim() || r.location?.trim(),
  )
  if (!rows.length) return "No Pain Complaints Recorded"
  return rows
    .map((r) => {
      const bits = [
        r.scale,
        r.score,
        r.location ? `Location: ${r.location}` : null,
        r.type,
      ].filter(Boolean)
      return bits.join(" · ")
    })
    .join("; ")
}

function vitalCell(
  values: Record<string, number | null> | undefined,
  key: string,
): string {
  const v = values?.[key]
  if (v == null || !Number.isFinite(v)) return ""
  return String(v)
}

function bpCell(values: Record<string, number | null> | undefined): string {
  const sys = values?.bp_sys
  const dia = values?.bp_dia
  if (sys == null && dia == null) return ""
  if (sys != null && dia != null) return `${sys}/${dia}`
  return String(sys ?? dia ?? "")
}

/** Printable / on-screen Clinic Log + Rx from a finished visit booking. */
export default function ClinicLogDocument({
  booking,
}: {
  booking: ProctoBooking
}) {
  const assessment = normalizeClinicalAssessment(booking.clinicalAssessment)
  const values = assessment?.vitals?.values ?? {}
  const p = booking.patient
  const patientName =
    p?.name || booking.patientName || booking.patient_name || "Patient"
  const phone = formatPhoneDisplay(
    p?.contactNumber ||
      p?.phone ||
      booking.patientPhone ||
      booking.patient_phone,
  )
  const doctorName =
    withDrTitle(booking.provider?.name) || "—"
  const license = booking.provider?.licenseNo?.trim()
  const slotStart = booking.slotStart || booking.slot_start
  const slotEnd = booking.slot_end
  const appointmentLabel = slotStart
    ? [
        formatPracticeDate(slotStart),
        formatPracticeTime(slotStart),
        slotEnd ? `– ${formatPracticeTime(slotEnd)}` : null,
      ]
        .filter(Boolean)
        .join(" ")
    : booking.sessionDate || booking.session_date
      ? formatPracticeDate(booking.sessionDate || booking.session_date!)
      : "—"

  const chief = chiefComplaintOf(booking)
  const diagnosis =
    booking.disease?.trim() ||
    booking.consultationType?.trim() ||
    booking.consultation_type?.trim() ||
    ""

  const medicines = (booking.medicines ?? []).filter((m) => m?.name?.trim())
  const remarks = String(booking.doctorRemarks || "").trim()
  const recordedAt = assessment?.vitals?.recordedAt
    ? formatPracticeDateTime(assessment.vitals.recordedAt)
    : slotStart
      ? formatPracticeDateTime(slotStart)
      : "—"

  const mainVitals = [
    { key: "ht", label: "Ht (cm)", value: vitalCell(values, "ht") },
    { key: "wt", label: "Wt (kg)", value: vitalCell(values, "wt") },
    { key: "bmi", label: "BMI", value: vitalCell(values, "bmi") },
    { key: "temp", label: "Temp (°C)", value: vitalCell(values, "temp") },
    { key: "bp", label: "BP (mmHg)", value: bpCell(values) },
    { key: "rr", label: "Resp (/min)", value: vitalCell(values, "rr") },
    { key: "spo2", label: "SpO2 (%)", value: vitalCell(values, "spo2") },
    { key: "hc", label: "HC (cm)", value: vitalCell(values, "hc") },
    { key: "pr", label: "PR (bpm)", value: vitalCell(values, "pr") },
  ]
  const extraKeys = Object.keys(values).filter(
    (k) =>
      ![
        "ht",
        "wt",
        "bmi",
        "temp",
        "bp_sys",
        "bp_dia",
        "rr",
        "spo2",
        "hc",
        "pr",
      ].includes(k) && values[k] != null,
  )

  const bandHint = (() => {
    const sample = values.pr ?? values.temp ?? values.bmi ?? null
    if (sample == null) return null
    // Soft summary when any vital exists — keep simple for the log header.
    return "Recorded"
  })()

  return (
    <article className="clinic-log-doc mx-auto max-w-4xl bg-white px-6 py-5 text-neutral-900">
      <h1 className="text-xl font-bold tracking-tight">Clinic Log and details</h1>

      <div className="mt-4 rounded-lg border-2 border-sky-300 bg-sky-50/40 px-4 py-3 text-sm">
        <div className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
          <p>
            <span className="font-semibold">Patient&apos;s Name:</span>{" "}
            {patientName}
          </p>
          <p>
            <span className="font-semibold">Mobile No:</span> {dash(phone)}
          </p>
          <p>
            <span className="font-semibold">Patient MRN:</span>{" "}
            {dash(p?.mrn?.trim())}
          </p>
          <p>
            <span className="font-semibold">ID:</span>{" "}
            {dash(p?.id ? p.id.slice(0, 8) : null)}
          </p>
          <p>
            <span className="font-semibold">Date of Birth:</span>{" "}
            {p?.dateOfBirth
              ? formatPracticeDate(p.dateOfBirth) || dash(p.dateOfBirth)
              : "—"}
          </p>
          <p>
            <span className="font-semibold">Age / Gender:</span>{" "}
            {[p?.age != null ? String(p.age) : null, p?.gender]
              .filter(Boolean)
              .join(" / ") || "—"}
          </p>
          <p>
            <span className="font-semibold">Visit ID:</span> {booking.id}
          </p>
          <p>
            <span className="font-semibold">Appointment:</span>{" "}
            {appointmentLabel}
          </p>
          <p className="sm:col-span-2">
            <span className="font-semibold">Dr. Name:</span> {doctorName}
            {license ? (
              <span className="ml-2 text-neutral-600">({license})</span>
            ) : null}
          </p>
        </div>
      </div>

      <section className="mt-5">
        <h2 className="text-sm font-bold uppercase tracking-wide">
          Chief Complaint
        </h2>
        <p className="mt-1 text-sm">
          {chief ? (
            <>
              <span className="font-semibold">Primary Reason:</span> {chief}
            </>
          ) : (
            "No chief complaint recorded."
          )}
        </p>
      </section>

      <section className="mt-5">
        <h2 className="text-sm font-bold uppercase tracking-wide">
          Vital Signs
        </h2>
        {bandHint ? (
          <p className="mt-0.5 text-xs text-neutral-500">
            Result Interpretation: {bandHint}
          </p>
        ) : null}
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-300">
                <th className="py-1.5 pr-2 font-semibold">Date/Time</th>
                {mainVitals.map((c) => (
                  <th key={c.key} className="py-1.5 pr-2 font-semibold">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-neutral-200">
                <td className="py-1.5 pr-2 whitespace-nowrap">{recordedAt}</td>
                {mainVitals.map((c) => (
                  <td key={c.key} className="py-1.5 pr-2 tabular-nums">
                    {c.value || "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        {extraKeys.length ? (
          <p className="mt-2 text-xs">
            <span className="font-semibold">Additional Vitals:</span>{" "}
            {extraKeys
              .map((k) => `${k}: ${values[k]}`)
              .join(", ")}
          </p>
        ) : null}
      </section>

      <section className="mt-5 text-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide">Allergies</h2>
        <p className="mt-1">{allergySummary(assessment)}</p>
      </section>

      <section className="mt-4 text-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide">
          Pain Complaints
        </h2>
        <p className="mt-1">{painSummary(assessment)}</p>
      </section>

      <section className="mt-4 text-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide">Diagnosis</h2>
        {diagnosis ? (
          <p className="mt-1">
            {diagnosis}{" "}
            <span className="ml-2 text-xs font-semibold text-neutral-500">
              Principal
            </span>{" "}
            <span className="ml-1 inline-flex rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-800">
              Active
            </span>
          </p>
        ) : (
          <p className="mt-1 text-neutral-500">No diagnosis recorded.</p>
        )}
      </section>

      <section className="mt-5">
        <h2 className="text-sm font-bold uppercase tracking-wide">
          Clinical Remarks and Notes
        </h2>
        <div className="mt-2 min-h-[4.5rem] rounded-xl border border-neutral-300 px-4 py-3 text-sm whitespace-pre-wrap">
          {remarks || "No clinical remarks recorded."}
        </div>
      </section>

      <section className="mt-5">
        <h2 className="text-sm font-bold uppercase tracking-wide">
          Prescription (Rx)
        </h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-neutral-800">
                <th className="py-2 pr-3 font-bold">Medicine Name</th>
                <th className="py-2 pr-3 font-bold">Dosage</th>
                <th className="py-2 font-bold">Duration</th>
              </tr>
            </thead>
            <tbody>
              {medicines.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-3 text-neutral-500">
                    No medicines prescribed.
                  </td>
                </tr>
              ) : (
                medicines.map((m, i) => (
                  <tr key={`${m.name}-${i}`} className="border-b border-neutral-200">
                    <td className="py-2.5 pr-3 align-top font-semibold uppercase">
                      {m.name}
                    </td>
                    <td className="py-2.5 pr-3 align-top">{dosageLine(m)}</td>
                    <td className="py-2.5 align-top text-neutral-500">—</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="mt-10 flex flex-wrap items-end justify-between gap-6 border-t border-neutral-200 pt-6">
        <div className="flex items-center gap-4">
          <div
            className="flex size-24 shrink-0 flex-col items-center justify-center rounded-full border-2 border-sky-500 bg-sky-50 text-center text-[10px] font-bold leading-tight text-sky-800"
            aria-hidden
          >
            <span className="px-2">{doctorName}</span>
            {license ? <span className="mt-0.5 opacity-80">{license}</span> : null}
          </div>
          <p className="max-w-xs text-xs text-neutral-500">
            Dr. stamp and details will show from the system where you can
            upload the same in the doctor master.
          </p>
        </div>
      </footer>
    </article>
  )
}
