import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ScheduleMode } from "@prisma/client";
import {
  bookingReferenceId,
  buildCalendarInvite,
  buildGoogleCalendarUrl,
  buildGoogleMapsUrl,
  buildIcsContent,
  toUtcStamp,
} from "./bookingCalendar.js";
import { BotPrompts } from "./whatsapp.templates.js";

describe("bookingCalendar", () => {
  const base = {
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    mode: ScheduleMode.TIME_BASED,
    slotStart: new Date("2026-09-28T07:00:00.000Z"),
    patientName: "Satheesh Kumar",
    practiceName: "Main Clinic",
    providerName: "Dr. Priya Nair",
    location: {
      name: "Main Clinic",
      address: "Corniche Road",
      city: "Abu Dhabi",
    },
  };

  it("bookingReferenceId formats GG-XXXXXXXX", () => {
    assert.equal(bookingReferenceId(base.id), "GG-A1B2C3D4");
  });

  it("buildIcsContent includes VEVENT and reference", () => {
    const ics = buildIcsContent(base);
    assert.match(ics, /BEGIN:VCALENDAR/);
    assert.match(ics, /BEGIN:VEVENT/);
    assert.match(ics, /SUMMARY:Main Clinic/);
    assert.match(ics, /Booking reference: GG-A1B2C3D4/);
    assert.match(ics, /LOCATION:Main Clinic/);
    assert.match(ics, /DTSTART:/);
    assert.match(ics, /END:VCALENDAR/);
  });

  it("buildGoogleCalendarUrl is a render TEMPLATE link", () => {
    const url = buildGoogleCalendarUrl(base);
    assert.match(url, /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
    assert.match(url, /action=TEMPLATE/);
    assert.match(url, /dates=/);
    const start = toUtcStamp(base.slotStart!);
    assert.ok(url.includes(start));
  });

  it("buildGoogleMapsUrl uses address query", () => {
    const url = buildGoogleMapsUrl(base.location);
    assert.ok(url);
    assert.match(url!, /google\.com\/maps\/search/);
    assert.match(url!, /Abu/);
  });

  it("buildGoogleMapsUrl prefers coordinates when present", () => {
    const url = buildGoogleMapsUrl({
      ...base.location,
      geometry: { type: "Point", coordinates: [54.37, 24.45] },
    });
    assert.equal(
      url,
      "https://www.google.com/maps/search/?api=1&query=24.45,54.37",
    );
  });

  it("buildCalendarInvite returns ref + links + ics body", () => {
    const invite = buildCalendarInvite(base);
    assert.equal(invite.referenceId, "GG-A1B2C3D4");
    assert.match(invite.icsFilename, /GG-A1B2C3D4\.ics$/);
    assert.match(invite.googleCalendarUrl, /calendar\.google/);
    assert.ok(invite.mapsUrl);
    assert.match(invite.icsUrl, /\/calendar\.ics$/);
    assert.match(invite.icsContent, /BEGIN:VEVENT/);
  });
});

describe("BotPrompts.bookingConfirmed with calendar invite", () => {
  it("includes reference, Google Calendar, .ics, and Maps links", () => {
    const reply = BotPrompts.bookingConfirmed(
      "Main Clinic",
      "Sept 28, 2026 at 11:00 AM",
      "en",
      {
        referenceId: "GG-A1B2C3D4",
        googleCalendarUrl:
          "https://calendar.google.com/calendar/render?action=TEMPLATE",
        icsUrl:
          "http://localhost:3001/api/v1/procto/bookings/a1b2c3d4-e5f6-7890-abcd-ef1234567890/calendar.ics",
        mapsUrl: "https://www.google.com/maps/search/?api=1&query=Abu%20Dhabi",
      },
    );
    assert.match(reply, /Booking confirmed/i);
    assert.match(reply, /Booking reference/i);
    assert.match(reply, /`GG-A1B2C3D4`/);
    assert.match(reply, /Google Calendar/i);
    assert.match(reply, /\.ics/);
    assert.match(reply, /Google Maps/i);
  });
});
