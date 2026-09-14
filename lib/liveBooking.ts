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
  const doctorRemarks =
    str(incoming.doctor_remarks) ?? str(incoming.doctorRemarks)
  const medicines =
    incoming.medicines !== undefined ? incoming.medicines : undefined
  const documents =
    incoming.documents !== undefined ? incoming.documents : undefined

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
    if (eventName === "booking_created") {
      return { next: prev, needsRefresh: true }
    }
    return { next: prev, needsRefresh: false }
  }

  const next = [...prev]
  next[idx] = patchBookingFields(next[idx]!, incoming)
  return { next, needsRefresh: false }
}
