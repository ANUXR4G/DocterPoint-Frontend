/**
 * Booking confirmation helpers: reference ID, Google Calendar, Maps, and .ics.
 */
import { ScheduleMode } from "@prisma/client";
import { publicWebOrigin } from "../../config/index.js";

export type CalendarLocation = {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  geometry?: unknown;
};

export type CalendarBookingInput = {
  id: string;
  mode: ScheduleMode | string;
  slotStart?: Date | null;
  sessionDate?: Date | null;
  tokenNumber?: number | null;
  patientName?: string | null;
  practiceName: string;
  providerName?: string | null;
  location: CalendarLocation;
  /** Visit length in minutes (time-based). Default 30. */
  durationMinutes?: number;
};

/** Human-facing booking reference (e.g. GG-A1B2C3D4). */
export function bookingReferenceId(bookingId: string): string {
  const hex = bookingId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `GG-${hex || "UNKNOWN"}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** ICS / Google Calendar UTC stamp: YYYYMMDDTHHMMSSZ */
export function toUtcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function locationQuery(loc: CalendarLocation): string {
  const parts = [
    loc.name?.trim(),
    loc.address?.trim(),
    loc.city?.trim(),
  ].filter(Boolean) as string[];
  return parts.join(", ");
}

function coordsFromGeometry(
  geometry: unknown,
): { lat: number; lng: number } | null {
  if (!geometry || typeof geometry !== "object") return null;
  const g = geometry as {
    type?: string;
    coordinates?: unknown;
    lat?: unknown;
    lng?: unknown;
    latitude?: unknown;
    longitude?: unknown;
  };
  if (
    g.type === "Point" &&
    Array.isArray(g.coordinates) &&
    g.coordinates.length >= 2
  ) {
    const lng = Number(g.coordinates[0]);
    const lat = Number(g.coordinates[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  const lat = Number(g.lat ?? g.latitude);
  const lng = Number(g.lng ?? g.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

export function resolveEventWindow(input: CalendarBookingInput): {
  start: Date;
  end: Date;
  title: string;
  description: string;
} {
  const doctor = (input.providerName || "Doctor").trim();
  const patient = (input.patientName || "Patient").trim();
  const ref = bookingReferenceId(input.id);
  const title = `${input.practiceName} — ${doctor}`;
  const duration = Math.max(15, Math.min(240, input.durationMinutes ?? 30));

  if (input.mode === ScheduleMode.TOKEN_BASED || input.mode === "TOKEN_BASED") {
    const iso =
      input.sessionDate instanceof Date && !Number.isNaN(input.sessionDate.getTime())
        ? input.sessionDate.toISOString().slice(0, 10)
        : input.sessionDate
          ? String(input.sessionDate).slice(0, 10)
          : new Date().toISOString().slice(0, 10);
    const start = new Date(`${iso}T09:00:00`);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    return {
      start,
      end,
      title,
      description:
        `Booking reference: ${ref}\n` +
        `Patient: ${patient}\n` +
        `Token #${input.tokenNumber ?? "?"}\n` +
        `Clinic: ${input.practiceName}`,
    };
  }

  const start = input.slotStart ? new Date(input.slotStart) : new Date();
  const end = new Date(start.getTime() + duration * 60 * 1000);
  return {
    start,
    end,
    title,
    description:
      `Booking reference: ${ref}\n` +
      `Patient: ${patient}\n` +
      `Doctor: ${doctor}\n` +
      `Clinic: ${input.practiceName}`,
  };
}

export function buildIcsContent(input: CalendarBookingInput): string {
  const { start, end, title, description } = resolveEventWindow(input);
  const loc = locationQuery(input.location);
  const uid = `${input.id}@glucoguide`;
  const stamp = toUtcStamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GlucoGuide//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toUtcStamp(start)}`,
    `DTEND:${toUtcStamp(end)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    loc ? `LOCATION:${escapeIcsText(loc)}` : null,
    `URL:${escapeIcsText(`${publicWebOrigin()}/patient/dashboard`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean) as string[];
  return `${lines.join("\r\n")}\r\n`;
}

export function buildGoogleCalendarUrl(input: CalendarBookingInput): string {
  const { start, end, title, description } = resolveEventWindow(input);
  const loc = locationQuery(input.location);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toUtcStamp(start)}/${toUtcStamp(end)}`,
    details: description,
  });
  if (loc) params.set("location", loc);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildGoogleMapsUrl(loc: CalendarLocation): string | null {
  const coords = coordsFromGeometry(loc.geometry);
  if (coords) {
    return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
  }
  const q = locationQuery(loc);
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Public API origin for ICS downloads (phones must not get localhost). */
export function publicApiOrigin(): string {
  const override = (process.env.PUBLIC_API_ORIGIN ?? "").trim().replace(/\/$/, "");
  if (override) return override;
  const railway =
    (process.env.RAILWAY_PUBLIC_DOMAIN ?? "").trim() ||
    (process.env.RAILWAY_STATIC_URL ?? "").trim();
  if (railway) {
    return railway.startsWith("http") ? railway.replace(/\/$/, "") : `https://${railway}`;
  }
  // Fall back to web origin + /api proxy is uncommon; prefer known API host env.
  const apiUrl = (process.env.API_PUBLIC_URL ?? process.env.BACKEND_PUBLIC_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (apiUrl) return apiUrl;
  // Local demos — link still works on same machine; phones need PUBLIC_API_ORIGIN.
  return `http://localhost:${process.env.PORT ?? 3001}`;
}

export function buildIcsDownloadUrl(bookingId: string): string {
  return `${publicApiOrigin()}/api/v1/procto/bookings/${bookingId}/calendar.ics`;
}

export function buildCalendarInvite(input: CalendarBookingInput): {
  referenceId: string;
  icsContent: string;
  icsFilename: string;
  googleCalendarUrl: string;
  mapsUrl: string | null;
  icsUrl: string;
} {
  const referenceId = bookingReferenceId(input.id);
  return {
    referenceId,
    icsContent: buildIcsContent(input),
    icsFilename: `appointment-${referenceId}.ics`,
    googleCalendarUrl: buildGoogleCalendarUrl(input),
    mapsUrl: buildGoogleMapsUrl(input.location),
    icsUrl: buildIcsDownloadUrl(input.id),
  };
}
