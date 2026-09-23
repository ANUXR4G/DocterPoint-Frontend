/**
 * Poll mid-flow WhatsApp conversations for idle reminder → chat closed.
 * Runs in-process with the API (same pattern as notification scheduleReminders).
 */
import { processWhatsAppIdleTimeouts } from "../services/procto/whatsapp.idleTimeout.js";

const INTERVAL_MS = Number(process.env.WA_IDLE_POLL_MS) > 0
  ? Number(process.env.WA_IDLE_POLL_MS)
  : 60_000;

async function tick() {
  try {
    const { reminded, closed } = await processWhatsAppIdleTimeouts();
    if (reminded || closed) {
      console.log(
        `[wa-idle] reminded=${reminded} closed=${closed}`,
      );
    }
  } catch (err) {
    console.warn("[wa-idle] poll failed:", err);
  }
}

setInterval(() => {
  void tick();
}, INTERVAL_MS);

void tick();

console.log(
  `[wa-idle] idle timeout worker started (poll every ${INTERVAL_MS}ms)`,
);
