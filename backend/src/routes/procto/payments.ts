import { Router, type Request, type Response } from "express";
import { BookingPaymentService } from "../../services/procto/bookingPayment.service.js";

const router = Router();

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#f5f7fb;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
main{background:#fff;border-radius:16px;padding:28px 24px;max-width:420px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
h1{font-size:20px;margin:0 0 8px}p{color:#555;line-height:1.5;margin:0}</style></head>
<body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;
}

/**
 * Razorpay Payment Link redirect (`callback_url`). Signature-verified before
 * any booking change; the patient only sees a short result page.
 */
router.get("/razorpay/callback", async (req: Request, res: Response) => {
  try {
    const result = await BookingPaymentService.handleCallback(
      req.query as Record<string, unknown>,
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (!result.ok) {
      return res
        .status(400)
        .send(
          page(
            "Could not verify payment",
            "If money was deducted, it will reflect shortly. Please contact the clinic if it doesn't.",
          ),
        );
    }
    return res.send(
      result.paid
        ? page(
            "Payment received ✅",
            "Thank you — your consultation fee is paid. A confirmation has been sent on WhatsApp. You can close this page.",
          )
        : page(
            "Payment not completed",
            "No money was taken. You can use the same link again or pay at the clinic.",
          ),
    );
  } catch (err) {
    console.warn("[payment] callback failed:", err);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res
      .status(500)
      .send(page("Something went wrong", "Please contact the clinic."));
  }
});

export default router;
