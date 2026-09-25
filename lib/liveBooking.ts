/** Merge a live WS booking payload into a local list without refetching. */

export type LiveBookingPayload = Record<string, unknown>

function str(v: unknown): string | undefined {
  if (v == null) return undefined
  const s = String(v)
  return s.length ? s : undefined
}

function num(v: unknown): number | null | undefined {
  if (v == null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** Prefer explicit keys; allow empty string so remarks can clear. */
function optionalStr(
  ...candidates: unknown[]
): string | null | undefined {
  for (const v of candidates) {
    if (v === undefined) continue
    if (v === null) return null
    return String(v)
  }
  return undefined
}

export function patchBookingFields<T extends { id: string }>(
  existing: T,
  incoming: LiveBookingPayload,
): T {
  const status = str(incoming.status)
  const slotStart =
    str(incoming.slot_start) ?? str(incoming.slotStart) ?? undefined
  const sessionDate =
    str(incoming.session_date) ?? str(incoming.sessionDate) ?? undefined
  const tokenNumber = num(incoming.token_number) ?? num(incoming.tokenNumber)
  const patientName =
    str(incoming.patient_name) ?? str(incoming.patientName)
  const patientPhone =
    str(incoming.patient_phone) ?? str(incoming.patientPhone)
  const mode = str(incoming.mode)
  const channel = str(incoming.channel)
  const doctorRemarks = optionalStr(
    incoming.doctor_remarks,
    incoming.doctorRemarks,
  )
  const medicines =
    incoming.medicines !== undefined ? incoming.medicines : undefined
  const documents =
    incoming.documents !== undefined ? incoming.documents : undefined
  const disease = optionalStr(incoming.disease)
  const notes = optionalStr(incoming.notes)
  const consultationType = optionalStr(
    incoming.consultation_type,
    incoming.consultationType,
  )

  return {
    ...existing,
    ...(status ? { status } : {}),
    ...(slotStart !== undefined ? { slotStart, slot_start: slotStart } : {}),
    ...(sessionDate !== undefined
      ? { sessionDate, session_date: sessionDate }
      : {}),
    ...(tokenNumber !== undefined
      ? { tokenNumber, token_number: tokenNumber }
      : {}),
    ...(patientName !== undefined
      ? { patientName, patient_name: patientName }
      : {}),
    ...(patientPhone !== undefined
      ? { patientPhone, patient_phone: patientPhone }
      : {}),
    ...(mode ? { mode } : {}),
    ...(channel ? { channel } : {}),
    ...(doctorRemarks !== undefined
      ? { doctorRemarks, doctor_remarks: doctorRemarks }
      : {}),
    ...(medicines !== undefined ? { medicines } : {}),
    ...(documents !== undefined ? { documents } : {}),
    ...(disease !== undefined ? { disease } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(consultationType !== undefined
      ? { consultationType, consultation_type: consultationType }
      : {}),
  } as T
}

export function applyLiveBookingEvent<T extends { id: string }>(
  prev: T[],
  eventName: string,
  incoming: LiveBookingPayload | undefined,
): { next: T[]; needsRefresh: boolean } {
  if (!incoming?.id) return { next: prev, needsRefresh: true }
  const id = String(incoming.id)
  const idx = prev.findIndex((b) => b.id === id)

  if (idx < 0) {
    // Unknown id — soft-refresh so patient/clinic lists stay complete.
    return { next: prev, needsRefresh: true }
  }

  const next = [...prev]
  next[idx] = patchBookingFields(next[idx]!, incoming)
  return { next, needsRefresh: false }
}

type PatientRowWithVisits = {
  phone: string
  lastStatus?: string | null
  lastVisitAt?: string | Date | null
  recentBookings?: Array<{ id: string } & Record<string, unknown>>
}

/**
 * Keep Patients → recent visits in sync with live booking patches
 * (remarks / status / meds), not only the queue list.
 */
export function patchPatientsFromBooking<T extends PatientRowWithVisits>(
  patients: T[],
  incoming: LiveBookingPayload | undefined,
): T[] {
  if (!incoming?.id) return patients
  const id = String(incoming.id)
  const phone =
    str(incoming.patient_phone) ?? str(incoming.patientPhone) ?? undefined

  let touched = false
  const next = patients.map((patient) => {
    const recent = patient.recentBookings
    if (!Array.isArray(recent) || !recent.length) return patient
    const idx = recent.findIndex((b) => b.id === id)
    if (idx < 0) {
      // New visit for this phone — soft-refresh will pick it up.
      if (phone && patient.phone === phone) touched = true
      return patient
    }
    touched = true
    const updatedRecent = [...recent]
    updatedRecent[idx] = patchBookingFields(recent[idx]!, incoming)
    const patched = updatedRecent[idx]!
    const status = str(patched.status) ?? patient.lastStatus
    const visitAt =
      str(patched.slotStart) ??
      str(patched.slot_start) ??
      str(patched.sessionDate) ??
      str(patched.session_date) ??
      patient.lastVisitAt
    return {
      ...patient,
      recentBookings: updatedRecent,
      lastStatus: status ?? patient.lastStatus,
      lastVisitAt: visitAt ?? patient.lastVisitAt,
    }
  })

  return touched ? next : patients
}
