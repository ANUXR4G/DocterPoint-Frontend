/** Pure helpers for booking confirm-step summary (audit F1). */

export type BookingReviewSnapshot = {
  mode: "TIME_BASED" | "TOKEN_BASED"
  /** ISO date YYYY-MM-DD */
  dateIso: string
  /** ISO slot start when time-based */
  slotStartIso: string | null
  dateLabel: string
  timeLabel: string | null
  modeLabel: string
  clinicName: string
  providerName: string
  locationLabel: string
  feeLabel: string | null
}

export function formatBookingDateLabel(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dateIso
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export function formatBookingTimeLabel(slotStartIso: string): string {
  const d = new Date(slotStartIso)
  if (Number.isNaN(d.getTime())) return slotStartIso
  return d.toLocaleTimeString("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

export function buildBookingReviewSnapshot(input: {
  mode: "TIME_BASED" | "TOKEN_BASED"
  dateIso: string
  selectedSlot: string | null
  tokenNext?: number | null
  tokenSessionStart?: string | null
  tokenSessionEnd?: string | null
  clinicName: string
  providerName: string
  locationName: string
  locationCity: string
  locationAddress?: string | null
  consultationFee?: number | null
}): BookingReviewSnapshot | null {
  if (input.mode === "TIME_BASED") {
    if (!input.selectedSlot) return null
    const slotDate = new Date(input.selectedSlot)
    const dateIso = Number.isNaN(slotDate.getTime())
      ? input.dateIso
      : [
          slotDate.getFullYear(),
          String(slotDate.getMonth() + 1).padStart(2, "0"),
          String(slotDate.getDate()).padStart(2, "0"),
        ].join("-")

    return {
      mode: "TIME_BASED",
      dateIso,
      slotStartIso: input.selectedSlot,
      dateLabel: formatBookingDateLabel(dateIso),
      timeLabel: formatBookingTimeLabel(input.selectedSlot),
      modeLabel: "Time-based visit",
      clinicName: input.clinicName,
      providerName: input.providerName,
      locationLabel: [
        input.locationName,
        input.locationCity,
        input.locationAddress,
      ]
        .filter(Boolean)
        .join(" · "),
      feeLabel:
        input.consultationFee != null ? `₹${input.consultationFee}` : null,
    }
  }

  const tokenBits = [
    input.tokenNext != null ? `next token #${input.tokenNext}` : null,
    input.tokenSessionStart && input.tokenSessionEnd
      ? `${input.tokenSessionStart}–${input.tokenSessionEnd}`
      : null,
  ].filter(Boolean)

  return {
    mode: "TOKEN_BASED",
    dateIso: input.dateIso,
    slotStartIso: null,
    dateLabel: formatBookingDateLabel(input.dateIso),
    timeLabel: null,
    modeLabel: tokenBits.length
      ? `Token queue · ${tokenBits.join(" · ")}`
      : "Token queue",
    clinicName: input.clinicName,
    providerName: input.providerName,
    locationLabel: [
      input.locationName,
      input.locationCity,
      input.locationAddress,
    ]
      .filter(Boolean)
      .join(" · "),
    feeLabel:
      input.consultationFee != null ? `₹${input.consultationFee}` : null,
  }
}

/** Regression: selected slot must surface date + time on review. */
export function assertReviewShowsSelectedSlot(
  snapshot: BookingReviewSnapshot | null,
  selectedSlotIso: string,
): asserts snapshot is BookingReviewSnapshot {
  if (!snapshot) {
    throw new Error("Review snapshot missing — cannot confirm without a slot.")
  }
  if (snapshot.mode !== "TIME_BASED") {
    throw new Error("Expected time-based review snapshot.")
  }
  if (snapshot.slotStartIso !== selectedSlotIso) {
    throw new Error(
      `Review slot mismatch: expected ${selectedSlotIso}, got ${snapshot.slotStartIso}`,
    )
  }
  if (!snapshot.dateLabel?.trim()) {
    throw new Error("Review is missing date label.")
  }
  if (!snapshot.timeLabel?.trim()) {
    throw new Error("Review is missing time label.")
  }
}
