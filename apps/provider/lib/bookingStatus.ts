/** Shared booking status filters — mirrors frontend/lib/bookingStatus.ts */

export type QueueStatusFilter =
  | "all"
  | "booked"
  | "accepted"
  | "waiting"
  | "in_appointment"
  | "done";

export function matchesQueueStatusFilter(
  status: string,
  filter: QueueStatusFilter,
): boolean {
  const s = String(status || "").toUpperCase();
  switch (filter) {
    case "booked":
      return false;
    case "accepted":
      return [
        "SCHEDULED",
        "REQUESTED",
        "BOOKED",
        "ACCEPTED",
        "CONFIRMED",
      ].includes(s);
    case "waiting":
      return s === "WAITING" || s === "CHECKED_IN";
    case "in_appointment":
      return s === "IN_PROGRESS";
    case "done":
      return ["COMPLETED", "CANCELED", "CANCELLED", "NO_SHOW"].includes(s);
    default:
      return true;
  }
}

export function queueFilterLabel(
  key: QueueStatusFilter,
  count: number,
): string {
  const titles: Record<QueueStatusFilter, string> = {
    all: "All",
    booked: "Requested",
    accepted: "Accepted",
    waiting: "In waiting",
    in_appointment: "Started",
    done: "Finished",
  };
  return `${titles[key]} (${count})`;
}

export function countQueueStatusFilters(
  statuses: Array<string | null | undefined>,
): Record<QueueStatusFilter, number> {
  const c: Record<QueueStatusFilter, number> = {
    all: statuses.length,
    booked: 0,
    accepted: 0,
    waiting: 0,
    in_appointment: 0,
    done: 0,
  };
  for (const status of statuses) {
    if (matchesQueueStatusFilter(String(status || ""), "booked")) c.booked += 1;
    if (matchesQueueStatusFilter(String(status || ""), "accepted"))
      c.accepted += 1;
    if (matchesQueueStatusFilter(String(status || ""), "waiting"))
      c.waiting += 1;
    if (matchesQueueStatusFilter(String(status || ""), "in_appointment")) {
      c.in_appointment += 1;
    }
    if (matchesQueueStatusFilter(String(status || ""), "done")) c.done += 1;
  }
  return c;
}

export function isFinishedStatus(status: string | null | undefined): boolean {
  return matchesQueueStatusFilter(String(status || ""), "done");
}

type QueueOrderRow = {
  status: string;
  tokenNumber?: number | null;
  slotStart?: string | null;
};

function queueRank(status: string): number {
  if (matchesQueueStatusFilter(status, "in_appointment")) return 0;
  if (matchesQueueStatusFilter(status, "waiting")) return 1;
  return 2;
}

function queuePosition(b: QueueOrderRow): number {
  if (b.slotStart) {
    const t = Date.parse(b.slotStart);
    if (!Number.isNaN(t)) return t;
  }
  return b.tokenNumber ?? Number.MAX_SAFE_INTEGER;
}

/** Day queue: in consultation → waiting → booked (by slot/token); finished split out. */
export function splitDayQueue<T extends QueueOrderRow>(
  rows: T[],
): { active: T[]; finished: T[] } {
  const active = rows
    .filter((b) => !isFinishedStatus(b.status))
    .sort(
      (a, b) =>
        queueRank(a.status) - queueRank(b.status) ||
        queuePosition(a) - queuePosition(b),
    );
  const finished = rows.filter((b) => isFinishedStatus(b.status));
  return { active, finished };
}

export const QUEUE_FILTER_KEYS: QueueStatusFilter[] = [
  "all",
  "accepted",
  "waiting",
  "in_appointment",
  "done",
];
