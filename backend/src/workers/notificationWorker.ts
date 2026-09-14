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

/** Poll for due reminders every 5 minutes (slot ~30 min + token-day morning). */
async function scheduleReminders() {
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 60_000);
  const { NotificationService } = await import(
    "../services/procto/notification.service.js"
  );

  const upcoming = await prisma.practiceBooking.findMany({
    where: {
      status: { in: ["SCHEDULED", "REQUESTED", "ACCEPTED"] },
      slotStart: { gte: now, lte: soon },
    },
    take: 20,
  });

  for (const booking of upcoming) {
    const exists = await prisma.notificationEvent.findFirst({
      where: {
        bookingId: booking.id,
        type: "REMINDER",
        status: { in: ["PENDING", "SENT"] },
      },
    });
    if (exists) continue;
    await NotificationService.enqueueReminder(booking.id);
  }

  const { formatLocalDate, parseLocalDate, startOfLocalDay } = await import(
    "../services/procto/slotEngine.js"
  );
  const todayStr = formatLocalDate(now);
  const dayStart = startOfLocalDay(parseLocalDate(todayStr));
  const hour = now.getHours();
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
      const exists = await prisma.notificationEvent.findFirst({
        where: {
          bookingId: booking.id,
          type: "REMINDER",
          status: { in: ["PENDING", "SENT"] },
        },
      });
      if (exists) continue;
      await NotificationService.enqueueReminder(booking.id);
    }
  }
}

setInterval(() => {
  void scheduleReminders();
}, 5 * 60_000);

void scheduleReminders();
void requeuePendingNotifications();

console.log("BullMQ notification worker started");
