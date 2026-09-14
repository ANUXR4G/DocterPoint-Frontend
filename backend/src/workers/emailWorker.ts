import { Worker } from "bullmq";
import { settings } from "../config/index.js";
import { sendEmail } from "../services/mail.js";

const connection = {
  host: settings.redisHost,
  port: settings.redisPort,
  password: settings.redisPassword || undefined,
};

const worker = new Worker(
  "email-tasks",
  async (job) => {
    const { recipient, subject, body } = job.data as {
      recipient: string;
      subject: string;
      body: string;
    };

    await sendEmail(recipient, subject, body);
    return {
      message: "successfully email sent!",
      sender: settings.ownerEmail,
      recipient,
    };
  },
  { connection },
);

worker.on("completed", (job) => {
  console.log(`Email job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`Email job ${job?.id} failed:`, err);
});

console.log("BullMQ email worker started");
