/**
 * Poll pending Razorpay Payment Links so the patient's WhatsApp confirmation
 * goes out even when the callback redirect / webhook never reaches us.
 * Runs in-process with the API (same pattern as whatsappIdleWorker).
 */
import { PaymentRequestService } from "../services/procto/paymentRequest.service.js";

const INTERVAL_MS = Number(process.env.PAYMENT_POLL_MS) > 0
  ? Number(process.env.PAYMENT_POLL_MS)
  : 120_000;

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const { checked, paid, receipts } = await PaymentRequestService.pollPending();
    if (paid || receipts) {
      console.log(`[payment-poll] checked=${checked} paid=${paid} receipts=${receipts}`);
    }
  } catch (err) {
    console.warn("[payment-poll] poll failed:", err);
  } finally {
    running = false;
  }
}

setInterval(() => {
  void tick();
}, INTERVAL_MS);

void tick();

console.log(`[payment-poll] payment link poller started (every ${INTERVAL_MS}ms)`);
