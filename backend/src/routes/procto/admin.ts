import { Router, type Request, type Response, type NextFunction } from "express";
import {
  MessageTemplateStatus,
  ProvisioningProvider,
  WhatsAppNumberStatus,
} from "@prisma/client";
import { requireAuth } from "../../middleware/auth.js";
import { ResponseHandler } from "../../core/response.js";
import { NumberPoolService } from "../../services/procto/numberPool.service.js";
import { BillingService } from "../../services/procto/billing.service.js";
import { PlatformAdminService } from "../../services/procto/platformAdmin.service.js";
import { SupportAdminService } from "../../services/supportAdmin.service.js";
import { prisma } from "../../db/prisma.js";

const router = Router();

/** Platform ops — GlucoGuide number pool, plans, templates (admin scope). */
router.use(requireAuth("users:write"));

function pageQuery(req: Request) {
  return {
    q: req.query.q ? String(req.query.q) : undefined,
    take: req.query.take ? Number(req.query.take) : undefined,
    skip: req.query.skip ? Number(req.query.skip) : undefined,
  };
}

router.get("/overview", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await PlatformAdminService.getOverview();
    return ResponseHandler.fetchSuccessful(res, "Platform overview", data);
  } catch (e) {
    next(e);
  }
});

router.get("/analytics", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const monthsRaw = Number(req.query.months ?? 6);
    const months = [3, 6, 12].includes(monthsRaw) ? monthsRaw : 6;
    const dailyOffsetRaw = Number(req.query.dailyMonthOffset ?? 0);
    const dailyMonthOffset = dailyOffsetRaw === -1 ? -1 : 0;
    const data = await PlatformAdminService.getAnalytics({
      months,
      dailyMonthOffset,
    });
    return ResponseHandler.fetchSuccessful(res, "Platform analytics", data);
  } catch (e) {
    next(e);
  }
});

router.get("/patients", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await PlatformAdminService.listPatients(pageQuery(req));
    return ResponseHandler.fetchSuccessful(res, "Patients", data);
  } catch (e) {
    next(e);
  }
});

router.get("/doctors", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await PlatformAdminService.listDoctors(pageQuery(req));
    return ResponseHandler.fetchSuccessful(res, "Doctors", data);
  } catch (e) {
    next(e);
  }
});

router.get("/practices", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await PlatformAdminService.listPractices(pageQuery(req));
    return ResponseHandler.fetchSuccessful(res, "Practices", data);
  } catch (e) {
    next(e);
  }
});

router.patch(
  "/practices/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PlatformAdminService.updatePractice(String(req.params.id), {
        isActive: req.body?.isActive,
        isDirectoryListed: req.body?.isDirectoryListed,
      });
      return ResponseHandler.fetchSuccessful(res, "Practice updated", data);
    } catch (e) {
      next(e);
    }
  },
);

router.get("/bookings", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await PlatformAdminService.listBookings({
      ...pageQuery(req),
      status: req.query.status ? String(req.query.status) : undefined,
    });
    return ResponseHandler.fetchSuccessful(res, "Bookings", data);
  } catch (e) {
    next(e);
  }
});

router.get("/approvals", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await PlatformAdminService.listApprovals();
    return ResponseHandler.fetchSuccessful(res, "Pending approvals", data);
  } catch (e) {
    next(e);
  }
});

router.get("/reviews", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const published =
      req.query.published === "true"
        ? true
        : req.query.published === "false"
          ? false
          : undefined;
    const data = await PlatformAdminService.listReviews({
      ...pageQuery(req),
      published,
    });
    return ResponseHandler.fetchSuccessful(res, "Practice reviews", data);
  } catch (e) {
    next(e);
  }
});

router.get("/escalations", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await PlatformAdminService.listEscalations(pageQuery(req));
    return ResponseHandler.fetchSuccessful(res, "Escalation queue", data);
  } catch (e) {
    next(e);
  }
});

router.patch(
  "/escalations/:id",
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
      const data = await PlatformAdminService.updateEscalation(
        String(req.params.id),
        status as "bot_active" | "handed_off" | "closed",
      );
      return ResponseHandler.fetchSuccessful(res, "Escalation updated", data);
    } catch (e) {
      next(e);
  }
  },
);

router.get("/pending-numbers", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await PlatformAdminService.listPendingNumbers(pageQuery(req));
    return ResponseHandler.fetchSuccessful(res, "Numbers awaiting go-live", data);
  } catch (e) {
    next(e);
  }
});

