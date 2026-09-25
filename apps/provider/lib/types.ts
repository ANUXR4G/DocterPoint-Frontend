import { formatPracticeDateTime, practiceDateIso } from "./practiceTime";

export type PracticeMembership = {
  role: string;
  userId: string;
  practice: {
    id: string;
    name: string;
    slug: string;
    specialty?: string | null;
    type?: string;
    locations: Array<{ id: string; name: string; city: string }>;
    members: Array<{
      role: string;
      userId: string;
      user: { id: string; name: string | null };
    }>;
  };
};

export type VisitDocument = {
  name: string;
  url: string;
  uploadedAt?: string;
};

export type BookingRow = {
  id: string;
  status: string;
  mode: string;
  channel?: string;
  patientPhone: string;
  patientName?: string | null;
  patientId?: string | null;
  tokenNumber?: number | null;
  slotStart?: string | null;
  sessionDate?: string | null;
  notes?: string | null;
  disease?: string | null;
  consultationType?: string | null;
  doctorRemarks?: string | null;
  medicines?: Array<{ name: string; amount?: string; times?: string[] }> | null;
  documents?: VisitDocument[] | null;
  provider?: { id?: string; name?: string | null } | null;
  practice?: { id?: string; name?: string; specialty?: string | null } | null;
  location?: { name?: string; address?: string; city?: string } | null;
  patient?: {
    id?: string | null;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    gender?: string | null;
    address?: string | null;
    imgSrc?: string | null;
    profession?: string | null;
    dateOfBirth?: string | null;
    age?: number | null;
    contactNumber?: string | null;
    mrn?: string | null;
  } | null;
};

export type PracticePatient = {
  phone: string;
  bookedViaPhone?: string | null;
  name: string | null;
  patientId: string | null;
  mrn?: string | null;
  relationship?: string | null;
  email?: string | null;
  gender?: string | null;
  address?: string | null;
  imgSrc?: string | null;
  profession?: string | null;
  dateOfBirth?: string | null;
  age?: number | null;
  bookingCount: number;
  lastVisitAt: string | null;
  lastStatus: string | null;
  providerNames?: string[];
  /** Canonical API field from PracticeService.listPatients */
  recentBookings?: BookingRow[];
  /** Legacy alias — prefer recentBookings */
  recent?: BookingRow[];
};

export type ScheduleRow = {
  id: string;
  dayOfWeek: number;
  mode: string;
  locationId?: string;
  location?: { id?: string; name?: string } | null;
  slotIntervalMin?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  maxPerSlot?: number | null;
  sessionStart?: string | null;
  sessionEnd?: string | null;
  maxTokens?: number | null;
  isActive: boolean;
};

export type OverrideRow = {
  id: string;
  type: string;
  date: string;
  reason?: string | null;
  maxTokens?: number | null;
  startTime?: string | null;
  endTime?: string | null;
};

export const BOOKING_STATUSES = [
  "SCHEDULED",
  "WAITING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELED",
  "NO_SHOW",
] as const;

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function whenLabel(b: BookingRow) {
  if (b.mode === "TOKEN_BASED") {
    return `Token #${b.tokenNumber ?? "?"} · ${b.sessionDate?.slice(0, 10) ?? ""}`;
  }
  if (b.slotStart) {
    return formatPracticeDateTime(b.slotStart);
  }
  return "—";
}

export function nextActions(status: string): Array<{ status: string; label: string }> {
  switch (String(status || "").toUpperCase()) {
    case "SCHEDULED":
    case "REQUESTED":
    case "BOOKED":
    case "ACCEPTED":
    case "CONFIRMED":
      return [
        { status: "WAITING", label: "Arrived" },
        { status: "NO_SHOW", label: "No-show" },
        { status: "CANCELED", label: "Cancel" },
      ];
    case "WAITING":
    case "CHECKED_IN":
      return [
        { status: "IN_PROGRESS", label: "Start" },
        { status: "NO_SHOW", label: "No-show" },
        { status: "CANCELED", label: "Cancel" },
      ];
    case "IN_PROGRESS":
      return [
        { status: "COMPLETED", label: "Finish" },
        { status: "NO_SHOW", label: "No-show" },
      ];
    case "COMPLETED":
    case "CANCELED":
    case "CANCELLED":
    case "NO_SHOW":
      return [];
    default:
      return [];
  }
}

export function ymd(d: Date) {
  return practiceDateIso(d) ?? "";
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
