import { BillingService } from "../services/procto/billing.service.js";

const INTERVAL_MS = 15 * 60_000;

async function tick() {
  try {
    const result = await BillingService.processGraceExpirations();
    if (result.processed > 0 || (result.scheduledPlanChanges ?? 0) > 0) {
      console.log(
        `[subscriptionGrace] suspended ${result.processed} practice(s), applied ${result.scheduledPlanChanges ?? 0} scheduled plan change(s)`,
      );
    }
  } catch (err) {
    console.error("[subscriptionGrace]", err);
  }
}

setInterval(tick, INTERVAL_MS);
void tick();

console.log("subscriptionGrace worker scheduled");