router.get("/pending-templates", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await PlatformAdminService.listPendingTemplates(pageQuery(req));
    return ResponseHandler.fetchSuccessful(res, "Pending message templates", data);
  } catch (e) {
    next(e);
  }
});

router.patch(
  "/reviews/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PlatformAdminService.updateReview(
        String(req.params.id),
        Boolean(req.body?.isPublished),
      );
      return ResponseHandler.fetchSuccessful(res, "Review updated", data);
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/templates/:id/status",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = req.body?.status as MessageTemplateStatus;
      const data = await PlatformAdminService.updateTemplateStatus(
        String(req.params.id),
        status,
      );
      return ResponseHandler.fetchSuccessful(res, "Template updated", data);
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/members/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await PlatformAdminService.setMemberActive(
        String(req.params.id),
        Boolean(req.body?.isActive),
      );
      return ResponseHandler.fetchSuccessful(res, "Member updated", data);
    } catch (e) {
      next(e);
    }
  },
);

router.get("/numbers/overview", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await PlatformAdminService.getWhatsAppOverview();
    return ResponseHandler.fetchSuccessful(res, "WhatsApp overview", data);
  } catch (e) {
    next(e);
  }
});

/** DoubleTick-style: N-number registry + Embedded Signup config. */
router.get("/whatsapp/signup/config", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { WhatsAppSignupService } = await import(
      "../../services/procto/whatsappSignup.service.js"
    );
    return ResponseHandler.fetchSuccessful(
      res,
      "WhatsApp signup config",
      WhatsAppSignupService.getSignupConfig(),
    );
  } catch (e) {
    next(e);
  }
});

router.get("/whatsapp/registry", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { WhatsAppSignupService } = await import(
      "../../services/procto/whatsappSignup.service.js"
    );
    const data = await WhatsAppSignupService.listRegistry({
      status: req.query.status ? String(req.query.status) : undefined,
      q: req.query.q ? String(req.query.q) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 200,
    });
    return ResponseHandler.fetchSuccessful(res, "WhatsApp number registry", data);
  } catch (e) {
    next(e);
  }
});

router.get("/whatsapp/pending-signups", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { WhatsAppSignupService } = await import(
      "../../services/procto/whatsappSignup.service.js"
    );
    const data = await WhatsAppSignupService.listPendingSignups();
    return ResponseHandler.fetchSuccessful(res, "Clinics pending WhatsApp signup", data);
  } catch (e) {
    next(e);
  }
});

/** Ops: connect a clinic number via Embedded Signup payload (same as clinic Billing). */
router.post(
  "/whatsapp/practices/:practiceId/connect",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { WhatsAppSignupService } = await import(
        "../../services/procto/whatsappSignup.service.js"
      );
      const phoneNumber = String(req.body?.phoneNumber ?? "").trim();
      if (!phoneNumber) {
        return ResponseHandler.unsuccessful(res, 400, "phoneNumber is required");
      }
      const data = await WhatsAppSignupService.connectForPractice(
        String(req.params.practiceId),
        {
          phoneNumber,
          wabaPhoneNumberId: req.body?.wabaPhoneNumberId
            ? String(req.body.wabaPhoneNumberId).trim()
            : undefined,
          wabaId: req.body?.wabaId ? String(req.body.wabaId).trim() : undefined,
          oauthCode: req.body?.oauthCode
            ? String(req.body.oauthCode).trim()
            : undefined,
        },
      );
      return ResponseHandler.createSuccessful(
        res,
        "Clinic WhatsApp connected via Embedded Signup",
        data,
      );
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/whatsapp/numbers/:id/refresh",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { WhatsAppSignupService } = await import(
        "../../services/procto/whatsappSignup.service.js"
      );
      const data = await WhatsAppSignupService.refreshProvision(
        String(req.params.id),
      );
      return ResponseHandler.fetchSuccessful(res, "Provisioning refreshed", data);
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/whatsapp/provision/refresh-all",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { WhatsAppSignupService } = await import(
        "../../services/procto/whatsappSignup.service.js"
      );
      const limit = req.body?.limit ? Number(req.body.limit) : 50;
      const data = await WhatsAppSignupService.refreshAllProvisioning(limit);
      return ResponseHandler.fetchSuccessful(res, "Batch provision refresh", data);
    } catch (e) {
      next(e);
    }
  },
);

router.get("/numbers", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as WhatsAppNumberStatus | undefined;
    const data = await NumberPoolService.list(
      status && Object.values(WhatsAppNumberStatus).includes(status)
        ? { status }
        : undefined,
    );
    return ResponseHandler.fetchSuccessful(res, "WhatsApp number pool", data);
  } catch (e) {
    next(e);
  }
});

