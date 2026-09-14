import { socketManager } from "../../core/socket.js";

export type ProctoLiveEvent =
  | { event: "booking_created"; booking: Record<string, unknown> }
  | { event: "booking_updated"; booking: Record<string, unknown> }
  | {
      event: "conversation_updated";
      conversation: Record<string, unknown>;
    };

export function proctoRoomId(practiceId: string): string {
  return `${practiceId}_PROCTO`;
}

export function patientRoomId(userId: string): string {
  return `${userId}_PATIENT`;
}

export function serializeBooking(booking: {
  id: string;
  practiceId: string;
  locationId: string;
  providerId: string;
  patientId?: string | null;
  patientPhone: string;
  patientName: string | null;
  mode: string;
  status: string;
  channel: string;
  slotStart: Date | null;
  slotEnd: Date | null;
  tokenNumber: number | null;
  sessionDate: Date | null;
  consultationType: string | null;
  doctorRemarks?: string | null;
  medicines?: unknown;
  documents?: unknown;
  createdAt: Date;
  updatedAt: Date;
}): Record<string, unknown> {
  return {
    id: booking.id,
    practice_id: booking.practiceId,
    location_id: booking.locationId,
    provider_id: booking.providerId,
    patient_id: booking.patientId ?? null,
    patient_phone: booking.patientPhone,
    patient_name: booking.patientName,
    mode: booking.mode,
    status: booking.status,
    channel: booking.channel,
    slot_start: booking.slotStart?.toISOString() ?? null,
    slot_end: booking.slotEnd?.toISOString() ?? null,
    token_number: booking.tokenNumber,
    session_date: booking.sessionDate?.toISOString().slice(0, 10) ?? null,
    consultation_type: booking.consultationType,
    doctor_remarks: booking.doctorRemarks ?? null,
    medicines: booking.medicines ?? null,
    documents: booking.documents ?? null,
    created_at: booking.createdAt.toISOString(),
    updated_at: booking.updatedAt.toISOString(),
  };
}

export async function broadcastProctoEvent(
  practiceId: string,
  payload: ProctoLiveEvent,
  patientId?: string | null,
): Promise<void> {
  const body = JSON.stringify(payload);
  await socketManager.broadcastToRoom(proctoRoomId(practiceId), body);
  if (patientId) {
    await socketManager.broadcastToRoom(patientRoomId(patientId), body);
  }
}

/** @deprecated Use ProctoLiveEvent */
export type ProctoBookingEvent = Extract<
  ProctoLiveEvent,
  { event: "booking_created" | "booking_updated" }
>;
