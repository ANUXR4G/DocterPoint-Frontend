import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { ResponseHandler } from "../../core/response.js";
import { requireAuth } from "../../middleware/auth.js";
import { PracticeService } from "../../services/procto/practice.service.js";
import { param, requireUuid } from "../../core/params.js";
import { prisma } from "../../db/prisma.js";

const router = Router();

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await PracticeService.listPublic({
      specialty: req.query.specialty as string | undefined,
      city: req.query.city as string | undefined,
      q: req.query.q as string | undefined,
    });
    return ResponseHandler.fetchSuccessful(res, "practices fetched.", data, data.length);
  } catch (error) {
    next(error);
  }
});

/** Public GlucoGuide plan catalog (Starter / Growth / Clinic). */
router.get("/plans", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { BillingService } = await import("../../services/procto/billing.service.js");
    const data = await BillingService.listPlans();
    return ResponseHandler.fetchSuccessful(res, "GlucoGuide plans", data);
  } catch (error) {
    next(error);
  }
});

router.get(
  "/mine",
  requireAuth("practice:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PracticeService.getForUser(req.sessionUser!.id);
      return ResponseHandler.fetchSuccessful(res, "your practices fetched.", data);
    } catch (error) {
      next(error);
    }
  },
);

/** Memberships + bookings in one response (cuts dashboard waterfall). */
router.get(
  "/mine/bootstrap",
  requireAuth("practice:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PracticeService.getDashboardBootstrap(
        req.sessionUser!.id,
        {
          date: req.query.date as string | undefined,
          from: req.query.from as string | undefined,
          to: req.query.to as string | undefined,
        },
      );
      return ResponseHandler.fetchSuccessful(
        res,
        "practice dashboard fetched.",
        data,
      );
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/onboard",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PracticeService.onboardPractice({
        ...req.body,
        ownerUserId: req.sessionUser!.id,
      });
      return ResponseHandler.createSuccessful(res, "practice onboarded.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:practiceId/profile",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PracticeService.updatePractice(
        param(req.params.practiceId),
        req.body,
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(res, "practice updated.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:practiceId/razorpay",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { PaymentAccountService } = await import(
        "../../services/procto/paymentAccount.service.js"
      );
      const data = await PaymentAccountService.getSettings(
        param(req.params.practiceId),
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(res, "razorpay settings fetched.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/:practiceId/razorpay",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { PaymentAccountService } = await import(
        "../../services/procto/paymentAccount.service.js"
      );
      const b = req.body ?? {};
      const data = await PaymentAccountService.saveSettings(
        param(req.params.practiceId),
        req.sessionUser!.id,
        { keyId: b.keyId, keySecret: b.keySecret, webhookSecret: b.webhookSecret },
      );
      return ResponseHandler.fetchSuccessful(res, "razorpay keys saved.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/:practiceId/razorpay",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { PaymentAccountService } = await import(
        "../../services/procto/paymentAccount.service.js"
      );
      const data = await PaymentAccountService.removeSettings(
        param(req.params.practiceId),
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(res, "razorpay keys removed.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:practiceId/schedules",
  requireAuth("schedule:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const providerId = req.query.providerId as string | undefined;
      const schedules = await PracticeService.getSchedules(
        param(req.params.practiceId),
        providerId,
        req.sessionUser!.id,
      );
      const practiceId = param(req.params.practiceId);
      const [pendingModeChange, upcomingChanges, pendingVerification] = providerId
        ? await Promise.all([
            PracticeService.getPendingModeChange(providerId, practiceId),
            PracticeService.getUpcomingSchedules(practiceId, providerId),
            PracticeService.getPendingVerification(practiceId, providerId),
          ])
        : [null, [], null];
      return ResponseHandler.fetchSuccessful(res, "schedules fetched.", {
        schedules,
        pendingModeChange,
        upcomingChanges,
        pendingVerification,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/:practiceId/schedules",
  requireAuth("schedule:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PracticeService.upsertSchedule(
        param(req.params.practiceId),
        req.body.providerId,
        req.body,
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(res, "schedule saved.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/:practiceId/provider-settings",
  requireAuth("schedule:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PracticeService.syncProviderSettings(
        param(req.params.practiceId),
        req.body.providerId ?? req.sessionUser!.id,
        req.body,
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(res, "provider settings saved.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:practiceId/provider-settings/preview",
  requireAuth("schedule:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PracticeService.previewProviderSettings(
        param(req.params.practiceId),
        req.body.providerId ?? req.sessionUser!.id,
        req.body,
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(res, "schedule change preview.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:practiceId/schedules/pending/activate",
  requireAuth("schedule:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PracticeService.activatePendingSchedule(
        param(req.params.practiceId),
        req.body.providerId ?? req.sessionUser!.id,
        req.sessionUser!.id,
        req.body.effectiveFrom,
      );
      return ResponseHandler.fetchSuccessful(res, "pending schedule activated.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/:practiceId/schedules/pending",
  requireAuth("schedule:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PracticeService.discardPendingSchedule(
        param(req.params.practiceId),
        (req.query.providerId as string | undefined) ?? req.sessionUser!.id,
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(res, "pending schedule discarded.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/:practiceId/schedules/upcoming",
  requireAuth("schedule:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PracticeService.cancelUpcomingSchedule(
        param(req.params.practiceId),
        (req.query.providerId as string | undefined) ?? req.sessionUser!.id,
        String(req.query.effectiveFrom ?? ""),
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(res, "scheduled change cancelled.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:practiceId/overrides",
  requireAuth("schedule:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PracticeService.getOverrides(
        param(req.params.practiceId),
        req.query.providerId as string | undefined,
        req.query.date as string | undefined,
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(res, "overrides fetched.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:practiceId/overrides",
  requireAuth("schedule:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PracticeService.createOverride(
        param(req.params.practiceId),
        req.body.providerId,
        req.body,
        req.sessionUser!.id,
      );
      return ResponseHandler.createSuccessful(res, "override created.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:practiceId/calendar",
  requireAuth("schedule:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { providerId, date } = req.query;
      if (!providerId || !date) {
        return ResponseHandler.unsuccessful(res, 400, "providerId and date are required.");
      }
      const data = await PracticeService.getCalendar(
        requireUuid(param(req.params.practiceId), "practiceId"),
        requireUuid(String(providerId), "providerId"),
        String(date),
      );
      return ResponseHandler.fetchSuccessful(res, "calendar fetched.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:practiceId/members",
  requireAuth("practice:admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PracticeService.addMember(
        param(req.params.practiceId),
        req.body,
        req.sessionUser!.id,
      );
      return ResponseHandler.createSuccessful(res, "member added.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:practiceId/doctors",
  requireAuth("practice:admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PracticeService.createDoctor(
        param(req.params.practiceId),
        req.body,
        req.sessionUser!.id,
      );
      return ResponseHandler.createSuccessful(res, "doctor added to clinic.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:practiceId/members/:userId",
  requireAuth("practice:admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isActive = req.body?.isActive;
      if (typeof isActive !== "boolean") {
        return ResponseHandler.unsuccessful(res, 400, "isActive boolean is required.");
      }
      const data = await PracticeService.setMemberActive(
        param(req.params.practiceId),
        param(req.params.userId),
        isActive,
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(res, "member updated.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:practiceId/patients",
  requireAuth("patient:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PracticeService.listPatients(
        param(req.params.practiceId),
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(
        res,
        "practice patients fetched.",
        data,
        data.length,
      );
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:practiceId/analytics",
  requireAuth("practice:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const type = String(req.query.type || "week");
      const providerId = req.query.providerId
        ? String(req.query.providerId)
        : undefined;
      const data = await PracticeService.getAnalytics(
        requireUuid(param(req.params.practiceId), "practiceId"),
        req.sessionUser!.id,
        type,
        providerId,
      );
      return ResponseHandler.fetchSuccessful(
        res,
        "practice analytics fetched.",
        data,
      );
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:practiceId/conversations",
  requireAuth("practice:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PracticeService.listConversations(
        param(req.params.practiceId),
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(
        res,
        "conversations fetched.",
        data,
        data.length,
      );
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:practiceId/notifications",
  requireAuth("practice:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { NotificationService } = await import(
        "../../services/procto/notification.service.js"
      );
      const status =
        typeof req.query.status === "string" ? req.query.status : undefined;
      const kind =
        typeof req.query.kind === "string" ? req.query.kind : undefined;
      const take = req.query.take ? Number(req.query.take) : undefined;
      const skip = req.query.skip ? Number(req.query.skip) : undefined;
      const data = await NotificationService.listForPractice(
        param(req.params.practiceId),
        req.sessionUser!.id,
        { status, kind, take, skip },
      );
      return ResponseHandler.fetchSuccessful(
        res,
        "notifications fetched.",
        data,
      );
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:practiceId/notifications/:notificationId/dismiss",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { NotificationService } = await import(
        "../../services/procto/notification.service.js"
      );
      const data = await NotificationService.dismissForPractice(
        param(req.params.practiceId),
        param(req.params.notificationId),
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(
        res,
        "notification dismissed.",
        data,
      );
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:practiceId/conversations/:conversationId",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = String(req.body?.status ?? "");
      if (!["bot_active", "handed_off", "closed"].includes(status)) {
        return ResponseHandler.unsuccessful(
          res,
          400,
          "status must be bot_active | handed_off | closed",
        );
      }
      const data = await PracticeService.setConversationStatus(
        param(req.params.practiceId),
        param(req.params.conversationId),
        status as "bot_active" | "handed_off" | "closed",
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(res, "conversation updated.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:practiceId/whatsapp/clear-phone",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const phone = String(req.body?.phone ?? "");
      const data = await PracticeService.clearWhatsAppPhone(
        param(req.params.practiceId),
        phone,
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(
        res,
        "WhatsApp phone record cleared.",
        data,
      );
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:practiceId/reviews",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ReviewService } = await import(
        "../../services/procto/review.service.js"
      );
      const data = await ReviewService.listForPractice(
        param(req.params.practiceId),
      );
      return ResponseHandler.fetchSuccessful(res, "reviews fetched.", data, data.length);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:practiceId/reviews",
  requireAuth("booking:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ReviewService } = await import(
        "../../services/procto/review.service.js"
      );
      const bookingId = String(req.body?.bookingId ?? "");
      if (!bookingId) {
        return ResponseHandler.unsuccessful(res, 400, "bookingId is required");
      }
      const patient = await prisma.patient.findUnique({
        where: { id: req.sessionUser!.id },
        select: { contactNumber: true, user: { select: { phone: true } } },
      });
      const actorPhone =
        patient?.contactNumber || patient?.user?.phone || undefined;
      const data = await ReviewService.create({
        practiceId: param(req.params.practiceId),
        bookingId,
        actorUserId: req.sessionUser!.id,
        actorPhone,
        authorName: req.body?.authorName
          ? String(req.body.authorName)
          : undefined,
        rating: Number(req.body?.rating),
        providerRating:
          req.body?.providerRating != null
            ? Number(req.body.providerRating)
            : undefined,
        body:
          req.body?.body != null
            ? String(req.body.body)
            : req.body?.comment != null
              ? String(req.body.comment)
              : undefined,
      });
      return ResponseHandler.createSuccessful(res, "review submitted.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:practiceId/billing",
  requireAuth("practice:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { BillingService } = await import(
        "../../services/procto/billing.service.js"
      );
      const data = await BillingService.getPracticeBilling(
        param(req.params.practiceId),
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(res, "practice billing fetched.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:practiceId/billing/subscribe",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { BillingService } = await import(
        "../../services/procto/billing.service.js"
      );
      const planId = String(req.body?.planId ?? "");
      const modeRaw = String(req.body?.mode ?? "activate");
      const mode =
        modeRaw === "trial" || modeRaw === "change" || modeRaw === "activate"
          ? modeRaw
          : "activate";
      if (!planId) {
        return ResponseHandler.unsuccessful(res, 400, "planId is required");
      }
      const data = await BillingService.selectPlan(
        param(req.params.practiceId),
        planId,
        req.sessionUser!.id,
        mode,
      );
      const message =
        mode === "trial"
          ? "Trial started."
          : data.checkout
            ? "Razorpay checkout ready."
            : data.scheduledPlan
              ? "Plan change scheduled for end of billing period."
              : mode === "change"
                ? "Plan updated."
                : "Subscription activated.";
      return ResponseHandler.createSuccessful(res, message, data);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:practiceId/billing/cancel-scheduled-change",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { BillingService } = await import(
        "../../services/procto/billing.service.js"
      );
      const data = await BillingService.cancelScheduledPlanChange(
        param(req.params.practiceId),
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(
        res,
        "Scheduled plan change cancelled.",
        data,
      );
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:practiceId/billing/cancel-checkout",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { BillingService } = await import(
        "../../services/procto/billing.service.js"
      );
      const data = await BillingService.cancelPendingCheckout(
        param(req.params.practiceId),
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(
        res,
        "Pending checkout cleared.",
        data,
      );
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:practiceId/billing/confirm",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { BillingService } = await import(
        "../../services/procto/billing.service.js"
      );
      const data = await BillingService.confirmCheckout(
        param(req.params.practiceId),
        req.sessionUser!.id,
        {
          razorpayPaymentId: req.body?.razorpayPaymentId
            ? String(req.body.razorpayPaymentId)
            : undefined,
          razorpaySubscriptionId: req.body?.razorpaySubscriptionId
            ? String(req.body.razorpaySubscriptionId)
            : undefined,
          razorpaySignature: req.body?.razorpaySignature
            ? String(req.body.razorpaySignature)
            : undefined,
        },
      );
      return ResponseHandler.fetchSuccessful(res, "Payment confirmed.", data);
    } catch (error) {
      next(error);
    }
  },
);

/** Meta Embedded Signup public config (app id, config id — no secrets). */
router.get(
  "/:practiceId/whatsapp/meta-config",
  requireAuth("practice:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const practiceId = param(req.params.practiceId);
      await PracticeService.assertMember(practiceId, req.sessionUser!.id);
      const { MetaWhatsAppService } = await import(
        "../../services/procto/metaWhatsApp.service.js"
      );
      return ResponseHandler.fetchSuccessful(
        res,
        "Meta WhatsApp config",
        MetaWhatsAppService.getPublicConfig(),
      );
    } catch (error) {
      next(error);
    }
  },
);

/** Auto-resolve Meta Phone Number ID from clinic mobile (platform WABA lookup). */
router.post(
  "/:practiceId/whatsapp/resolve",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const practiceId = param(req.params.practiceId);
      await PracticeService.assertAdmin(practiceId, req.sessionUser!.id);
      const phoneNumber = String(req.body?.phoneNumber ?? "").trim();
      if (!phoneNumber) {
        return ResponseHandler.unsuccessful(res, 400, "phoneNumber is required");
      }
      const { MetaWhatsAppService } = await import(
        "../../services/procto/metaWhatsApp.service.js"
      );
      const data = await MetaWhatsAppService.resolvePhoneNumberId(phoneNumber);
      return ResponseHandler.fetchSuccessful(res, "Meta Phone Number ID resolved.", data);
    } catch (error) {
      next(error);
    }
  },
);

/** Self-serve: clinic number → auto-resolve or Embedded Signup → bot LIVE. */
router.get(
  "/:practiceId/whatsapp/status",
  requireAuth("practice:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const practiceId = param(req.params.practiceId);
      await PracticeService.assertMember(practiceId, req.sessionUser!.id);
      const { MetaWhatsAppProvisionService } = await import(
        "../../services/procto/metaWhatsApp.provision.js"
      );
      const data = await MetaWhatsAppProvisionService.getProvisioningStatus(
        practiceId,
      );
      return ResponseHandler.fetchSuccessful(res, "WhatsApp provisioning status", data);
    } catch (error) {
      next(error);
    }
  },
);

/** Re-send Meta SMS/VOICE OTP for a VERIFYING registration number. */
router.post(
  "/:practiceId/whatsapp/verify/request",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const practiceId = param(req.params.practiceId);
      await PracticeService.assertAdmin(practiceId, req.sessionUser!.id);
      const method =
        String(req.body?.method ?? "SMS").toUpperCase() === "VOICE"
          ? "VOICE"
          : "SMS";
      const { MetaWhatsAppService } = await import(
        "../../services/procto/metaWhatsApp.service.js"
      );
      const data = await MetaWhatsAppService.requestOtpForPractice(practiceId, {
        method,
      });
      return ResponseHandler.createSuccessful(
        res,
        data.message,
        data,
      );
    } catch (error) {
      next(error);
    }
  },
);

/** Confirm Meta OTP → Cloud API register → LIVE. */
router.post(
  "/:practiceId/whatsapp/verify/confirm",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const practiceId = param(req.params.practiceId);
      await PracticeService.assertAdmin(practiceId, req.sessionUser!.id);
      const code = String(req.body?.code ?? "").trim();
      if (!code) {
        return ResponseHandler.unsuccessful(res, 400, "code is required");
      }
      const { MetaWhatsAppService } = await import(
        "../../services/procto/metaWhatsApp.service.js"
      );
      const data = await MetaWhatsAppService.confirmOtpForPractice(
        practiceId,
        code,
      );
      return ResponseHandler.createSuccessful(res, data.message, data);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:practiceId/whatsapp/provision/refresh",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const practiceId = param(req.params.practiceId);
      await PracticeService.assertAdmin(practiceId, req.sessionUser!.id);
      const { MetaWhatsAppProvisionService } = await import(
        "../../services/procto/metaWhatsApp.provision.js"
      );
      const data = await MetaWhatsAppProvisionService.refreshTemplateStatus(
        practiceId,
      );
      return ResponseHandler.fetchSuccessful(res, "Template status refreshed", data);
    } catch (error) {
      next(error);
    }
  },
);

/** Self-serve: clinic number → auto-resolve or Embedded Signup → bot LIVE. */
router.post(
  "/:practiceId/whatsapp/connect",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const practiceId = param(req.params.practiceId);
      await PracticeService.assertAdmin(practiceId, req.sessionUser!.id);
      const phoneNumber = String(req.body?.phoneNumber ?? "").trim();
      const wabaPhoneNumberId = req.body?.wabaPhoneNumberId
        ? String(req.body.wabaPhoneNumberId).trim()
        : undefined;
      const wabaId = req.body?.wabaId ? String(req.body.wabaId).trim() : undefined;
      const oauthCode = req.body?.oauthCode
        ? String(req.body.oauthCode).trim()
        : undefined;
      if (!phoneNumber) {
        return ResponseHandler.unsuccessful(res, 400, "phoneNumber is required");
      }
      const { MetaWhatsAppService } = await import(
        "../../services/procto/metaWhatsApp.service.js"
      );
      const data = await MetaWhatsAppService.connectPracticeLine(practiceId, {
        phoneNumber,
        wabaPhoneNumberId,
        wabaId,
        oauthCode,
      });
      return ResponseHandler.createSuccessful(
        res,
        "WhatsApp line connected — booking bot is ready for patients.",
        data,
      );
    } catch (error) {
      next(error);
    }
  },
);

router.get("/:slug", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await PracticeService.getBySlug(param(req.params.slug));
    return ResponseHandler.fetchSuccessful(res, "practice fetched.", data);
  } catch (error) {
    next(error);
  }
});

export default router;
