import { Router, type Request, type Response, type NextFunction } from "express";
import { ResponseHandler } from "../../core/response.js";
import { BillingService } from "../../services/procto/billing.service.js";
import { razorpay } from "../../lib/razorpay.js";

const router = Router();

/**
 * Public Razorpay subscription webhook.
 * Configure in Razorpay Dashboard → Webhooks →
 * POST /api/v1/procto/billing/razorpay-webhook
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const secret = razorpay.webhookSecret?.trim();
    // Never process unverified payloads. Missing secret = ignore (2xx) so
    // Razorpay does not retry-storm, and misconfig does not surface as 5xx.
    if (!secret) {
      return ResponseHandler.fetchSuccessful(res, "Billing webhook ignored", {
        ok: false,
        reason: "webhook_secret_not_configured",
      });
    }

    const signature = req.header("x-razorpay-signature") ?? undefined;
    const rawBody =
      (req as Request & { rawBody?: string }).rawBody ??
      JSON.stringify(req.body ?? {});
    if (!razorpay.verifyWebhookSignature(rawBody, signature)) {
      return ResponseHandler.unsuccessful(res, 401, "Invalid Razorpay signature");
    }

    const event = String((req.body as { event?: string })?.event ?? "");
    if (event.startsWith("payment_link.")) {
      const { PaymentRequestService } = await import(
        "../../services/procto/paymentRequest.service.js"
      );
      const data = await PaymentRequestService.handleWebhookEvent(req.body ?? {});
      return ResponseHandler.fetchSuccessful(res, "Payment link webhook processed", data);
    }
    const data = await BillingService.handleWebhookEvent(req.body ?? {});
    return ResponseHandler.fetchSuccessful(res, "Billing webhook processed", data);
  } catch (e) {
    next(e);
  }
});

export default router;
