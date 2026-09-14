import { createServer } from "http";
import app from "./app.js";
import { settings } from "./config/index.js";
import { razorpay } from "./lib/razorpay.js";
import { setupWebSockets } from "./websockets/index.js";

process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaughtException", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[fatal] unhandledRejection", err);
});

const server = createServer(app);
setupWebSockets(server);

if (razorpay.isConfigured()) {
  console.log(
    `Razorpay: live checkout enabled${settings.razorpayWebhookSecret ? " (webhook verified)" : " — set RAZORPAY_WEBHOOK_SECRET for recurring webhooks"}`,
  );
}

const port = settings.port;
server.listen(port, "0.0.0.0", () => {
  console.log(`Gluco Guide backend listening on port ${port}`);
  console.log(`Health: http://0.0.0.0:${port}/health`);

  // WhatsApp: seed templates / sync pool metadata (idempotent)
  void import("./bootstrap/whatsapp.js").then(({ ensureWhatsAppInfrastructure }) =>
    ensureWhatsAppInfrastructure(),
  );

  // Process WhatsApp notification queue in-process unless explicitly disabled
  // (use a separate `yarn worker:notifications` when NOTIFICATION_WORKER_INLINE=0).
  const inlineWorker = (process.env.NOTIFICATION_WORKER_INLINE ?? "1") !== "0";
  if (inlineWorker) {
    void import("./workers/notificationWorker.js").catch((err) =>
      console.warn("[notification] worker failed to start:", err),
    );
  }
});
