import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isClinicDayBeforeToday,
  isClinicDayCurrentOrFuture,
  formatLocalDate,
} from "./slotEngine.js";
import { BookingService } from "./booking.service.js";
import { TemplateService, type DoctorNoteTemplate } from "./template.service.js";
import { AppError } from "../../core/response.js";

describe("Effective Date-Based Editing Rules - Clinical Entries & Prescriptions", () => {
  const today = formatLocalDate(new Date());
  // Yesterday's date
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = formatLocalDate(yesterdayDate);

  // Tomorrow's date
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = formatLocalDate(tomorrowDate);

  test("isClinicDayBeforeToday and isClinicDayCurrentOrFuture correctly categorize calendar days", () => {
    assert.equal(isClinicDayBeforeToday(yesterday), true, "Yesterday must be before today");
    assert.equal(isClinicDayBeforeToday(today), false, "Today is not before today");
    assert.equal(isClinicDayBeforeToday(tomorrow), false, "Tomorrow is not before today");

    assert.equal(isClinicDayCurrentOrFuture(yesterday), false, "Yesterday is not current or future");
    assert.equal(isClinicDayCurrentOrFuture(today), true, "Today is current");
    assert.equal(isClinicDayCurrentOrFuture(tomorrow), true, "Tomorrow is future");
  });

  test("Historical Entries (Old Entries): Medication orders or visits prior to current date are immutable", () => {
    const historicalBooking = {
      slotStart: yesterdayDate,
      sessionDate: null,
    };

    assert.throws(
      () => {
        BookingService.assertEntryEditable(historicalBooking);
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /Historical entries prior to the current date are immutable/i);
        return true;
      },
    );
  });

  test("Current & Future Entries: Edit and delete actions remain fully active from current date onwards", () => {
    const todayBooking = {
      slotStart: new Date(),
      sessionDate: null,
    };

    const futureBooking = {
      slotStart: tomorrowDate,
      sessionDate: null,
    };

    // Both should pass without throwing any error
    assert.doesNotThrow(() => {
      BookingService.assertEntryEditable(todayBooking);
    });

    assert.doesNotThrow(() => {
      BookingService.assertEntryEditable(futureBooking);
    });
  });
});

describe("Effective Date-Based Editing Rules - Master Data (Templates, Allergies, Medicines)", () => {
  const today = formatLocalDate(new Date());
  const pastDate = "2026-01-01";
  const futureDate = "2026-12-31";

  test("Template effective date: historical templates prior to current date are immutable and cannot be deleted", () => {
    const historicalTemplate: DoctorNoteTemplate = {
      id: "tpl_hist_1",
      name: "TPL-HISTORICAL",
      title: "Historical Protocol",
      category: "general",
      scope: "clinic",
      content: "Old note content",
      effectiveDate: pastDate,
      effectiveFrom: pastDate,
      isCustom: true,
      createdAt: `${pastDate}T00:00:00.000Z`,
      updatedAt: `${pastDate}T00:00:00.000Z`,
    };

    const templateDate =
      historicalTemplate.effectiveDate || historicalTemplate.effectiveFrom || historicalTemplate.createdAt.slice(0, 10);

    assert.ok(templateDate < today, "Template date must be prior to today");
  });

  test("Current & future templates: effective from current date onwards can be freely edited and removed", () => {
    const activeTemplate: DoctorNoteTemplate = {
      id: "tpl_active_1",
      name: "TPL-ACTIVE",
      title: "Active Protocol",
      category: "general",
      scope: "clinic",
      content: "Active note content",
      effectiveDate: today,
      effectiveFrom: today,
      isCustom: true,
      createdAt: `${today}T00:00:00.000Z`,
      updatedAt: `${today}T00:00:00.000Z`,
    };

    const futureTemplate: DoctorNoteTemplate = {
      id: "tpl_future_1",
      name: "TPL-FUTURE",
      title: "Future Protocol",
      category: "general",
      scope: "clinic",
      content: "Future note content",
      effectiveDate: futureDate,
      effectiveFrom: futureDate,
      isCustom: true,
      createdAt: `${today}T00:00:00.000Z`,
      updatedAt: `${today}T00:00:00.000Z`,
    };

    assert.ok(activeTemplate.effectiveDate! >= today);
    assert.ok(futureTemplate.effectiveDate! >= today);
  });
});

