import { PracticeSubscriptionStatus } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../core/response.js";

export type PlanFeatures = {
  directory?: boolean;
  whatsappLine?: boolean | number;
  reminders?: boolean;
  reviews?: boolean;
  priorityListing?: boolean;
  multiDoctor?: boolean;
  queueAnalytics?: boolean;
  dedicatedSupport?: boolean;
  [key: string]: unknown;
};

export type PracticeEntitlement = {
  practiceId: string;
  status: PracticeSubscriptionStatus | null;
  planName: string | null;
  planId: string | null;
  maxBookingsPerMonth: number | null;
  features: PlanFeatures;
  usable: boolean;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  bookingsUsedThisPeriod: number;
};

type FeatureMap = Record<string, boolean | number | string | null | undefined>;

/** ACTIVE / TRIALING / PAST_DUE / GRACE still get soft access; SUSPENDED / CANCELLED do not. */
export function isSubscriptionUsable(
  status: PracticeSubscriptionStatus | null | undefined,
): boolean {
  return (
    status === PracticeSubscriptionStatus.ACTIVE ||
    status === PracticeSubscriptionStatus.TRIALING ||
    status === PracticeSubscriptionStatus.PAST_DUE ||
    status === PracticeSubscriptionStatus.GRACE
  );
}

export function hasFeatureFlag(
  features: PlanFeatures | FeatureMap | null | undefined,
  key: string,
): boolean {
  if (!features) return false;
  const value = (features as FeatureMap)[key];
  return value === true || value === 1 || value === "true";
}

export async function getPracticeEntitlement(
  practiceId: string,
): Promise<PracticeEntitlement> {
  const sub = await prisma.practiceSubscription.findUnique({
    where: { practiceId },
    include: { plan: true },
  });

  const features = (sub?.plan?.features ?? {}) as PlanFeatures;
  const usable = isSubscriptionUsable(sub?.status ?? null);

  let bookingsUsedThisPeriod = 0;
  if (sub) {
    const periodStart =
      sub.currentPeriodStart ??
      (() => {
        const d = new Date();
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d;
      })();
    const periodEnd = sub.currentPeriodEnd ?? new Date();
    bookingsUsedThisPeriod = await prisma.practiceBooking.count({
      where: {
        practiceId,
        createdAt: { gte: periodStart, lte: periodEnd },
        status: { not: "CANCELED" },
      },
    });
  }

  return {
    practiceId,
    status: sub?.status ?? null,
    planName: sub?.plan?.name ?? null,
    planId: sub?.planId ?? null,
    maxBookingsPerMonth: sub?.plan?.maxBookingsPerMonth ?? null,
    features: usable ? features : {},
    usable,
    currentPeriodStart: sub?.currentPeriodStart ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    bookingsUsedThisPeriod,
  };
}

export async function assertFeature(
  practiceId: string,
  featureKey: string,
  message?: string,
) {
  const ent = await getPracticeEntitlement(practiceId);
  if (!ent.usable || !hasFeatureFlag(ent.features, featureKey)) {
    throw new AppError(
      403,
      message ??
        `Your plan does not include ${featureKey}. Upgrade under Practice → Billing.`,
    );
  }
  return ent;
}

export async function assertBookingQuota(practiceId: string) {
  const ent = await getPracticeEntitlement(practiceId);
  if (!ent.usable) {
    throw new AppError(
      403,
      "This clinic’s subscription is inactive. Bookings are paused until they renew.",
    );
  }
  const cap = ent.maxBookingsPerMonth;
  if (cap != null && ent.bookingsUsedThisPeriod >= cap) {
    throw new AppError(
      403,
      `Monthly booking limit reached (${cap}). Upgrade the clinic plan to accept more bookings.`,
    );
  }
  return ent;
}

export async function countActiveDoctors(practiceId: string) {
  return prisma.practiceMember.count({
    where: {
      practiceId,
      isActive: true,
      role: { in: ["DOCTOR", "PRACTICE_OWNER"] },
    },
  });
}

export async function assertCanAddDoctor(practiceId: string) {
  const ent = await getPracticeEntitlement(practiceId);
  if (!ent.usable) {
    throw new AppError(
      403,
      "Active subscription required before adding doctors. Open Billing to subscribe.",
    );
  }
  if (hasFeatureFlag(ent.features, "multiDoctor")) return ent;

  const doctors = await countActiveDoctors(practiceId);
  if (doctors >= 1) {
    throw new AppError(
      403,
      "Multi-doctor clinics require Growth or Clinic plan. Upgrade under Billing.",
    );
  }
  return ent;
}
