import type {
  BookingRow,
  PracticeMembership,
  PracticePatient,
} from "@/lib/types";

const MEMBERSHIPS_TTL_MS = 120_000;
const BOOKINGS_TTL_MS = 45_000;
const PATIENTS_TTL_MS = 60_000;

type Entry<T> = { at: number; data: T };

let membershipsCache: Entry<PracticeMembership[]> | null = null;
let practiceIndexCache = 0;
const bookingsByPractice = new Map<string, Entry<BookingRow[]>>();
const patientsByPractice = new Map<string, Entry<PracticePatient[]>>();

function fresh<T>(entry: Entry<T> | null | undefined, ttl: number): T | null {
  if (!entry) return null;
  if (Date.now() - entry.at > ttl) return null;
  return entry.data;
}

export function getCachedMemberships(): PracticeMembership[] | null {
  return fresh(membershipsCache, MEMBERSHIPS_TTL_MS);
}

export function setCachedMemberships(data: PracticeMembership[]) {
  membershipsCache = { at: Date.now(), data };
}

export function getCachedPracticeIndex(): number {
  return practiceIndexCache;
}

export function setCachedPracticeIndex(i: number) {
  practiceIndexCache = Math.max(0, i);
}

export function getCachedBookings(practiceId: string): BookingRow[] | null {
  return fresh(bookingsByPractice.get(practiceId), BOOKINGS_TTL_MS);
}

export function setCachedBookings(practiceId: string, data: BookingRow[]) {
  bookingsByPractice.set(practiceId, { at: Date.now(), data });
}

export function getCachedPatients(practiceId: string): PracticePatient[] | null {
  return fresh(patientsByPractice.get(practiceId), PATIENTS_TTL_MS);
}

export function setCachedPatients(practiceId: string, data: PracticePatient[]) {
  patientsByPractice.set(practiceId, { at: Date.now(), data });
}

/** One-shot handoff from layout bootstrap → PracticeLiveProvider. */
type BootstrapSeed = {
  practiceId: string;
  bookings: BookingRow[];
  patients: PracticePatient[];
  at: number;
};

let bootstrapSeed: BootstrapSeed | null = null;
let bootstrapInFlight = false;
let bootstrapWaiters: Array<(seed: BootstrapSeed | null) => void> = [];

export function beginBootstrapFetch() {
  bootstrapInFlight = true;
}

export function setBootstrapSeed(seed: Omit<BootstrapSeed, "at">) {
  bootstrapSeed = { ...seed, at: Date.now() };
  setCachedBookings(seed.practiceId, seed.bookings);
  setCachedPatients(seed.practiceId, seed.patients);
  bootstrapInFlight = false;
  const ready = bootstrapSeed;
  const waiters = bootstrapWaiters;
  bootstrapWaiters = [];
  for (const w of waiters) w(ready);
}

/** Layout finished bootstrap without a usable seed (logout / empty). */
export function endBootstrapFetch() {
  bootstrapInFlight = false;
  const waiters = bootstrapWaiters;
  bootstrapWaiters = [];
  for (const w of waiters) w(null);
}

export function takeBootstrapSeed(practiceId: string): BootstrapSeed | null {
  if (!bootstrapSeed) return null;
  if (bootstrapSeed.practiceId !== practiceId) return null;
  if (Date.now() - bootstrapSeed.at > 8_000) {
    bootstrapSeed = null;
    return null;
  }
  const out = bootstrapSeed;
  bootstrapSeed = null;
  return out;
}

/** Await layout bootstrap so PracticeLive does not double-fetch the near window. */
export function waitForBootstrapSeed(
  practiceId: string,
  timeoutMs = 12_000,
): Promise<BootstrapSeed | null> {
  const existing = takeBootstrapSeed(practiceId);
  if (existing) return Promise.resolve(existing);
  if (!bootstrapInFlight) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      bootstrapWaiters = bootstrapWaiters.filter((w) => w !== onReady);
      resolve(takeBootstrapSeed(practiceId));
    }, timeoutMs);
    const onReady = (seed: BootstrapSeed | null) => {
      clearTimeout(timer);
      if (seed && seed.practiceId === practiceId) {
        bootstrapSeed = null;
        resolve(seed);
        return;
      }
      resolve(takeBootstrapSeed(practiceId));
    };
    bootstrapWaiters.push(onReady);
  });
}

export function clearProviderDataCache() {
  membershipsCache = null;
  practiceIndexCache = 0;
  bookingsByPractice.clear();
  patientsByPractice.clear();
  bootstrapSeed = null;
  bootstrapInFlight = false;
  bootstrapWaiters = [];
}

/** Near window for first paint; full window filled in by a background expand. */
export function nearBookingRange(now = new Date()) {
  const ymd = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
  const a = new Date(now);
  a.setDate(a.getDate() - 14);
  const b = new Date(now);
  b.setDate(b.getDate() + 45);
  return { from: ymd(a), to: ymd(b) };
}

export function fullBookingRange(now = new Date()) {
  const ymd = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
  const a = new Date(now);
  a.setDate(a.getDate() - 90);
  const b = new Date(now);
  b.setDate(b.getDate() + 90);
  return { from: ymd(a), to: ymd(b) };
}
