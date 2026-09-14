import { Queue } from "bullmq";
import { settings } from "../config/index.js";
import { Redis } from "ioredis";

const connection = new Redis({
  host: settings.redisHost,
  port: settings.redisPort,
  password: settings.redisPassword || undefined,
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
  connectTimeout: 1000,
  lazyConnect: true,
  retryStrategy: () => null,
});

connection.on("error", () => {
  /* Redis optional for local booking flow */
});

let queue: Queue | null = null;

function getQueue(): Queue | null {
  if (queue) return queue;
  try {
    queue = new Queue("notification-tasks", { connection });
    return queue;
  } catch {
    return null;
  }
}

export async function enqueueNotificationEvent(notificationId: string, delayMs = 0) {
  const sendInline = async () => {
    try {
      const { processNotificationEvent } = await import("./notificationSend.js");
      await processNotificationEvent(notificationId);
    } catch (err) {
      console.warn("inline notification send failed:", err);
    }
  };

  try {
    const q = getQueue();
    if (!q) {
      void sendInline();
      return null;
    }
    if (connection.status !== "ready") {
      await Promise.race([
        connection.connect().catch(() => undefined),
        new Promise((r) => setTimeout(r, 500)),
      ]);
    }
    if (connection.status !== "ready") {
      void sendInline();
      return null;
    }

    // Do not race-timeout q.add — a timed-out race still enqueues the job and
    // caused duplicate worker + inline sends.
    return await q.add(
      "send-notification",
      { notificationId },
      { delay: delayMs, removeOnComplete: 100, removeOnFail: 50 },
    );
  } catch (error) {
    console.warn("notification queue unavailable:", error);
    void sendInline();
    return null;
  }
}

/** Kept for workers that import the queue instance. */
export const notificationQueue = {
  add: (...args: Parameters<Queue["add"]>) => {
    const q = getQueue();
    if (!q) return Promise.resolve(null);
    return q.add(...args);
  },
};
