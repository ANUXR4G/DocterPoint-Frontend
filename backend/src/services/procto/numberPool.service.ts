import {
  ProvisioningProvider,
  WhatsAppNumberStatus,
  PracticeSubscriptionStatus,
  MessageTemplateStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../core/response.js";
import { settings } from "../../config/index.js";

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

/** Profile Tel + WhatsApp bot display must stay one public clinic number. */
async function syncPracticeBotPhone(
  tx: Prisma.TransactionClient,
  practiceId: string,
  phoneNumber: string,
) {
  const phone = digitsOnly(phoneNumber);
  await tx.practice.update({
    where: { id: practiceId },
    data: {
      whatsappBusinessNumber: phone,
      phone,
      isActive: true,
    },
  });
}

async function clearPracticeBotPhone(
  tx: Prisma.TransactionClient,
  practiceId: string,
) {
  await tx.practice.update({
    where: { id: practiceId },
    data: { whatsappBusinessNumber: null },
  });
}

export const NumberPoolService = {
  list(filters?: { status?: WhatsAppNumberStatus }) {
    return prisma.whatsAppNumber.findMany({
      where: filters?.status ? { status: filters.status } : undefined,
      include: {
        practice: { select: { id: true, name: true, slug: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  },

  async addToPool(data: {
    phoneNumber: string;
    displayName?: string;
    provider?: ProvisioningProvider;
    notes?: string;
    wabaPhoneNumberId?: string;
  }) {
    const phone = digitsOnly(data.phoneNumber);
    if (phone.length < 10) {
      throw new AppError(400, "phoneNumber must be a valid 10-digit Indian mobile");
    }
    const existing = await prisma.whatsAppNumber.findUnique({
      where: { phoneNumber: phone },
    });
    if (existing) throw new AppError(409, "Number already in pool");

    const metaId = data.wabaPhoneNumberId?.trim() || "";
    if (metaId) {
      const wabaTaken = await prisma.whatsAppNumber.findFirst({
        where: { wabaPhoneNumberId: metaId },
      });
      if (wabaTaken) {
        throw new AppError(
          409,
          "This Meta Phone Number ID is already linked to another pool/clinic line.",
        );
      }
    }

    return prisma.whatsAppNumber.create({
      data: {
        phoneNumber: phone,
        displayName: data.displayName,
        provider: data.provider ?? ProvisioningProvider.MOCK,
        notes: data.notes,
        wabaPhoneNumberId: metaId || null,
        status: WhatsAppNumberStatus.AVAILABLE,
      },
    });
  },

  /**
   * Link a registration Tel to a practice WhatsAppNumber row (admin Meta list).
   * Used when Meta add succeeds (VERIFYING) or for MOCK demos (LIVE).
   * Soft-idempotent: returns existing practice line if already linked.
   */
  async linkRegistrationNumber(
    practiceId: string,
    data: {
      phoneNumber: string;
      displayName?: string;
      wabaPhoneNumberId?: string;
      wabaId?: string;
      status: "LIVE" | "VERIFYING" | "ASSIGNED";
      provider: "MOCK" | "META_CLOUD_API";
      notes?: string;
      twoStepPin?: string;
    },
  ) {
    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
    });
    if (!practice) throw new AppError(404, "Practice not found");

    const phone = digitsOnly(data.phoneNumber);
    if (phone.length < 10) {
      throw new AppError(400, "phoneNumber must be a valid 10-digit Indian mobile");
    }

    const already = await prisma.whatsAppNumber.findUnique({
      where: { practiceId },
    });
    if (already) return already;

    const phoneTaken = await prisma.whatsAppNumber.findUnique({
      where: { phoneNumber: phone },
    });
    if (
      phoneTaken &&
      phoneTaken.practiceId &&
      phoneTaken.practiceId !== practiceId
    ) {
      throw new AppError(
        409,
        "This phone number is already linked to another clinic.",
      );
    }

    const metaId = data.wabaPhoneNumberId?.trim() || "";
    if (metaId) {
      const wabaTaken = await prisma.whatsAppNumber.findFirst({
        where: {
          wabaPhoneNumberId: metaId,
          NOT: { practiceId },
        },
      });
      if (wabaTaken?.practiceId) {
        throw new AppError(
          409,
          "This Meta Phone Number ID is already linked to another clinic.",
        );
      }
    }

    const status =
      data.status === "LIVE"
        ? WhatsAppNumberStatus.LIVE
        : data.status === "ASSIGNED"
          ? WhatsAppNumberStatus.ASSIGNED
          : WhatsAppNumberStatus.VERIFYING;
    const provider =
      data.provider === "META_CLOUD_API"
        ? ProvisioningProvider.META_CLOUD_API
        : ProvisioningProvider.MOCK;

    return prisma.$transaction(async (tx) => {
      const payload = {
        practiceId,
        status,
        provider,
        wabaId: data.wabaId?.trim() || null,
        wabaPhoneNumberId: metaId || null,
        displayName: data.displayName?.trim() || practice.name,
        verificationStatus:
          status === WhatsAppNumberStatus.LIVE ? "verified" : "pending",
        displayNameStatus:
          status === WhatsAppNumberStatus.LIVE ? "approved" : "pending",
        templatesStatus:
          status === WhatsAppNumberStatus.LIVE ? "approved" : "pending",
        activatedAt: status === WhatsAppNumberStatus.LIVE ? new Date() : null,
        notes: data.notes ?? "Linked at registration",
        ...(data.twoStepPin
          ? { twoStepPin: data.twoStepPin.replace(/\D/g, "").slice(0, 6) }
          : {}),
      };

      const row = phoneTaken
        ? await tx.whatsAppNumber.update({
            where: { id: phoneTaken.id },
            data: payload,
          })
        : await tx.whatsAppNumber.create({
            data: { phoneNumber: phone, ...payload },
          });

      await syncPracticeBotPhone(tx, practiceId, phone);
      return row;
    });
  },

  /**
   * Assign next AVAILABLE number to a practice (mock Meta verification advances to LIVE).
   * Sets practice.whatsappBusinessNumber AND practice.phone (profile Tel = bot number).
   * Never stamps the shared env WHATSAPP_PHONE_NUMBER_ID onto this row —
   * each clinic must keep its own Meta Phone Number ID (or null until connected).
   */
  async assignToPractice(
    practiceId: string,
    opts?: { phoneNumber?: string; mockGoLive?: boolean },
  ) {
    const practice = await prisma.practice.findUnique({ where: { id: practiceId } });
    if (!practice) throw new AppError(404, "Practice not found");

    const { assertFeature } = await import("./planEntitlements.js");
    await assertFeature(
      practiceId,
      "whatsappLine",
      "WhatsApp line requires an active Starter+ subscription. Upgrade under Billing.",
    );

    const already = await prisma.whatsAppNumber.findUnique({
      where: { practiceId },
    });
    if (already) {
      throw new AppError(409, "Practice already has a WhatsApp number assigned");
    }

    const number = opts?.phoneNumber
      ? await prisma.whatsAppNumber.findFirst({
          where: {
            phoneNumber: digitsOnly(opts.phoneNumber),
            status: WhatsAppNumberStatus.AVAILABLE,
          },
        })
      : await prisma.whatsAppNumber.findFirst({
          where: { status: WhatsAppNumberStatus.AVAILABLE },
          orderBy: { createdAt: "asc" },
        });

    if (!number) throw new AppError(409, "No available numbers in the pool");

    const mockGoLive = opts?.mockGoLive !== false;
    const nextStatus = mockGoLive
      ? WhatsAppNumberStatus.LIVE
      : WhatsAppNumberStatus.ASSIGNED;

    const updated = await prisma.$transaction(async (tx) => {
      const n = await tx.whatsAppNumber.update({
        where: { id: number.id },
        data: {
          practiceId,
          status: nextStatus,
          verificationStatus: mockGoLive ? "verified" : "pending",
          displayNameStatus: mockGoLive ? "approved" : "pending",
          templatesStatus: mockGoLive ? "approved" : "pending",
          displayName: number.displayName ?? practice.name,
          activatedAt: mockGoLive ? new Date() : null,
          // Keep only this row's own Meta IDs — never copy platform env defaults.
          wabaPhoneNumberId: number.wabaPhoneNumberId || null,
          wabaId: number.wabaId || null,
        },
        include: { practice: { select: { id: true, name: true, slug: true } } },
      });
      await syncPracticeBotPhone(tx, practiceId, n.phoneNumber);
      return n;
    });

    // Platform UTILITY catalog must exist for admin + Meta submission tooling
    void this.syncMetaUtilityTemplates().catch((err) =>
      console.warn("[whatsapp] template sync after assign:", err),
    );
    // Directory listing follows plan entitlement (not forced by WA assign)
    const { getPracticeEntitlement, hasFeatureFlag } = await import(
      "./planEntitlements.js"
    );
    const ent = await getPracticeEntitlement(practiceId);
    await prisma.practice.update({
      where: { id: practiceId },
      data: {
        isDirectoryListed:
          ent.usable && hasFeatureFlag(ent.features, "directory"),
      },
    });

    return updated;
  },

  /**
   * Self-serve: clinic connects their own Meta WhatsApp Business number.
   * Creates or claims a pool row, sets practice phone + whatsappBusinessNumber, goes LIVE.
   */
  async connectOwnNumber(
    practiceId: string,
    data: {
      phoneNumber: string;
      wabaPhoneNumberId?: string;
      wabaId?: string;
    },
  ) {
    const practice = await prisma.practice.findUnique({ where: { id: practiceId } });
    if (!practice) throw new AppError(404, "Practice not found");

    const { assertFeature } = await import("./planEntitlements.js");
    await assertFeature(
      practiceId,
      "whatsappLine",
      "WhatsApp line requires an active Starter+ subscription. Subscribe under Billing first.",
    );

    const already = await prisma.whatsAppNumber.findUnique({
      where: { practiceId },
    });
    if (already) {
      throw new AppError(
        409,
        "This clinic already has a WhatsApp line connected. Contact support to change it.",
      );
    }

    const phone = digitsOnly(data.phoneNumber);
    if (phone.length < 10) {
      throw new AppError(400, "phoneNumber must be a valid 10-digit Indian mobile");
    }

    const phoneNumberId = data.wabaPhoneNumberId?.trim() || "";
    const metaWabaId = data.wabaId?.trim() || "";
    const metaConfigured = Boolean(settings.whatsappAccessToken?.trim());
    if (metaConfigured && !phoneNumberId) {
      throw new AppError(
        400,
        "Meta Phone Number ID is required when WhatsApp Cloud API is configured on the server.",
      );
    }
    if (phoneNumberId) {
      const wabaTaken = await prisma.whatsAppNumber.findFirst({
        where: { wabaPhoneNumberId: phoneNumberId },
      });
      if (wabaTaken) {
        throw new AppError(409, "This Meta Phone Number ID is already linked to another clinic.");
      }
    }

    const existingPhone = await prisma.whatsAppNumber.findUnique({
      where: { phoneNumber: phone },
    });
    if (
      existingPhone &&
      existingPhone.status !== WhatsAppNumberStatus.AVAILABLE &&
      existingPhone.practiceId !== practiceId
    ) {
      throw new AppError(409, "This phone number is already assigned to another clinic.");
    }

    const provider = phoneNumberId
      ? ProvisioningProvider.META_CLOUD_API
      : ProvisioningProvider.MOCK;

    const initialStatus = WhatsAppNumberStatus.LIVE;

    const number = await prisma.$transaction(async (tx) => {
      const payload = {
        practiceId,
        status: initialStatus,
        provider,
        wabaId: metaWabaId || null,
        wabaPhoneNumberId: phoneNumberId || null,
        verificationStatus: "verified",
        displayNameStatus: "approved",
        templatesStatus: "approved",
        displayName: practice.name,
        activatedAt: new Date(),
        notes: metaWabaId
          ? "Embedded Signup — Meta Cloud API (auto-approved)"
          : "Self-serve connect from practice Billing",
      };

      const n = existingPhone
        ? await tx.whatsAppNumber.update({
            where: { id: existingPhone.id },
            data: payload,
            include: { practice: { select: { id: true, name: true, slug: true } } },
          })
        : await tx.whatsAppNumber.create({
            data: {
              phoneNumber: phone,
              ...payload,
            },
            include: { practice: { select: { id: true, name: true, slug: true } } },
          });

      await syncPracticeBotPhone(tx, practiceId, phone);

      return n;
    });

    const { getPracticeEntitlement, hasFeatureFlag } = await import(
      "./planEntitlements.js"
    );
    const ent = await getPracticeEntitlement(practiceId);
    await prisma.practice.update({
      where: { id: practiceId },
      data: {
        isDirectoryListed:
          ent.usable && hasFeatureFlag(ent.features, "directory"),
      },
    });

    const { BillingService } = await import("./billing.service.js");
    const goLive = await BillingService.notifyGoLive(practiceId);

    void this.syncMetaUtilityTemplates().catch((err) =>
      console.warn("[whatsapp] template sync after connect:", err),
    );

    return { number, goLive };
  },

  async advanceStatus(
    numberId: string,
    status: WhatsAppNumberStatus,
    patch?: {
      verificationStatus?: string;
      displayNameStatus?: string;
      templatesStatus?: string;
      wabaPhoneNumberId?: string;
      notes?: string;
    },
  ) {
    const existing = await prisma.whatsAppNumber.findUnique({
      where: { id: numberId },
      select: { id: true, practiceId: true, phoneNumber: true },
    });
    if (!existing) throw new AppError(404, "WhatsApp number not found");

    const data: Prisma.WhatsAppNumberUpdateInput = {
      status,
      ...patch,
    };
    if (status === WhatsAppNumberStatus.LIVE) {
      data.activatedAt = new Date();
    }
    const releasing =
      status === WhatsAppNumberStatus.AVAILABLE ||
      status === WhatsAppNumberStatus.RELEASED;
    if (releasing) {
      data.practice = { disconnect: true };
      data.activatedAt = null;
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.whatsAppNumber.update({
        where: { id: numberId },
        data,
        include: { practice: { select: { id: true, name: true, slug: true } } },
      });
      if (releasing && existing.practiceId) {
        await clearPracticeBotPhone(tx, existing.practiceId);
      } else if (
        status === WhatsAppNumberStatus.LIVE &&
        existing.practiceId
      ) {
        await syncPracticeBotPhone(tx, existing.practiceId, existing.phoneNumber);
      }
      return updated;
    });
  },

  async suspendPracticeLine(practiceId: string) {
    const number = await prisma.whatsAppNumber.findUnique({
      where: { practiceId },
    });

    return prisma.$transaction(async (tx) => {
      let n = null;
      if (number) {
        n = await tx.whatsAppNumber.update({
          where: { id: number.id },
          data: { status: WhatsAppNumberStatus.SUSPENDED },
        });
      }
      await tx.practice.update({
        where: { id: practiceId },
        data: { isDirectoryListed: false },
      });
      const sub = await tx.practiceSubscription.findUnique({
        where: { practiceId },
      });
      if (sub) {
        await tx.practiceSubscription.update({
          where: { id: sub.id },
          data: { status: PracticeSubscriptionStatus.SUSPENDED },
        });
      }
      return n ?? { practiceId, status: WhatsAppNumberStatus.SUSPENDED };
    });
  },

  listPlans() {
    return prisma.docLinePlan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthlyInr: "asc" },
    });
  },

  async ensureDefaultPlans() {
    const defaults = [
      {
        name: "Starter",
        priceMonthlyInr: 1499,
        maxBookingsPerMonth: 150,
        features: {
          directory: true,
          whatsappLine: 1,
          reminders: false,
          reviews: true,
          priorityListing: false,
          multiDoctor: false,
          queueAnalytics: true,
          dedicatedSupport: false,
        },
      },
      {
        name: "Growth",
        priceMonthlyInr: 2999,
        maxBookingsPerMonth: 500,
        features: {
          directory: true,
          whatsappLine: 1,
          reminders: true,
          reviews: true,
          priorityListing: true,
          multiDoctor: true,
          queueAnalytics: true,
          dedicatedSupport: false,
        },
      },
      {
        name: "Clinic",
        priceMonthlyInr: 4999,
        maxBookingsPerMonth: 2000,
        features: {
          directory: true,
          whatsappLine: 1,
          reminders: true,
          reviews: true,
          priorityListing: true,
          multiDoctor: true,
          queueAnalytics: true,
          dedicatedSupport: true,
        },
      },
    ] as const;

    for (const plan of defaults) {
      const existing = await prisma.docLinePlan.findFirst({
        where: { name: plan.name },
      });
      if (!existing) {
        await prisma.docLinePlan.create({
          data: {
            name: plan.name,
            priceMonthlyInr: plan.priceMonthlyInr,
            maxBookingsPerMonth: plan.maxBookingsPerMonth,
            features: plan.features,
            isActive: true,
          },
        });
      } else {
        // Keep catalog features/caps in sync with product matrix.
        await prisma.docLinePlan.update({
          where: { id: existing.id },
          data: {
            priceMonthlyInr: plan.priceMonthlyInr,
            maxBookingsPerMonth: plan.maxBookingsPerMonth,
            features: plan.features,
            isActive: true,
          },
        });
      }
    }

    return prisma.docLinePlan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthlyInr: "asc" },
    });
  },

  async startSubscription(practiceId: string, planId: string) {
    const plan = await prisma.docLinePlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw new AppError(404, "Plan not found");

    const existing = await prisma.practiceSubscription.findUnique({
      where: { practiceId },
    });
    if (existing) throw new AppError(409, "Practice already has a subscription");

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const sub = await prisma.practiceSubscription.create({
      data: {
        practiceId,
        planId,
        status: PracticeSubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        notes: "Created via ops API (Razorpay webhook wiring pending)",
      },
      include: { plan: true },
    });

    const { BillingService } = await import("./billing.service.js");
    await BillingService.syncDirectoryForPractice(practiceId);

    return sub;
  },

  /**
   * Admin: start or renew a trial. `trialDays` omitted / null / 0 = open-ended
   * (no period end — ops must convert or suspend later).
   */
  async startTrial(
    practiceId: string,
    planId: string,
    trialDays?: number | null,
  ) {
    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
    });
    if (!practice) throw new AppError(404, "Practice not found");

    const plan = await prisma.docLinePlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw new AppError(404, "Plan not found");

    const days =
      trialDays == null || Number.isNaN(Number(trialDays))
        ? null
        : Math.floor(Number(trialDays));
    if (days != null && (days < 0 || days > 3650)) {
      throw new AppError(400, "trialDays must be between 0 and 3650 (0 = open-ended)");
    }

    const now = new Date();
    const openEnded = days == null || days === 0;
    const periodEnd = openEnded
      ? null
      : (() => {
          const end = new Date(now);
          end.setDate(end.getDate() + days!);
          return end;
        })();

    const note = openEnded
      ? `Open-ended trial (${plan.name}) started by admin ${now.toISOString()}`
      : `${days}-day trial (${plan.name}) started by admin ${now.toISOString()}`;

    const existing = await prisma.practiceSubscription.findUnique({
      where: { practiceId },
    });

    const sub = existing
      ? await prisma.practiceSubscription.update({
          where: { id: existing.id },
          data: {
            planId,
            pendingPlanId: null,
            pendingRazorpaySubscriptionId: null,
            status: PracticeSubscriptionStatus.TRIALING,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            gracePeriodEnd: null,
            cancelAtPeriodEnd: false,
            cancelledAt: null,
            notes: existing.notes ? `${existing.notes}\n${note}` : note,
          },
          include: { plan: true, practice: { select: { id: true, name: true, slug: true } } },
        })
      : await prisma.practiceSubscription.create({
          data: {
            practiceId,
            planId,
            status: PracticeSubscriptionStatus.TRIALING,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            notes: note,
          },
          include: { plan: true, practice: { select: { id: true, name: true, slug: true } } },
        });

    const { BillingService } = await import("./billing.service.js");
    await BillingService.syncDirectoryForPractice(practiceId);

    return {
      subscription: sub,
      trialDays: openEnded ? null : days,
      openEnded,
      currentPeriodEnd: periodEnd,
    };
  },

  listTemplates(practiceId?: string) {
    return prisma.messageTemplate.findMany({
      where: practiceId ? { OR: [{ practiceId }, { practiceId: null }] } : undefined,
      orderBy: { updatedAt: "desc" },
    });
  },

  createTemplate(data: {
    name: string;
    category: string;
    body: string;
    language?: string;
    practiceId?: string;
    status?: MessageTemplateStatus;
    metaName?: string;
  }) {
    return prisma.messageTemplate.create({
      data: {
        name: data.name,
        category: data.category,
        body: data.body,
        language: data.language ?? "en",
        practiceId: data.practiceId,
        status: data.status ?? MessageTemplateStatus.DRAFT,
        metaName: data.metaName,
      },
    });
  },

  /** Upsert platform-wide Meta UTILITY templates for admin review / Meta submission. */
  async syncMetaUtilityTemplates() {
    const { META_UTILITY_TEMPLATES } = await import("./whatsapp.metaTemplates.js");
    const results = [];
    for (const t of META_UTILITY_TEMPLATES) {
      const existing = await prisma.messageTemplate.findFirst({
        where: { metaName: t.metaName, practiceId: null },
      });
      if (existing) {
        results.push(
          await prisma.messageTemplate.update({
            where: { id: existing.id },
            data: {
              name: t.key,
              category: t.category,
              body: t.body,
              language: t.language,
              status: existing.status,
            },
          }),
        );
      } else {
        results.push(
          await prisma.messageTemplate.create({
            data: {
              name: t.key,
              metaName: t.metaName,
              category: t.category,
              body: t.body,
              language: t.language,
              status: MessageTemplateStatus.DRAFT,
              practiceId: null,
            },
          }),
        );
      }
    }
    return results;
  },

  /** Resolve practice for inbound WhatsApp `to` (phone) or Meta `phone_number_id`. */
  async findPracticeByWhatsAppTo(to: string, wabaPhoneNumberId?: string) {
    const practiceInclude = {
      locations: { where: { isActive: true }, take: 5 },
      members: {
        where: {
          isActive: true,
          role: { in: ["DOCTOR", "PRACTICE_OWNER"] as (
            | "DOCTOR"
            | "PRACTICE_OWNER"
          )[] },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
              doctor: { select: { contactNumbers: true } },
            },
          },
        },
      },
    };
    const include = {
      practice: {
        include: practiceInclude,
      },
    };

    const activeStatuses = [
      WhatsAppNumberStatus.LIVE,
      WhatsAppNumberStatus.TEMPLATES_PENDING,
      WhatsAppNumberStatus.DISPLAY_NAME_PENDING,
      WhatsAppNumberStatus.VERIFYING,
    ] as const;

    const phone = digitsOnly(to);
    const metaId = wabaPhoneNumberId?.trim() || "";

    // 1) Prefer the display phone (`to`) — each clinic line has a unique phoneNumber.
    //    Never route solely by a shared/stale Meta phone_number_id first.
    if (phone.length >= 10) {
      const fromPool = await prisma.whatsAppNumber.findFirst({
        where: {
          phoneNumber: { endsWith: phone },
          status: { in: [...activeStatuses] },
        },
        include,
      });
      if (fromPool?.practice) {
        if (
          metaId &&
          fromPool.wabaPhoneNumberId &&
          fromPool.wabaPhoneNumberId !== metaId
        ) {
          console.warn(
            `[whatsapp] phone ${phone} matched clinic ${fromPool.practiceId} ` +
              `but Meta id ${metaId} ≠ stored ${fromPool.wabaPhoneNumberId}`,
          );
        }
        return fromPool.practice;
      }

      const fromPractice = await prisma.practice.findFirst({
        where: {
          OR: [
            { whatsappBusinessNumber: { endsWith: phone } },
            { whatsappBusinessNumber: phone },
          ],
          isActive: true,
        },
        include: practiceInclude,
      });
      if (fromPractice) return fromPractice;
    }

    // 2) Meta phone_number_id only when unique (ambiguous shared IDs must not pick one clinic).
    if (metaId) {
      const byWaba = await prisma.whatsAppNumber.findMany({
        where: {
          wabaPhoneNumberId: metaId,
          status: { in: [...activeStatuses] },
        },
        include,
        take: 5,
      });
      if (byWaba.length === 1 && byWaba[0]?.practice) {
        return byWaba[0].practice;
      }
      if (byWaba.length > 1) {
        console.warn(
          `[whatsapp] ambiguous Meta phone id ${metaId} matches ${byWaba.length} lines — refusing route`,
        );
        return null;
      }
    }

    return null;
  },
};
