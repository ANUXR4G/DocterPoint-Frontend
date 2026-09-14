import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { settings } from "../config/index.js";

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
  /* Redis optional for local flows */
});

let queue: Queue | null = null;

function getQueue(): Queue | null {
  if (queue) return queue;
  try {
    queue = new Queue("email-tasks", { connection });
    return queue;
  } catch {
    return null;
  }
}

export async function enqueueEmailTask(
  recipient: string,
  subject: string,
  body: string,
  delayMs = 60000,
) {
  try {
    const q = getQueue();
    if (!q) return null;
    if (connection.status !== "ready") {
      await Promise.race([
        connection.connect().catch(() => undefined),
        new Promise((r) => setTimeout(r, 500)),
      ]);
    }
    return q.add(
      "send-email",
      { recipient, subject, body },
      { delay: delayMs },
    );
  } catch {
    return null;
  }
}

export async function getEmailTaskStatus(taskId: string) {
  try {
    const q = getQueue();
    if (!q) {
      return { task_id: taskId, status: "NOT_FOUND", result: null };
    }
    const job = await q.getJob(taskId);
    if (!job) {
      return { task_id: taskId, status: "NOT_FOUND", result: null };
    }

    const state = await job.getState();
    return {
      task_id: taskId,
      status: state.toUpperCase(),
      result: job.returnvalue ?? null,
    };
  } catch {
    return { task_id: taskId, status: "NOT_FOUND", result: null };
  }
}

export const emailQueue = {
  add: enqueueEmailTask,
};
