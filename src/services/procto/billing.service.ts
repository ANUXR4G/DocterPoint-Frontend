import {
  PracticeSubscriptionStatus,
  WhatsAppNumberStatus,
} from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { NumberPoolService } from "./numberPool.service.js";
import { AppError } from "../../core/response.js";
import { settings, publicWebOrigin } from "../../config/index.js";
import { PracticeService } from "./practice.service.js";
import { razorpay } from "../../lib/razorpay.js";
import {
  getPracticeEntitlement,
  hasFeatureFlag,
  type PlanFeatures,
} from "./planEntitlements.js";
import { broadcastOpsInvalidate } from "../opsSocket.js";

async function ensureRazorpayPlanId(plan: {
  id: string;
  name: string;
  priceMonthlyInr: number;
  razorpayPlanId: string | null;
}): Promise<string | null> {
  if (!razorpay.isConfigured()) return null;
  if (plan.razorpayPlanId) return plan.razorpayPlanId;

  const created = await razorpay.createPlan({
    period: "monthly",
    interval: 1,
    item: {
      name: `GlucoGuide ${plan.name}`,
      amount: plan.priceMonthlyInr * 100,
      currency: "INR",
      description: `GlucoGuide ${plan.name} monthly`,
    },
  });

  await prisma.docLinePlan.update({
    where: { id: plan.id },
    data: { razorpayPlanId: created.id },
  });
  return created.id;
}

async function syncDirectoryFromPlan(
  practiceId: string,
  status: PracticeSubscriptionStatus,
  features: PlanFeatures,
) {
  const listed =
    (status === PracticeSubscriptionStatus.ACTIVE ||
      status === PracticeSubscriptionStatus.TRIALING ||
      status === PracticeSubscriptionStatus.PAST_DUE ||
      status === PracticeSubscriptionStatus.GRACE) &&
    hasFeatureFlag(features, "directory");

  await prisma.practice.update({
    where: { id: practiceId },
    data: {
      isDirectoryListed: listed,
      isActive:
        status !== PracticeSubscriptionStatus.SUSPENDED &&
        status !== PracticeSubscriptionStatus.CANCELLED,
    },
  });
}

/** Re-sync directory listing from current subscription (admin / ops). */
async function syncDirectoryForPractice(practiceId: string) {
  const sub = await prisma.practiceSubscription.findUnique({
    where: { practiceId },
    include: { plan: true },
  });
  if (!sub) {
    await prisma.practice.update({
      where: { id: practiceId },
      data: { isDirectoryListed: false },
    });
    return;
  }
  await syncDirectoryFromPlan(
    practiceId,
    sub.status,
    (sub.plan.features ?? {}) as PlanFeatures,
  );
}

function isUsableStatus(status: PracticeSubscriptionStatus) {
  return (
    status === PracticeSubscriptionStatus.ACTIVE ||
    status === PracticeSubscriptionStatus.TRIALING ||
    status === PracticeSubscriptionStatus.PAST_DUE ||
    status === PracticeSubscriptionStatus.GRACE
  );
}

function oneMonthFrom(date: Date) {
  const end = new Date(date);
  end.setMonth(end.getMonth() + 1);
  return end;
}

function unixToDate(value: unknown): Date | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Razorpay uses seconds
  return new Date(n > 1e12 ? n : n * 1000);
}

function extractPracticeIdFromNotes(notes: unknown): string | null {
  if (notes == null) return null;
  if (typeof notes === "string") {
    const trimmed = notes.trim();
    if (trimmed && trimmed !== "[object Object]") return trimmed;
    return null;
  }
  if (typeof notes === "object") {
    const rec = notes as Record<string, unknown>;
    const id = rec.practiceId ?? rec.practice_id;
    if (id != null && String(id).trim()) return String(id).trim();
  }
  return null;
}

function isCheckoutPending(sub: {
  pendingPlanId: string | null;
  pendingRazorpaySubscriptionId: string | null;
}) {
  return Boolean(sub.pendingRazorpaySubscriptionId && sub.pendingPlanId);
}

function isScheduledPlanChange(sub: {
  pendingPlanId: string | null;
  pendingRazorpaySubscriptionId: string | null;
}) {
  return Boolean(sub.pendingPlanId && !sub.pendingRazorpaySubscriptionId);
}