router.post("/numbers", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phoneNumber, displayName, provider, notes, wabaPhoneNumberId } =
      req.body ?? {};
    const rawProvider = provider ? String(provider) : "MOCK";
    const safeProvider = (
      ["MOCK", "META_CLOUD_API"].includes(rawProvider)
        ? rawProvider
        : "META_CLOUD_API"
    ) as ProvisioningProvider;
    const data = await NumberPoolService.addToPool({
      phoneNumber: String(phoneNumber ?? ""),
      displayName,
      provider: safeProvider,
      notes,
      wabaPhoneNumberId,
    });
    return ResponseHandler.createSuccessful(res, "Number added to pool", data);
  } catch (e) {
    next(e);
  }
});

router.post(
  "/numbers/assign",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { practiceId, phoneNumber, mockGoLive } = req.body ?? {};
      if (!practiceId) {
        return ResponseHandler.unsuccessful(res, 400, "practiceId required");
      }
      const data = await NumberPoolService.assignToPractice(String(practiceId), {
        phoneNumber: phoneNumber ? String(phoneNumber) : undefined,
        mockGoLive: mockGoLive !== false,
      });
      let goLive = null;
      if (data.status === WhatsAppNumberStatus.LIVE && data.practiceId) {
        goLive = await BillingService.notifyGoLive(data.practiceId);
      }
      return ResponseHandler.fetchSuccessful(res, "Number assigned to practice", {
        ...data,
        goLive,
      });
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/numbers/:id/status",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = req.body?.status as WhatsAppNumberStatus;
      if (!Object.values(WhatsAppNumberStatus).includes(status)) {
        return ResponseHandler.unsuccessful(res, 400, "invalid status");
      }
      const data = await NumberPoolService.advanceStatus(
        String(req.params.id),
        status,
        {
          verificationStatus: req.body?.verificationStatus,
          displayNameStatus: req.body?.displayNameStatus,
          templatesStatus: req.body?.templatesStatus,
          wabaPhoneNumberId: req.body?.wabaPhoneNumberId,
          notes: req.body?.notes,
        },
      );
      let goLive = null;
      if (status === WhatsAppNumberStatus.LIVE && data.practiceId) {
        goLive = await BillingService.notifyGoLive(data.practiceId);
      }
      return ResponseHandler.fetchSuccessful(res, "Number status updated", {
        ...data,
        goLive,
      });
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/numbers/suspend",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { practiceId } = req.body ?? {};
      if (!practiceId) {
        return ResponseHandler.unsuccessful(res, 400, "practiceId required");
      }
      const data = await NumberPoolService.suspendPracticeLine(String(practiceId));
      return ResponseHandler.fetchSuccessful(res, "Practice WhatsApp line suspended", data);
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/numbers/:practiceId/go-live",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await BillingService.notifyGoLive(String(req.params.practiceId));
      return ResponseHandler.fetchSuccessful(res, "Go-live notification prepared", data);
    } catch (e) {
      next(e);
    }
  },
);

router.get("/plans", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await NumberPoolService.ensureDefaultPlans();
    return ResponseHandler.fetchSuccessful(res, "GlucoGuide plans", data);
  } catch (e) {
    next(e);
  }
});

router.get("/subscriptions", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await BillingService.listSubscriptions();
    return ResponseHandler.fetchSuccessful(res, "Practice subscriptions", data);
  } catch (e) {
    next(e);
  }
});

