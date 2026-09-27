import { BookingStatus } from "@prisma/client";

const ARRIVED: BookingStatus[] = [
  BookingStatus.WAITING,
  BookingStatus.IN_PROGRESS,
  BookingStatus.COMPLETED,
];

const NOT_ARRIVED: BookingStatus[] = [
  BookingStatus.SCHEDULED,
  BookingStatus.REQUESTED,
  BookingStatus.ACCEPTED,
  BookingStatus.NO_SHOW,
];

/**
 * `arrivedAt` change for a status move: stamped on the first move into an
 * "at the clinic" status (kept on later moves), cleared when staff move the
 * visit back to a pre-arrival status or mark a no-show.
 */
export function arrivalPatch(
  currentArrivedAt: Date | null | undefined,
  nextStatus: BookingStatus | undefined,
  now: Date = new Date(),
): { arrivedAt: Date | null } | Record<string, never> {
  if (!nextStatus) return {};
  if (ARRIVED.includes(nextStatus)) {
    return currentArrivedAt ? {} : { arrivedAt: now };
  }
  if (NOT_ARRIVED.includes(nextStatus)) {
    return currentArrivedAt ? { arrivedAt: null } : {};
  }
  return {};
}
