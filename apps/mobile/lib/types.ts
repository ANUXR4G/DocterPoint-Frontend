/** Shared booking/practice types for GlucoGuide patient app. */

import { formatPracticeDateTime } from "./practiceTime";

export type ProctoBooking = {
  id: string;
  status: string;
  mode: string;
  channel?: string;
  slotStart?: string | null;
  slot_start?: string | null;
  sessionDate?: string | null;
  session_date?: string | null;
  tokenNumber?: number | null;
  token_number?: number | null;
  disease?: string | null;
  practice?: {
    id?: string;
    name?: string;
    slug?: string;
    specialty?: string | null;
    consultationFee?: number | null;
  };
  location?: { name?: string; city?: string; address?: string };
  provider?: { id?: string; name?: string | null };
  providerName?: string | null;
};

export type ReviewSummary = {
  average: number | null;
  count: number;
};

export type PracticeReview = {
  id: string;
  authorName: string;
  rating: number;
  body: string | null;
  createdAt: string;
};

export type BookingDetail = ProctoBooking & {
  practiceId?: string;
  patientName?: string | null;
  consultationType?: string | null;
  doctorRemarks?: string | null;
  medicines?: { name: string; amount?: string; times?: string[] }[] | null;
  documents?: { name: string; url: string; uploadedAt?: string }[] | null;
  reviewEligibility?: {
    canReview: boolean;
    alreadyReviewed: boolean;
    reason?: string;
  } | null;
};

export type PracticeListItem = {
  id: string;
  name: string;
  slug: string;
  type: string;
  specialty: string | null;
  consultationFee: number | null;
  /** Clinic cover / profile image URL (S3 or absolute). */
  bgSrc?: string | null;
  reviewSummary?: ReviewSummary;
  reviews?: PracticeReview[];
  reviewsEnabled?: boolean;
  locations: { id: string; name: string; city: string; address: string }[];
  members?: {
    userId: string;
    role: string;
    user?: {
      id: string;
      name: string | null;
      /** Doctor/owner avatar URL. */
      imgSrc?: string | null;
    };
  }[];
};

export type PatientProfile = {
  id?: string;
  name?: string | null;
  email?: string | null;
  gender?: string | null;
  address?: string | null;
  contact_number?: string | null;
  contactNumber?: string | null;
  date_of_birth?: string | null;
  dateOfBirth?: string | null;
  profession?: string | null;
  phone?: string | null;
};

export function consultationTypeLabel(value: string | null | undefined): string {
  if (!value) return "";
  return value === "EMERGENCY_WALK_IN" ? "Emergency walk-in" : value;
}

export function bookingWhen(b: ProctoBooking): string {
  const mode = b.mode;
  const token = b.tokenNumber ?? b.token_number;
  const session = b.sessionDate ?? b.session_date;
  const slot = b.slotStart ?? b.slot_start;
  if (mode === "TOKEN_BASED" && token != null) {
    const day = session ? new Date(session).toLocaleDateString() : "";
    return `Token #${token}${day ? ` · ${day}` : ""}`;
  }
  if (slot) {
    return formatPracticeDateTime(slot);
  }
  return "Scheduled";
}

export function isUpcomingStatus(status: string): boolean {
  return [
    "SCHEDULED",
    "REQUESTED",
    "ACCEPTED",
    "CONFIRMED",
    "WAITING",
    "IN_PROGRESS",
    "BOOKED",
  ].includes(status.toUpperCase());
}

export function isPastStatus(status: string): boolean {
  return ["COMPLETED", "CANCELED", "CANCELLED", "NO_SHOW"].includes(
    status.toUpperCase(),
  );
}
