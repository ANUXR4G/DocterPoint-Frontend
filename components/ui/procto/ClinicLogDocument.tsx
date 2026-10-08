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
import { resolveUploadUrl } from "@/lib/uploads"

function dash(v?: string | number | null) {
  if (v == null || v === "") return "—"
  return String(v)
}

function allergySummary(a: ClinicalAssessment | null): string {
  if (!a) return "No known allergy"
  if (a.noKnownAllergies) return "No known allergy"
  const rows = (a.allergies ?? []).filter(
    (r) => r.name?.trim() || r.category?.trim() || r.description?.trim(),
  )
  if (!rows.length) return "No known allergy"
  return rows
    .map((r) => {
      const bits = [
        r.category,
        r.name,
        r.severity,
        r.active === "Yes" ? "Active" : r.active === "No" ? "Inactive" : null,
        r.description,
      ].filter(Boolean)
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

export type ClinicLogTab = "visit" | "clinical" | "prescription"

/** On-screen Clinic Log + Rx from a finished visit. One section per tab. */
export default function ClinicLogDocument({
  booking,
  tab = "visit",
}: {
  booking: ProctoBooking
  tab?: ClinicLogTab
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
  const clinicStamp = resolveUploadUrl(booking.practice?.stampSrc)
  const doctorStamp = resolveUploadUrl(booking.provider?.stampSrc)
  const remarks = String(booking.doctorRemarks || "").trim()
  const recordedAt = assessment?.savedAt || assessment?.vitals?.recordedAt
    ? formatPracticeDateTime(
        assessment.savedAt || assessment.vitals?.recordedAt || "",
      )
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

  return (
    <article className="clinic-log-doc mx-auto max-w-4xl bg-white px-6 py-5 text-neutral-900">
      {tab === "visit" ? (
      <>
      <div className="rounded-lg border-2 border-sky-300 bg-sky-50/40 px-4 py-3 text-sm">
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

      <section className="mt-5 text-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide">Allergies</h2>
        <p className="mt-1">{allergySummary(assessment)}</p>
      </section>

      <section className="mt-4 text-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide">Diagnosis</h2>
        {diagnosis ? (
          <p className="mt-1">{diagnosis}</p>
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

      <footer className="mt-10 border-t border-neutral-200 pt-6">
        <div
          className="flex size-24 flex-col items-center justify-center rounded-full border-2 border-sky-500 bg-sky-50 text-center text-[10px] font-bold leading-tight text-sky-800"
          aria-hidden
        >
          <span className="px-2">{doctorName}</span>
          {license ? <span className="mt-0.5 opacity-80">{license}</span> : null}
        </div>
      </footer>
      </>
      ) : null}

      {tab === "clinical" ? (
      <>
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide">
          Vital Signs
        </h2>
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
      </>
      ) : null}

      {tab === "prescription" ? (
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wide">
            Prescription
          </h2>
          {medicines.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">No medicines prescribed.</p>
          ) : (
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm font-semibold">
              {medicines.map((m, i) => (
                <li key={`${m.name}-${i}`}>{m.name}</li>
              ))}
            </ol>
          )}
        </section>
      ) : null}

      {clinicStamp || doctorStamp ? (
        <footer className="mt-10 flex flex-wrap items-end justify-end gap-8 border-t border-neutral-200 pt-6">
          {doctorStamp ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={doctorStamp}
              alt="Doctor stamp"
              className="h-24 w-auto max-w-[9rem] object-contain"
            />
          ) : null}
          {clinicStamp ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={clinicStamp}
              alt="Clinic stamp"
              className="h-24 w-auto max-w-[9rem] object-contain"
            />
          ) : null}
        </footer>
      ) : null}
    </article>
  )
}
