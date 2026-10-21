/** Merge a live WS booking payload into a local list without refetching. */

export type LiveBookingPayload = Record<string, unknown>;

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v);
  return s.length ? s : undefined;
}

function num(v: unknown): number | null | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Prefer explicit keys; allow empty string so remarks/notes can clear. */
function optionalStr(
  ...candidates: unknown[]
): string | null | undefined {
  for (const v of candidates) {
    if (v === undefined) continue;
    if (v === null) return null;
    return String(v);
  }
  return undefined;
}

/** Normalize snake/camel WS booking fields onto a list item. */
export function patchBookingFields<T extends { id: string }>(
  existing: T,
  incoming: LiveBookingPayload,
): T {
  const status = str(incoming.status);
  const slotStart =
    str(incoming.slot_start) ?? str(incoming.slotStart) ?? undefined;
  const sessionDate =
    str(incoming.session_date) ?? str(incoming.sessionDate) ?? undefined;
  const tokenNumber =
    num(incoming.token_number) ?? num(incoming.tokenNumber);
  const patientName =
    str(incoming.patient_name) ?? str(incoming.patientName);
  const patientPhone =
    str(incoming.patient_phone) ?? str(incoming.patientPhone);
  const mode = str(incoming.mode);
  const channel = str(incoming.channel);
  const consultationType = optionalStr(
    incoming.consultation_type,
    incoming.consultationType,
  );
  const doctorRemarks = optionalStr(
    incoming.doctor_remarks,
    incoming.doctorRemarks,
  );
  const medicines =
    incoming.medicines !== undefined ? incoming.medicines : undefined;
  const documents =
    incoming.documents !== undefined ? incoming.documents : undefined;
  const disease = optionalStr(incoming.disease);
  const notes = optionalStr(incoming.notes);
  const clinicalAssessment =
    incoming.clinical_assessment !== undefined
      ? incoming.clinical_assessment
      : incoming.clinicalAssessment !== undefined
        ? incoming.clinicalAssessment
        : undefined;
  const arrivedAt = optionalStr(incoming.arrived_at, incoming.arrivedAt);
  const paymentStatus = optionalStr(
    incoming.payment_status,
    incoming.paymentStatus,
  );
  const paymentAmount =
    incoming.payment_amount !== undefined
      ? incoming.payment_amount
      : incoming.paymentAmount;
  const paidAt = optionalStr(incoming.paid_at, incoming.paidAt);

  return {
    ...existing,
    ...(status ? { status } : {}),
    ...(slotStart !== undefined
      ? { slotStart, slot_start: slotStart }
      : {}),
    ...(sessionDate !== undefined
      ? { sessionDate, session_date: sessionDate }
      : {}),
    ...(tokenNumber !== undefined
      ? { tokenNumber, token_number: tokenNumber }
      : {}),
    ...(patientName !== undefined ? { patientName, patient_name: patientName } : {}),
    ...(patientPhone !== undefined
      ? { patientPhone, patient_phone: patientPhone }
      : {}),
    ...(mode ? { mode } : {}),
    ...(channel ? { channel } : {}),
    ...(consultationType !== undefined
      ? { consultationType, consultation_type: consultationType }
      : {}),
    ...(doctorRemarks !== undefined
      ? { doctorRemarks, doctor_remarks: doctorRemarks }
      : {}),
    ...(medicines !== undefined ? { medicines } : {}),
    ...(documents !== undefined ? { documents } : {}),
    ...(disease !== undefined ? { disease } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(clinicalAssessment !== undefined
      ? { clinicalAssessment, clinical_assessment: clinicalAssessment }
      : {}),
    ...(arrivedAt !== undefined ? { arrivedAt, arrived_at: arrivedAt } : {}),
    ...(paymentStatus !== undefined
      ? { paymentStatus, payment_status: paymentStatus }
      : {}),
    ...(paymentAmount !== undefined
      ? { paymentAmount, payment_amount: paymentAmount }
      : {}),
    ...(paidAt !== undefined ? { paidAt, paid_at: paidAt } : {}),
  } as T;
}

/**
 * Apply a live booking event to a list.
 * Returns needsRefresh=true when a create isn't in the list yet (partial payload).
 */
export function applyLiveBookingEvent<T extends { id: string }>(
  prev: T[],
  eventName: string,
  incoming: LiveBookingPayload | undefined,
): { next: T[]; needsRefresh: boolean } {
  if (!incoming?.id) return { next: prev, needsRefresh: true };
  const id = String(incoming.id);
  const idx = prev.findIndex((b) => b.id === id);

  if (idx < 0) {
    // Unknown id — soft-refresh so the patient list stays complete.
    return { next: prev, needsRefresh: true };
  }

  const next = [...prev];
  next[idx] = patchBookingFields(next[idx]!, incoming);
  return { next, needsRefresh: false };
}