router.post(
  "/subscriptions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { practiceId, planId, mode, trialDays } = req.body ?? {};
      if (!practiceId || !planId) {
        return ResponseHandler.unsuccessful(
          res,
          400,
          "practiceId and planId required",
        );
      }

      const modeRaw = String(mode ?? "active").toLowerCase();
      if (modeRaw === "trial") {
        const days =
          trialDays === undefined || trialDays === null || trialDays === ""
            ? null
            : Number(trialDays);
        const data = await NumberPoolService.startTrial(
          String(practiceId),
          String(planId),
          days,
        );
        return ResponseHandler.createSuccessful(
          res,
          data.openEnded
            ? "Open-ended trial started"
            : `${data.trialDays}-day trial started`,
          data,
        );
      }

      const data = await NumberPoolService.startSubscription(
        String(practiceId),
        String(planId),
      );
      return ResponseHandler.createSuccessful(res, "Subscription started", data);
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/billing/webhook",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Authenticated ops path; live Razorpay posts to /procto/billing/razorpay-webhook
      const data = await BillingService.handleWebhookEvent(req.body ?? {});
      return ResponseHandler.fetchSuccessful(res, "Billing webhook processed", data);
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/billing/simulate",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { practiceId, action } = req.body ?? {};
      if (!practiceId || !action) {
        return ResponseHandler.unsuccessful(
          res,
          400,
          "practiceId and action required (active|past_due|suspend|grace_tick)",
        );
      }
      if (action === "active") {
        const data = await BillingService.markActive(String(practiceId));
        return ResponseHandler.fetchSuccessful(res, "Subscription activated", data);
      }
      if (action === "past_due") {
        const data = await BillingService.markPastDue(String(practiceId));
        return ResponseHandler.fetchSuccessful(res, "Subscription past due", data);
      }
      if (action === "suspend") {
        const data = await BillingService.suspendForNonPayment(String(practiceId));
        return ResponseHandler.fetchSuccessful(res, "Subscription suspended", data);
      }
      if (action === "grace_tick") {
        const data = await BillingService.processGraceExpirations();
        return ResponseHandler.fetchSuccessful(res, "Grace expirations processed", data);
      }
      return ResponseHandler.unsuccessful(res, 400, "unknown action");
    } catch (e) {
      next(e);
    }
  },
);

router.get("/templates", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const practiceId = req.query.practiceId
      ? String(req.query.practiceId)
      : undefined;
    const data = await NumberPoolService.listTemplates(practiceId);
    return ResponseHandler.fetchSuccessful(res, "Message templates", data);
  } catch (e) {
    next(e);
  }
});

router.post("/templates", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, category, body, language, practiceId, status, metaName } =
      req.body ?? {};
    if (!name || !category || !body) {
      return ResponseHandler.unsuccessful(
        res,
        400,
        "name, category, and body required",
      );
    }
    const cat = String(category).toUpperCase();
    if (!["UTILITY", "AUTHENTICATION", "MARKETING"].includes(cat)) {
      return ResponseHandler.unsuccessful(
        res,
        400,
        "category must be UTILITY, AUTHENTICATION, or MARKETING (Meta). Prefer UTILITY for appointment alerts.",
      );
    }
    if (cat === "MARKETING") {
      return ResponseHandler.unsuccessful(
        res,
        400,
        "GlucoGuide does not allow MARKETING templates for clinic appointment lines — use UTILITY only. See documentation/Whatsapp-Meta-Rules.md.",
      );
    }
    const data = await NumberPoolService.createTemplate({
      name: String(name),
      category: cat,
      body: String(body),
      language,
      practiceId,
      status: status as MessageTemplateStatus | undefined,
      metaName: metaName ? String(metaName) : undefined,
    });
    return ResponseHandler.createSuccessful(res, "Template created", data);
  } catch (e) {
    next(e);
  }
});

/** Seed / refresh platform Meta UTILITY templates from code catalog. */
router.post(
  "/templates/sync-meta",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await NumberPoolService.syncMetaUtilityTemplates();
      return ResponseHandler.fetchSuccessful(
        res,
        "Meta utility templates synced",
        data,
      );
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/support/help-threads",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await SupportAdminService.listHelpThreads();
      return ResponseHandler.fetchSuccessful(res, "Help threads", data);
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/support/help-threads/:userId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await SupportAdminService.getHelpThread(
        String(req.params.userId),
        Number(req.query.page ?? 1),
        Math.min(Number(req.query.limit ?? 50), 100),
      );
      return ResponseHandler.fetchSuccessful(res, "Help thread", data);
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/support/help-threads/:userId/seen",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await SupportAdminService.markHelpThreadSeen(
        String(req.params.userId),
      );
      return ResponseHandler.fetchSuccessful(res, "Thread marked seen", data);
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/support/help-threads/:userId/reply",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await SupportAdminService.postAdminReply(
        String(req.params.userId),
        String(req.body?.content ?? ""),
      );
      return ResponseHandler.createSuccessful(res, "Reply sent", data);
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/support/notifications",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await SupportAdminService.listNotifications({
        status: req.query.status ? String(req.query.status) : undefined,
        take: req.query.take ? Number(req.query.take) : undefined,
        skip: req.query.skip ? Number(req.query.skip) : undefined,
      });
      return ResponseHandler.fetchSuccessful(res, "Notifications", data);
    } catch (e) {
      next(e);
    }
  },
);

export default router;
