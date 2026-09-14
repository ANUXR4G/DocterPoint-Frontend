import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { ResponseHandler, AppError } from "../core/response.js";
import { requireAuth } from "../middleware/auth.js";
import { razorpay } from "../lib/razorpay.js";

const router = Router();

/** Demo mobile plan catalog (patient app Plans tab). */
export const DEMO_MOBILE_PLANS = {
  starter: {
    key: "starter",
    name: "Starter",
    amountInr: 1499,
    blurb: "Core booking for a solo practice.",
  },
  growth: {
    key: "growth",
    name: "Growth",
    amountInr: 2999,
    blurb: "WhatsApp line + stronger discovery.",
  },
  clinic: {
    key: "clinic",
    name: "Clinic",
    amountInr: 4999,
    blurb: "Multi-doctor clinics and analytics.",
  },
} as const;

type PlanKey = keyof typeof DEMO_MOBILE_PLANS;

router.get(
  "/demo-plans",
  requireAuth("booking:read"),
  (_req: Request, res: Response) => {
    return ResponseHandler.fetchSuccessful(res, "ok", {
      razorpayConfigured: razorpay.isConfigured(),
      plans: Object.values(DEMO_MOBILE_PLANS),
    });
  },
);

/**
 * Create a Razorpay order for a demo plan checkout (patient mobile).
 * POST { planKey: "starter" | "growth" | "clinic" }
 */
router.post(
  "/demo-plan-checkout",
  requireAuth("booking:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!razorpay.isConfigured()) {
        throw new AppError(
          503,
          "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
        );
      }

      const planKey = String(req.body?.planKey ?? "").toLowerCase() as PlanKey;
      const plan = DEMO_MOBILE_PLANS[planKey];
      if (!plan) {
        throw new AppError(400, "Unknown plan. Use starter, growth, or clinic.");
      }

      const amountPaise = plan.amountInr * 100;
      const userId = req.sessionUser!.id;
      const order = await razorpay.createOrder({
        amount: amountPaise,
        currency: "INR",
        receipt: `demo_${plan.key}_${userId.slice(0, 8)}_${Date.now()}`.slice(
          0,
          40,
        ),
        notes: {
          planKey: plan.key,
          planName: plan.name,
          userId,
          source: "mobile_demo_plans",
        },
      });

      return ResponseHandler.createSuccessful(res, "Razorpay checkout ready.", {
        keyId: razorpay.keyId,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        planKey: plan.key,
        planName: plan.name,
        amountInr: plan.amountInr,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Confirm a demo plan payment after Razorpay Checkout success.
 * POST { planKey, razorpayOrderId, razorpayPaymentId, razorpaySignature }
 */
router.post(
  "/demo-plan-confirm",
  requireAuth("booking:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const planKey = String(req.body?.planKey ?? "").toLowerCase() as PlanKey;
      const plan = DEMO_MOBILE_PLANS[planKey];
      if (!plan) {
        throw new AppError(400, "Unknown plan.");
      }

      const orderId = String(req.body?.razorpayOrderId ?? "");
      const paymentId = String(req.body?.razorpayPaymentId ?? "");
      const signature = String(req.body?.razorpaySignature ?? "");

      if (!orderId || !paymentId || !signature) {
        throw new AppError(400, "Missing Razorpay payment details.");
      }

      if (
        razorpay.isConfigured() &&
        !razorpay.verifyOrderPaymentSignature(orderId, paymentId, signature)
      ) {
        throw new AppError(400, "Invalid Razorpay payment signature.");
      }

      return ResponseHandler.fetchSuccessful(res, "Payment confirmed (demo).", {
        planKey: plan.key,
        planName: plan.name,
        amountInr: plan.amountInr,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        status: "PAID_DEMO",
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
