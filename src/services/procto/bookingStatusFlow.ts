import { BookingStatus } from "@prisma/client";
import { AppError } from "../../core/response.js";

const PRE_ARRIVAL = new Set<BookingStatus>([
  BookingStatus.SCHEDULED,
  BookingStatus.REQUESTED,
  BookingStatus.ACCEPTED,
]);

const ARRIVED = new Set<BookingStatus>([BookingStatus.WAITING]);

/**
 * Queue / status endpoint moves.
 * Started consultations cannot be canceled or marked no-show here — finish
 * goes through the visit page so remarks and medicines are saved with it.
 */
export function assertVisitStatusMove(
  from: BookingStatus,
  to: BookingStatus,
  via: "status" | "visit",
): void {
  if (from === to) return;

  if (from === BookingStatus.COMPLETED) {
    throw new AppError(400, "completed appointments cannot be canceled or changed.");
  }
  if (from === BookingStatus.CANCELED || from === BookingStatus.NO_SHOW) {
    throw new AppError(400, "this appointment is closed and cannot be changed.");
  }

  if (to === BookingStatus.COMPLETED) {
    if (via === "visit") return;
    throw new AppError(
      400,
      "Finish the appointment from the visit page (it saves remarks and medicines with it).",
    );
  }

  if (PRE_ARRIVAL.has(from)) {
    if (
      to === BookingStatus.WAITING ||
      to === BookingStatus.NO_SHOW ||
      to === BookingStatus.CANCELED
    ) {
      return;
    }
    throw new AppError(
      400,
      "Mark the patient as arrived before starting the consultation.",
    );
  }

  if (ARRIVED.has(from)) {
    if (
      to === BookingStatus.IN_PROGRESS ||
      to === BookingStatus.NO_SHOW ||
      to === BookingStatus.CANCELED
    ) {
      return;
    }
    throw new AppError(400, "This status change is not allowed from In waiting.");
  }

  if (from === BookingStatus.IN_PROGRESS) {
    throw new AppError(
      400,
      "A started consultation can only be finished from the visit page.",
    );
  }

  throw new AppError(400, "This status change is not allowed.");
}
