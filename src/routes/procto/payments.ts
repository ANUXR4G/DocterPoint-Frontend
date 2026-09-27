import { Router, type NextFunction, type Request, type Response } from "express";
import { ResponseHandler } from "../../core/response.js";
import { param } from "../../core/params.js";
import { requireAuth } from "../../middleware/auth.js";
import { verifyRazorpayWebhook } from "../../lib/razorpay.js";
import { PaymentAccountService } from "../../services/procto/paymentAccount.service.js";
import { formatRupees } from "../../services/procto/paymentHelpers.js";
import { PaymentRequestService } from "../../services/procto/paymentRequest.service.js";

const router = Router();

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

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
 * any change; the patient only sees a short result page.
 */
router.get("/razorpay/callback", async (req: Request, res: Response) => {
  try {
    const result = await PaymentRequestService.handleCallback(
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
    const what =
      result.label && result.amount != null
        ? `${escapeHtml(formatRupees(result.amount))} (${escapeHtml(result.label.toLowerCase())})`
        : "your payment";
    return res.send(
      result.paid
        ? page(
            "Payment received ✅",
            `Thank you — ${what} is paid. A confirmation has been sent on WhatsApp. You can close this page.`,
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

/**
 * Webhook for a clinic's own Razorpay account (URL shown in Settings).
 * Verified with that clinic's webhook secret; only its own links are touched.
 */
router.post("/razorpay/webhook/:practiceId", async (req: Request, res: Response) => {
  try {
    const practiceId = param(req.params.practiceId);
    const account = await PaymentAccountService.webhookSecret(practiceId).catch(() => null);
    if (!account) {
      return ResponseHandler.fetchSuccessful(res, "webhook ignored", {
        ok: false,
        reason: "webhook_secret_not_configured",
      });
    }
    const rawBody =
      (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
    if (
      !verifyRazorpayWebhook(
        account.secret,
        rawBody,
        req.header("x-razorpay-signature") ?? undefined,
      )
    ) {
      return ResponseHandler.unsuccessful(res, 401, "Invalid Razorpay signature");
    }
    const event = String((req.body as { event?: string })?.event ?? "");
    if (!event.startsWith("payment_link.")) {
      return ResponseHandler.fetchSuccessful(res, "webhook ignored", { ok: true, event });
    }
    const data = await PaymentRequestService.handleWebhookEvent(req.body ?? {}, {
      kind: "PRACTICE",
      practiceId,
      keyId: account.keyId,
    });
    return ResponseHandler.fetchSuccessful(res, "payment link webhook processed", data);
  } catch (err) {
    console.warn("[payment] clinic webhook failed:", err);
    return ResponseHandler.unsuccessful(res, 500, "webhook failed");
  }
});

router.get(
  "/practice/:practiceId",
  requireAuth("booking:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PaymentRequestService.list(
        param(req.params.practiceId),
        req.sessionUser!.id,
        {
          status: req.query.status as string | undefined,
          from: req.query.from as string | undefined,
          to: req.query.to as string | undefined,
          q: req.query.q as string | undefined,
          providerId: req.query.providerId as string | undefined,
          take: req.query.take ? Number(req.query.take) : undefined,
        },
      );
      return ResponseHandler.fetchSuccessful(res, "payments fetched.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/requests",
  requireAuth("booking:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const b = req.body ?? {};
      const data = await PaymentRequestService.createCustom(req.sessionUser!.id, {
        practiceId: String(b.practiceId || ""),
        bookingId: b.bookingId ? String(b.bookingId) : null,
        patientId: b.patientId ? String(b.patientId) : null,
        patientName: b.patientName != null ? String(b.patientName) : null,
        patientPhone: b.patientPhone != null ? String(b.patientPhone) : null,
        providerId: b.providerId ? String(b.providerId) : null,
        amount: b.amount,
        purpose: b.purpose != null ? String(b.purpose) : null,
        expiresInDays: b.expiresInDays,
        channel: b.channel === "PROVIDER_APP" ? "PROVIDER_APP" : "WEB_PORTAL",
      });
      return ResponseHandler.createSuccessful(res, "payment request sent.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/requests/:id",
  requireAuth("booking:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = param(req.params.id);
      const data =
        req.query.refresh === "1"
          ? await PaymentRequestService.refresh(id, req.sessionUser!.id)
          : await PaymentRequestService.get(id, req.sessionUser!.id);
      return ResponseHandler.fetchSuccessful(res, "payment request fetched.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/requests/:id/resend",
  requireAuth("booking:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PaymentRequestService.resend(
        param(req.params.id),
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(res, "payment request re-sent.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/requests/:id/cancel",
  requireAuth("booking:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PaymentRequestService.cancel(
        param(req.params.id),
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(res, "payment request cancelled.", data);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
