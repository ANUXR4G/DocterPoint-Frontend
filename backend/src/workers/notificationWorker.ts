import { Worker } from "bullmq";
import { settings } from "../config/index.js";
import { prisma } from "../db/prisma.js";
import { enqueueNotificationEvent } from "./notificationQueue.js";
import { processNotificationEvent } from "./notificationSend.js";

const connection = {
  host: settings.redisHost,
  port: settings.redisPort,
  password: settings.redisPassword || undefined,
};

const worker = new Worker(
  "notification-tasks",
  async (job) => {
    const { notificationId } = job.data as { notificationId: string };
    return processNotificationEvent(notificationId);
  },
  { connection },
);

worker.on("completed", (job) => {
  console.log(`Notification job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`Notification job ${job?.id} failed:`, err.message);
});

/** Re-queue DB rows stuck PENDING (e.g. API ran without worker). */
async function requeuePendingNotifications() {
  const pending = await prisma.notificationEvent.findMany({
    where: { status: "PENDING" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  if (!pending.length) return;
  console.log(
    `[notification] re-queueing ${pending.length} PENDING WhatsApp notification(s)`,
  );
  for (const row of pending) {
    await enqueueNotificationEvent(row.id);
  }
}

async function reminderAlreadySent(
  bookingId: string,
  templateKey: "REMINDER" | "REMINDER_24H",
): Promise<boolean> {
  const exists = await prisma.notificationEvent.findFirst({
    where: {
      bookingId,
      type: "REMINDER",
      status: { in: ["PENDING", "SENT"] },
      payload: { path: ["templateKey"], equals: templateKey },
    },
    select: { id: true },
  });
  return Boolean(exists);
}

/**
 * Poll for due reminders every 5 minutes:
 * - ~24h before timed slots (and day-before for token visits)
 * - ~30 min before timed slots
 * - morning-of for token-day visits
 */
async function scheduleReminders() {
  const now = new Date();
  const { NotificationService } = await import(
    "../services/procto/notification.service.js"
  );

  // —— 24 hours before (timed slots): 23h–25h window ——
  const in24hStart = new Date(now.getTime() + 23 * 60 * 60_000);
  const in24hEnd = new Date(now.getTime() + 25 * 60 * 60_000);
  const upcoming24h = await prisma.practiceBooking.findMany({
    where: {
      status: { in: ["SCHEDULED", "REQUESTED", "ACCEPTED"] },
      slotStart: { gte: in24hStart, lte: in24hEnd },
    },
    take: 40,
  });

  for (const booking of upcoming24h) {
    if (await reminderAlreadySent(booking.id, "REMINDER_24H")) continue;
    await NotificationService.enqueueReminder(booking.id, { kind: "24h" });
  }

  // Catch-up: slots 12h–23h away that missed the night window (still no 24h reminder).
  const catchUpStart = new Date(now.getTime() + 12 * 60 * 60_000);
  const catchUpEnd = new Date(now.getTime() + 23 * 60 * 60_000);
  const catchUp24h = await prisma.practiceBooking.findMany({
    where: {
      status: { in: ["SCHEDULED", "REQUESTED", "ACCEPTED"] },
      slotStart: { gte: catchUpStart, lte: catchUpEnd },
    },
    take: 40,
  });
  for (const booking of catchUp24h) {
    if (await reminderAlreadySent(booking.id, "REMINDER_24H")) continue;
    await NotificationService.enqueueReminder(booking.id, { kind: "24h" });
  }

  // —— ~30 minutes before timed slots ——
  const soon = new Date(now.getTime() + 30 * 60_000);
  const upcomingSoon = await prisma.practiceBooking.findMany({
    where: {
      status: { in: ["SCHEDULED", "REQUESTED", "ACCEPTED"] },
      slotStart: { gte: now, lte: soon },
    },
    take: 20,
  });

  for (const booking of upcomingSoon) {
    if (await reminderAlreadySent(booking.id, "REMINDER")) continue;
    await NotificationService.enqueueReminder(booking.id, { kind: "soon" });
  }

  const { formatLocalDate, parseLocalDate, startOfLocalDay } = await import(
    "../services/procto/slotEngine.js"
  );
  const todayStr = formatLocalDate(now);
  const dayStart = startOfLocalDay(parseLocalDate(todayStr));
  const tomorrowStart = startOfLocalDay(
    parseLocalDate(
      formatLocalDate(new Date(dayStart.getTime() + 36 * 60 * 60_000)),
    ),
  );
  const hour = now.getHours();

  // —— Token visits: day-before reminder (24h-ish) during daytime ——
  if (hour >= 8 && hour < 21) {
    const tokenTomorrow = await prisma.practiceBooking.findMany({
      where: {
        status: { in: ["SCHEDULED", "REQUESTED", "ACCEPTED"] },
        mode: "TOKEN_BASED",
        sessionDate: tomorrowStart,
      },
      take: 40,
    });

    for (const booking of tokenTomorrow) {
      if (await reminderAlreadySent(booking.id, "REMINDER_24H")) continue;
      await NotificationService.enqueueReminder(booking.id, { kind: "24h" });
    }
  }

  // —— Token visits: morning-of reminder ——
  if (hour >= 6 && hour < 12) {
    const tokenDay = await prisma.practiceBooking.findMany({
      where: {
        status: { in: ["SCHEDULED", "REQUESTED", "ACCEPTED"] },
        mode: "TOKEN_BASED",
        sessionDate: dayStart,
      },
      take: 40,
    });

    for (const booking of tokenDay) {
      if (await reminderAlreadySent(booking.id, "REMINDER")) continue;
      await NotificationService.enqueueReminder(booking.id, { kind: "soon" });
    }
  }
}

setInterval(() => {
  void scheduleReminders();
}, 5 * 60_000);

void scheduleReminders();
void requeuePendingNotifications();

console.log("BullMQ notification worker started (incl. 24h booking reminders)");
