import type { PracticeListItem, ProctoBooking } from "@/lib/types";

const BOOKINGS_TTL_MS = 45_000;
const PRACTICES_TTL_MS = 120_000;

type Entry<T> = { at: number; data: T };

let bookingsCache: Entry<ProctoBooking[]> | null = null;
let practicesCache: Entry<PracticeListItem[]> | null = null;
let patientName: string | null = null;
let patientPhoto: string | null = null;

function fresh<T>(entry: Entry<T> | null, ttl: number): T | null {
  if (!entry) return null;
  if (Date.now() - entry.at > ttl) return null;
  return entry.data;
}

export function getCachedBookings(): ProctoBooking[] | null {
  return fresh(bookingsCache, BOOKINGS_TTL_MS);
}

export function setCachedBookings(data: ProctoBooking[]) {
  bookingsCache = { at: Date.now(), data };
}

export function patchCachedBooking(
  id: string,
  patch: (b: ProctoBooking) => ProctoBooking,
) {
  if (!bookingsCache) return;
  bookingsCache = {
    at: bookingsCache.at,
    data: bookingsCache.data.map((b) => (b.id === id ? patch(b) : b)),
  };
}

export function getCachedPractices(): PracticeListItem[] | null {
  return fresh(practicesCache, PRACTICES_TTL_MS);
}

export function setCachedPractices(data: PracticeListItem[]) {
  practicesCache = { at: Date.now(), data };
}

/** Signed-in patient's display name + photo (Home header); cleared with the session. */
export function getCachedPatientName(): string | null {
  return patientName;
}

export function setCachedPatientName(name: string | null) {
  patientName = name;
}

export function getCachedPatientPhoto(): string | null {
  return patientPhoto;
}

export function setCachedPatientPhoto(uri: string | null) {
  patientPhoto = uri;
}

export function clearDataCache() {
  bookingsCache = null;
  practicesCache = null;
  patientName = null;
  patientPhoto = null;
}