/**
 * GlucoGuide subscription lifecycle (Razorpay Checkout + webhooks → practice_subscriptions).
 * Falls back to mock activate when RAZORPAY_* keys are unset.
 */
export const BillingService = {
  async listPlans() {
    return NumberPoolService.ensureDefaultPlans();
  },

  async syncDirectoryForPractice(practiceId: string) {
    return syncDirectoryForPractice(practiceId);
  },

  async listSubscriptions() {
    return prisma.practiceSubscription.findMany({
      include: {
        plan: true,
        practice: { select: { id: true, name: true, slug: true, isDirectoryListed: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  },

  /** Practice owner/admin view of current subscription + available plans. */
  async getPracticeBilling(practiceId: string, actorUserId: string) {
    await PracticeService.assertMember(practiceId, actorUserId);
    const [plans, subscription, practice, entitlement] = await Promise.all([
      this.listPlans(),
      prisma.practiceSubscription.findUnique({
        where: { practiceId },
        include: { plan: true, pendingPlan: true },
      }),
      prisma.practice.findUnique({
        where: { id: practiceId },
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          isDirectoryListed: true,
          isActive: true,
          email: true,
          phone: true,
          whatsappNumber: {
            select: {
              phoneNumber: true,
              status: true,
              wabaId: true,
              wabaPhoneNumberId: true,
              templatesStatus: true,
              displayNameStatus: true,
              activatedAt: true,
              provider: true,
            },
          },
          whatsappBusinessNumber: true,
        },
      }),
      getPracticeEntitlement(practiceId),
    ]);
    if (!practice) throw new AppError(404, "Practice not found");
    const waPhone =
      practice.whatsappNumber?.phoneNumber ??
      practice.whatsappBusinessNumber ??
      null;
    const metaConfigured = Boolean(settings.whatsappAccessToken?.trim());
    const { MetaWhatsAppService } = await import("./metaWhatsApp.service.js");
    const metaPublic = MetaWhatsAppService.getPublicConfig();
    return {
      practice,
      subscription,
      plans,
      entitlement,
      scheduledPlan:
        subscription && isScheduledPlanChange(subscription)
          ? subscription.pendingPlan
          : null,
      pendingCheckoutPlan:
        subscription && isCheckoutPending(subscription)
          ? subscription.pendingPlan
          : null,
      razorpayConfigured: razorpay.isConfigured(),
      razorpayKeyId: razorpay.isConfigured() ? razorpay.keyId : null,
      whatsappSetup: {
        metaConfigured,
        webhookPath: "/api/v1/procto/whatsapp/webhook",
        waMeLink: waPhone ? this.waMeLink(String(waPhone)) : null,
        canConnect:
          Boolean(entitlement?.usable) &&
          hasFeatureFlag(entitlement?.features ?? {}, "whatsappLine") &&
          !practice.whatsappNumber,
        embeddedSignupEnabled: metaPublic.embeddedSignupEnabled,
        autoResolveEnabled: metaPublic.autoResolveEnabled,
        metaAppId: metaPublic.appId,
        metaConfigId: metaPublic.configId,
        metaApiVersion: metaPublic.apiVersion,
        coexistenceFlow: metaPublic.coexistenceFlow,
      },
    };
  },

  /**
   * Self-serve: trial (local), activate/change via Razorpay Checkout when configured,
   * else mock activate for local/dev.
   */
  async selectPlan(
    practiceId: string,
    planId: string,
    actorUserId: string,
    mode: "trial" | "activate" | "change" = "activate",
  ) {
    await PracticeService.assertProfileEditor(practiceId, actorUserId, "the plan");
    const plan = await prisma.docLinePlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw new AppError(404, "Plan not found");

    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
    });
    if (!practice) throw new AppError(404, "Practice not found");

    const existing = await prisma.practiceSubscription.findUnique({
      where: { practiceId },
      include: { plan: true },
    });

    const now = new Date();
    const periodEnd = new Date(now);
    if (mode === "trial") {
      periodEnd.setDate(periodEnd.getDate() + 14);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    const isUpgrade =
      existing != null &&
      plan.priceMonthlyInr > (existing.plan?.priceMonthlyInr ?? 0);
    const isDowngrade =
      existing != null &&
      plan.priceMonthlyInr < (existing.plan?.priceMonthlyInr ?? 0);
    const requiresRazorpayCheckout =
      mode !== "trial" && (mode === "activate" || isUpgrade);

    // Downgrade / lateral switch — takes effect when current period ends
    if (mode === "change" && existing && !isUpgrade) {
      if (!isUsableStatus(existing.status)) {
        throw new AppError(
          400,
          "An active subscription is required to change plans.",
        );
      }
      if (!existing.currentPeriodEnd) {
        throw new AppError(
          400,
          "Current plan period end is unknown — cannot schedule a change.",
        );
      }
      if (existing.planId === plan.id) {
        throw new AppError(400, "You are already on this plan.");
      }

      const sub = await prisma.practiceSubscription.update({
        where: { id: existing.id },
        data: {
          pendingPlanId: plan.id,
          pendingRazorpaySubscriptionId: null,
          notes: `${isDowngrade ? "Downgrade" : "Plan change"} to ${plan.name} scheduled for ${existing.currentPeriodEnd.toISOString()}`,
        },
        include: { plan: true, pendingPlan: true },
      });

      return {
        subscription: sub,
        scheduledPlan: sub.pendingPlan,
        checkout: null,
        effectiveAt: existing.currentPeriodEnd,
      };
    }

    // Paid flow with Razorpay (new subscription or upgrade to higher tier)
    if (requiresRazorpayCheckout && razorpay.isConfigured()) {
      const rpPlanId = await ensureRazorpayPlanId(plan);
      if (!rpPlanId) throw new AppError(503, "Could not create Razorpay plan");

      const contact =
        (practice.phone || "").replace(/\D/g, "").slice(-10) || "9999999999";
      const customer = existing?.razorpayCustomerId
        ? { id: existing.razorpayCustomerId }
        : await razorpay.createCustomer({
            name: practice.name,
            email: practice.email || undefined,
            contact,
            notes: { practiceId },
          });

      const rpSub = await razorpay.createSubscription({
        plan_id: rpPlanId,
        total_count: 120,
        customer_notify: 1,
        customer_id: customer.id,
        notes: { practiceId, planId: plan.id, planName: plan.name },
      });

      const sub =
        existing != null
          ? await prisma.practiceSubscription.update({
              where: { id: existing.id },
              data: {
                pendingPlanId: plan.id,
                pendingRazorpaySubscriptionId: rpSub.id,
                razorpayCustomerId: customer.id,
                notes: `Checkout pending for ${plan.name} (${rpSub.id})`,
              },
              include: { plan: true, pendingPlan: true },
            })
          : await prisma.practiceSubscription.create({
              data: {
                practiceId,
                planId: plan.id,
                pendingPlanId: plan.id,
                pendingRazorpaySubscriptionId: rpSub.id,
                status: PracticeSubscriptionStatus.SUSPENDED,
                razorpayCustomerId: customer.id,
                notes: `Checkout pending for ${plan.name} (${rpSub.id})`,
              },
              include: { plan: true, pendingPlan: true },
            });

      return {
        subscription: sub,
        pendingPlan: sub.pendingPlan,
        checkout: {
          keyId: razorpay.keyId,
          subscriptionId: rpSub.id,
          planName: plan.name,
          amountInr: plan.priceMonthlyInr,
        },
      };
    }

    // Trial or mock activate (no Razorpay keys)
    const nextStatus =
      mode === "trial"
        ? PracticeSubscriptionStatus.TRIALING
        : PracticeSubscriptionStatus.ACTIVE;

    const sub =
      existing != null
        ? await prisma.practiceSubscription.update({
            where: { id: existing.id },
            data: {
              planId,
              pendingPlanId: null,
              pendingRazorpaySubscriptionId: null,
              status: nextStatus,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              gracePeriodEnd: null,
              cancelAtPeriodEnd: false,
              cancelledAt: null,
              notes:
                mode === "trial"
                  ? "14-day trial started from practice portal"
                  : `Activated ${plan.name}.`,
            },
            include: { plan: true },
          })
        : await prisma.practiceSubscription.create({
            data: {
              practiceId,
              planId,
              status: nextStatus,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              notes:
                mode === "trial"
                  ? "14-day trial started from practice portal"
                  : `Activated ${plan.name}.`,
            },
            include: { plan: true },
          });

    await syncDirectoryFromPlan(
      practiceId,
      nextStatus,
      (plan.features ?? {}) as PlanFeatures,
    );

    return { subscription: sub, checkout: null };
  },

  /** Called after Razorpay Checkout success (or webhook) to flip ACTIVE. */
  async confirmCheckout(
    practiceId: string,
    actorUserId: string,
    payment?: {
      razorpayPaymentId?: string;
      razorpaySubscriptionId?: string;
      razorpaySignature?: string;
    },
  ) {
    await PracticeService.assertProfileEditor(practiceId, actorUserId, "the plan");

    if (razorpay.isConfigured()) {
      if (!payment?.razorpayPaymentId) {
        throw new AppError(
          400,
          "Razorpay payment details are required to confirm checkout",
        );
      }
      const sub = await prisma.practiceSubscription.findUnique({
        where: { practiceId },
      });
      const remoteSubId =
        payment.razorpaySubscriptionId ??
        sub?.pendingRazorpaySubscriptionId ??
        sub?.razorpaySubscriptionId ??
        "";
      if (!remoteSubId) {
        throw new AppError(400, "Missing Razorpay subscription id");
      }
      if (
        sub?.razorpaySubscriptionId &&
        sub.razorpaySubscriptionId !== remoteSubId &&
        sub.pendingRazorpaySubscriptionId !== remoteSubId
      ) {
        throw new AppError(400, "Subscription id mismatch");
      }
      if (
        !razorpay.verifySubscriptionPaymentSignature(
          payment.razorpayPaymentId,
          remoteSubId,
          payment.razorpaySignature,
        )
      ) {
        throw new AppError(400, "Invalid Razorpay payment signature");
      }

      // Persist payment ids even before markActive so webhook recovery works
      // if a later step fails mid-request.
      if (sub && sub.pendingRazorpaySubscriptionId === remoteSubId) {
        await prisma.practiceSubscription.update({
          where: { id: sub.id },
          data: {
            notes: sub.notes
              ? `${sub.notes}\nPayment ${payment.razorpayPaymentId} received`
              : `Payment ${payment.razorpayPaymentId} received`,
          },
        });
      }
    }

    const subscription = await this.markActive(practiceId);
    const entitlement = await getPracticeEntitlement(practiceId);
    return { subscription, entitlement };
  },

  /**
   * Clear incomplete checkout UI state.
   * Never deletes the subscription row after a paid attempt — keeps pending
   * Razorpay ids so webhooks / retry confirm can still activate features.
   */
  async cancelPendingCheckout(practiceId: string, actorUserId: string) {
    await PracticeService.assertProfileEditor(practiceId, actorUserId, "the plan");
    const sub = await prisma.practiceSubscription.findUnique({
      where: { practiceId },
      include: { plan: true, pendingPlan: true },
    });
    if (!sub?.pendingRazorpaySubscriptionId) {
      return sub;
    }

    // If already usable (upgrade cancel), clear pending only.
    // If not usable (first subscribe abandoned), KEEP pending Razorpay ids so
    // a late webhook / retry confirm can still markActive after money was taken.
    return prisma.practiceSubscription.update({
      where: { id: sub.id },
      data: {
        ...(isUsableStatus(sub.status)
          ? {
              pendingPlanId: null,
              pendingRazorpaySubscriptionId: null,
            }
          : {}),
        notes: sub.notes
          ? `${sub.notes}\nCheckout dismissed ${new Date().toISOString()}`
          : `Checkout dismissed ${new Date().toISOString()}`,
      },
      include: { plan: true, pendingPlan: true },
    });
  },

  async markActive(
    practiceId: string,
    opts?: {
      periodStart?: Date;
      periodEnd?: Date;
      razorpaySubscriptionId?: string;
    },
  ) {
    const sub = await prisma.practiceSubscription.findUnique({
      where: { practiceId },
      include: { plan: true, pendingPlan: true },
    });
    if (!sub) throw new AppError(404, "No subscription for practice");

    const targetPlanId = sub.pendingPlanId ?? sub.planId;
    const targetPlan =
      sub.pendingPlan ??
      (await prisma.docLinePlan.findUnique({ where: { id: targetPlanId } }));
    if (!targetPlan) throw new AppError(404, "Plan not found");

    // Idempotent: already active on the target plan with no pending checkout
    if (
      sub.status === PracticeSubscriptionStatus.ACTIVE &&
      sub.planId === targetPlanId &&
      !sub.pendingPlanId &&
      !sub.pendingRazorpaySubscriptionId
    ) {
      await syncDirectoryFromPlan(
        practiceId,
        PracticeSubscriptionStatus.ACTIVE,
        (targetPlan.features ?? {}) as PlanFeatures,
      );
      return sub;
    }

    const now = opts?.periodStart ?? new Date();
    const end = opts?.periodEnd ?? oneMonthFrom(now);
    const razorpaySubId =
      opts?.razorpaySubscriptionId ??
      sub.pendingRazorpaySubscriptionId ??
      sub.razorpaySubscriptionId;

    const updated = await prisma.practiceSubscription.update({
      where: { id: sub.id },
      data: {
        planId: targetPlanId,
        pendingPlanId: null,
        razorpaySubscriptionId: razorpaySubId,
        pendingRazorpaySubscriptionId: null,
        status: PracticeSubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: end,
        gracePeriodEnd: null,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        notes: sub.notes
          ? `${sub.notes}\nActivated ${now.toISOString()} → ${targetPlan.name}`
          : `Activated ${now.toISOString()} → ${targetPlan.name}`,
      },
      include: { plan: true, pendingPlan: true },
    });
    await syncDirectoryFromPlan(
      practiceId,
      PracticeSubscriptionStatus.ACTIVE,
      (targetPlan.features ?? {}) as PlanFeatures,
    );
    void broadcastOpsInvalidate("payments").catch(() => undefined);
    void broadcastOpsInvalidate("clinics").catch(() => undefined);
    return updated;
  },

  /** Cancel a downgrade / lateral change scheduled for period end. */
  async cancelScheduledPlanChange(practiceId: string, actorUserId: string) {
    await PracticeService.assertProfileEditor(practiceId, actorUserId, "the plan");
    const sub = await prisma.practiceSubscription.findUnique({
      where: { practiceId },
      include: { plan: true, pendingPlan: true },
    });
    if (!sub || !isScheduledPlanChange(sub)) {
      return sub;
    }
    return prisma.practiceSubscription.update({
      where: { id: sub.id },
      data: {
        pendingPlanId: null,
        notes: sub.notes
          ? `${sub.notes}\nScheduled plan change cancelled ${new Date().toISOString()}`
          : `Scheduled plan change cancelled ${new Date().toISOString()}`,
      },
      include: { plan: true, pendingPlan: true },
    });
  },

  /** Apply downgrades scheduled for period end; new plan gets a fresh 1-month term. */
  async processScheduledPlanChanges() {
    const now = new Date();
    const due = await prisma.practiceSubscription.findMany({
      where: {
        pendingPlanId: { not: null },
        pendingRazorpaySubscriptionId: null,
        currentPeriodEnd: { lte: now },
        status: {
          in: [
            PracticeSubscriptionStatus.ACTIVE,
            PracticeSubscriptionStatus.TRIALING,
            PracticeSubscriptionStatus.PAST_DUE,
            PracticeSubscriptionStatus.GRACE,
          ],
        },
      },
      include: { plan: true, pendingPlan: true },
    });

    const results = [];
    for (const sub of due) {
      if (!sub.pendingPlanId || !sub.pendingPlan) continue;
      const periodStart = now;
      const periodEnd = oneMonthFrom(periodStart);
      const updated = await prisma.practiceSubscription.update({
        where: { id: sub.id },
        data: {
          planId: sub.pendingPlanId,
          pendingPlanId: null,
          status: PracticeSubscriptionStatus.ACTIVE,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          notes: sub.notes
            ? `${sub.notes}\nApplied scheduled plan ${sub.pendingPlan.name} ${now.toISOString()}`
            : `Applied scheduled plan ${sub.pendingPlan.name} ${now.toISOString()}`,
        },
        include: { plan: true },
      });
      await syncDirectoryFromPlan(
        sub.practiceId,
        PracticeSubscriptionStatus.ACTIVE,
        (sub.pendingPlan.features ?? {}) as PlanFeatures,
      );
      results.push(updated);
    }
    return { processed: results.length };
  },

  /** Payment failed → grace window, then suspend if still unresolved. */
  async markPastDue(practiceId: string, graceDays = 3) {
    const sub = await prisma.practiceSubscription.findUnique({ where: { practiceId } });
    if (!sub) throw new AppError(404, "No subscription for practice");
    const grace = new Date();
    grace.setDate(grace.getDate() + graceDays);
    return prisma.practiceSubscription.update({
      where: { id: sub.id },
      data: {
        status: PracticeSubscriptionStatus.PAST_DUE,
        gracePeriodEnd: grace,
      },
    });
  },

  async suspendForNonPayment(practiceId: string) {
    return NumberPoolService.suspendPracticeLine(practiceId);
  },

  /** Cron/job: grace expirations + scheduled downgrades at period end. */
  async processGraceExpirations() {
    const scheduled = await this.processScheduledPlanChanges();
    const due = await prisma.practiceSubscription.findMany({
      where: {
        status: { in: [PracticeSubscriptionStatus.PAST_DUE, PracticeSubscriptionStatus.GRACE] },
        gracePeriodEnd: { lte: new Date() },
      },
    });
    const results = [];
    for (const s of due) {
      results.push(await this.suspendForNonPayment(s.practiceId));
    }
    return {
      processed: results.length,
      scheduledPlanChanges: scheduled.processed,
    };
  },

  /**
   * Handle Razorpay subscription + payment events (or admin simulate).
   * When RAZORPAY_WEBHOOK_SECRET is set, callers should verify signature first.
   */
  async handleWebhookEvent(event: {
    event?: string;
    payload?: Record<string, unknown>;
  }) {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const name = String(event.event || "");

    const subscriptionEntity = (
      payload.subscription as { entity?: Record<string, unknown> } | undefined
    )?.entity;
    const paymentEntity = (
      payload.payment as { entity?: Record<string, unknown> } | undefined
    )?.entity;
    const invoiceEntity = (
      payload.invoice as { entity?: Record<string, unknown> } | undefined
    )?.entity;

    let razorpaySubId: string | undefined;
    if (subscriptionEntity?.id != null) {
      razorpaySubId = String(subscriptionEntity.id);
    } else if (paymentEntity?.subscription_id != null) {
      razorpaySubId = String(paymentEntity.subscription_id);
    } else if (invoiceEntity?.subscription_id != null) {
      razorpaySubId = String(invoiceEntity.subscription_id);
    }

    const status = subscriptionEntity?.status
      ? String(subscriptionEntity.status)
      : undefined;

    let sub = razorpaySubId
      ? await prisma.practiceSubscription.findFirst({
          where: {
            OR: [
              { razorpaySubscriptionId: razorpaySubId },
              { pendingRazorpaySubscriptionId: razorpaySubId },
            ],
          },
          include: { plan: true, pendingPlan: true },
        })
      : null;

    // Fallback: notes may carry practiceId
    const notesSource =
      subscriptionEntity?.notes ??
      paymentEntity?.notes ??
      invoiceEntity?.notes;
    if (!sub && notesSource) {
      const practiceId = extractPracticeIdFromNotes(notesSource);
      if (practiceId) {
        sub = await prisma.practiceSubscription.findUnique({
          where: { practiceId },
          include: { plan: true, pendingPlan: true },
        });
      }
    }

    // Payment-only: look up subscription from Razorpay API
    if (!sub && razorpaySubId && razorpay.isConfigured()) {
      try {
        const remote = await razorpay.getSubscription(razorpaySubId);
        const practiceId = extractPracticeIdFromNotes(remote.notes ?? undefined);
        if (practiceId) {
          sub = await prisma.practiceSubscription.findUnique({
            where: { practiceId },
            include: { plan: true, pendingPlan: true },
          });
        }
      } catch {
        /* ignore API lookup failures */
      }
    }

    // payment.captured without subscription_id — fetch payment notes
    if (
      !sub &&
      !razorpaySubId &&
      paymentEntity?.id &&
      razorpay.isConfigured()
    ) {
      try {
        const payment = await razorpay.getPayment(String(paymentEntity.id));
        razorpaySubId = payment.subscription_id
          ? String(payment.subscription_id)
          : undefined;
        const practiceId = extractPracticeIdFromNotes(payment.notes);
        if (practiceId) {
          sub = await prisma.practiceSubscription.findUnique({
            where: { practiceId },
            include: { plan: true, pendingPlan: true },
          });
        } else if (razorpaySubId) {
          sub = await prisma.practiceSubscription.findFirst({
            where: {
              OR: [
                { razorpaySubscriptionId: razorpaySubId },
                { pendingRazorpaySubscriptionId: razorpaySubId },
              ],
            },
            include: { plan: true, pendingPlan: true },
          });
        }
      } catch {
        /* ignore */
      }
    }

    if (!sub) {
      return { ok: false, reason: "subscription_not_found", event: name };
    }

    const activates =
      name === "subscription.activated" ||
      name === "subscription.charged" ||
      name === "subscription.completed" ||
      name === "payment.captured" ||
      name === "invoice.paid" ||
      name.includes("activated") ||
      name.includes("charged") ||
      status === "active" ||
      status === "authenticated";

    if (activates) {
      const periodStart = unixToDate(
        subscriptionEntity?.current_start ?? invoiceEntity?.billing_start,
      );
      const periodEnd = unixToDate(
        subscriptionEntity?.current_end ?? invoiceEntity?.billing_end,
      );
      await this.markActive(sub.practiceId, {
        periodStart: periodStart ?? undefined,
        periodEnd: periodEnd ?? undefined,
        razorpaySubscriptionId: razorpaySubId,
      });
      return { ok: true, action: "activated", practiceId: sub.practiceId };
    }

    if (
      name === "subscription.pending" ||
      name === "subscription.halted" ||
      name.includes("pending") ||
      name.includes("halted") ||
      status === "pending" ||
      status === "halted"
    ) {
      await this.markPastDue(sub.practiceId);
      return { ok: true, action: "past_due", practiceId: sub.practiceId };
    }

    if (
      name === "subscription.cancelled" ||
      name.includes("cancelled") ||
      status === "cancelled"
    ) {
      await this.suspendForNonPayment(sub.practiceId);
      return { ok: true, action: "suspended", practiceId: sub.practiceId };
    }

    return { ok: true, action: "ignored", event: name };
  },

  waMeLink(phoneDigits: string): string {
    const d = phoneDigits.replace(/\D/g, "").slice(-10);
    return `https://wa.me/91${d}`;
  },

  /** After number goes LIVE — shareable wa.me + directory link for clinic ops. */
  async notifyGoLive(practiceId: string) {
    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      include: { whatsappNumber: true, subscription: { include: { plan: true } } },
    });
    if (!practice?.whatsappNumber) {
      throw new AppError(404, "No WhatsApp number on practice");
    }
    const phone = practice.whatsappNumber.phoneNumber;
    const link = this.waMeLink(phone);
    const origin = publicWebOrigin();
    const profileUrl = `${origin}/practices/${practice.slug}`;
    const message =
      `Your GlucoGuide WhatsApp line is live.\n` +
      `Patient link: ${link}\n` +
      `Directory: ${profileUrl}\n` +
      `Share the wa.me link / QR on clinic signage.`;

    const status =
      practice.subscription?.status ?? PracticeSubscriptionStatus.ACTIVE;
    const features = (practice.subscription?.plan?.features ?? {
      directory: true,
    }) as PlanFeatures;
    await syncDirectoryFromPlan(practiceId, status, features);

    await prisma.whatsAppNumber.update({
      where: { id: practice.whatsappNumber.id },
      data: {
        status: WhatsAppNumberStatus.LIVE,
        activatedAt: new Date(),
        notes: [practice.whatsappNumber.notes, message].filter(Boolean).join("\n---\n"),
      },
    });

    return { link, profileUrl, message };
  },
};
