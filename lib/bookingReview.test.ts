/**
 * Regression for audit F1: slot selection → review summary must include date + time.
 * Run: npx tsx lib/bookingReview.test.ts  (from frontend/)
 */
import {
  assertReviewShowsSelectedSlot,
  buildBookingReviewSnapshot,
  formatBookingTimeLabel,
} from "./bookingReview"

const selectedSlot = "2026-08-26T15:45:00.000Z"

const snapshot = buildBookingReviewSnapshot({
  mode: "TIME_BASED",
  dateIso: "2026-08-26",
  selectedSlot,
  clinicName: "Dr. Ananya Sharma Clinic",
  providerName: "Dr. Ananya Sharma",
  locationName: "Main",
  locationCity: "Gulshan",
  consultationFee: 800,
})

assertReviewShowsSelectedSlot(snapshot, selectedSlot)

if (!snapshot!.dateLabel.toLowerCase().includes("2026")) {
  throw new Error(`Date label should include year: ${snapshot!.dateLabel}`)
}

const time = formatBookingTimeLabel(selectedSlot)
if (!/\d{1,2}:\d{2}/.test(time)) {
  throw new Error(`Time label malformed: ${time}`)
}

if (snapshot!.timeLabel !== time) {
  throw new Error("Snapshot timeLabel must match formatBookingTimeLabel")
}

console.log("ok: booking review shows selected date/time", {
  dateLabel: snapshot!.dateLabel,
  timeLabel: snapshot!.timeLabel,
})
