import { BookingStatus } from "@prisma/client";

/** Template chosen by the explicit Send to customer action. */
export type ExplicitClinicLogTemplate = "VISIT_SUMMARY" | "PRESCRIPTION_UPDATE";

/**
 * Closed visits cannot be sent. Open and finished visits both use the
 * prescription PDF on Send to customer — never a text template.
 */
export function explicitClinicLogTemplate(
  status: BookingStatus,
): ExplicitClinicLogTemplate | null {
  if (
    status === BookingStatus.CANCELED ||
    status === BookingStatus.NO_SHOW
  ) {
    return null;
  }
  if (status === BookingStatus.COMPLETED) return "VISIT_SUMMARY";
  return "PRESCRIPTION_UPDATE";
}
