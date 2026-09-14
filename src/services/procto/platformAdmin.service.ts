import {
  MessageTemplateStatus,
  PracticeMemberRole,
  PracticeSubscriptionStatus,
  WhatsAppNumberStatus,
} from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../core/response.js";

type PageOpts = {
  q?: string;
  take?: number;
  skip?: number;
};

function clampTake(take?: number) {
  return Math.min(Math.max(take ?? 50, 1), 100);
}

function clampSkip(skip?: number) {
  return Math.max(skip ?? 0, 0);
}

export const PlatformAdminService = {
  async getOverview() {
    const [
      patients,
      doctors,
      practices,
      activePractices,
      bookings,
      subscriptions,
      escalations,
      pendingTemplates,
      pendingReviews,
      waNumbers,
    ] = await Promise.all([
      prisma.user.count({ where: { role: "user" } }),
      prisma.practiceMember.count({
        where: {
          role: { in: [PracticeMemberRole.DOCTOR, PracticeMemberRole.PRACTICE_OWNER] },
          isActive: true,
        },
      }),
      prisma.practice.count(),
      prisma.practice.count({ where: { isActive: true, isDirectoryListed: true } }),
      prisma.practiceBooking.count(),
      prisma.practiceSubscription.count(),
      prisma.whatsAppConversation.count({ where: { status: "handed_off" } }),
      prisma.messageTemplate.count({
        where: { status: { in: [MessageTemplateStatus.DRAFT, MessageTemplateStatus.PENDING] } },
      }),
      prisma.practiceReview.count({ where: { isPublished: false } }),
      prisma.whatsAppNumber.count({
        where: {
          status: {
            in: [
              WhatsAppNumberStatus.ASSIGNED,
              WhatsAppNumberStatus.VERIFYING,
              WhatsAppNumberStatus.DISPLAY_NAME_PENDING,
              WhatsAppNumberStatus.TEMPLATES_PENDING,
            ],
          },
        },
      }),
    ]);

    const subscriptionBreakdown = await prisma.practiceSubscription.groupBy({
      by: ["status"],
      _count: { _all: true },
    });

    return {
      patients,
      doctors,
      practices,
      activePractices,
      bookings,
      subscriptions,
      escalations,
      pendingTemplates,
      pendingReviews,
      waNumbers,
      subscriptionBreakdown: subscriptionBreakdown.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
    };
  },

  async getAnalytics(opts?: { months?: number; dailyMonthOffset?: number }) {
    const months = [3, 6, 12].includes(Number(opts?.months))
      ? Number(opts?.months)
      : 6;
    const dailyMonthOffset = opts?.dailyMonthOffset === -1 ? -1 : 0;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const trendStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const billableStatuses: PracticeSubscriptionStatus[] = [
      PracticeSubscriptionStatus.TRIALING,
      PracticeSubscriptionStatus.ACTIVE,
      PracticeSubscriptionStatus.PAST_DUE,
      PracticeSubscriptionStatus.GRACE,
    ];

    const [subscriptions, bookingsRecent, patientsRecent, practicesRecent] =
      await Promise.all([
        prisma.practiceSubscription.findMany({
          include: { plan: { select: { name: true, priceMonthlyInr: true } } },
        }),
        prisma.practiceBooking.findMany({
          where: {
            createdAt: { gte: trendStart },
          },
          select: { createdAt: true },
        }),
        prisma.user.findMany({
          where: {
            role: "user",
            createdAt: { gte: trendStart },
          },
          select: { createdAt: true },
        }),
        prisma.practice.findMany({
          where: {
            createdAt: { gte: trendStart },
          },
          select: { createdAt: true },
        }),
      ]);

    const planPrice = (sub: (typeof subscriptions)[number]) =>
      sub.plan.priceMonthlyInr;

    const mrr = subscriptions
      .filter((s) => billableStatuses.includes(s.status))
      .reduce((sum, s) => sum + planPrice(s), 0);

    const subsThisMonth = subscriptions.filter((s) => s.createdAt >= startOfMonth);
    const subsLastMonth = subscriptions.filter(
      (s) => s.createdAt >= startOfLastMonth && s.createdAt < startOfMonth,
    );

    const revenueThisMonth = subsThisMonth.reduce((sum, s) => sum + planPrice(s), 0);
    const revenueLastMonth = subsLastMonth.reduce((sum, s) => sum + planPrice(s), 0);

    const revenueChangePercent =
      revenueLastMonth === 0
        ? revenueThisMonth > 0
          ? 100
          : 0
        : Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100);

    const bookingsThisMonth = bookingsRecent.filter(
      (b) => b.createdAt >= startOfMonth,
    ).length;
    const bookingsLastMonth = bookingsRecent.filter(
      (b) => b.createdAt >= startOfLastMonth && b.createdAt < startOfMonth,
    ).length;
    const bookingsChangePercent =
      bookingsLastMonth === 0
        ? bookingsThisMonth > 0
          ? 100
          : 0
        : Math.round(((bookingsThisMonth - bookingsLastMonth) / bookingsLastMonth) * 100);

    const monthlyTrend = Array.from({ length: months }, (_, i) => {
      const offset = months - 1 - i;
      const monthStart = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const monthEnd = new Date(
        now.getFullYear(),
        now.getMonth() - offset + 1,
        0,
        23,
        59,
        59,
        999,
      );
      const label = monthStart.toLocaleString("en-IN", { month: "short", year: "2-digit" });
      const monthSubs = subscriptions.filter(
        (s) => s.createdAt >= monthStart && s.createdAt <= monthEnd,
      );
      return {
        label,
        revenue: monthSubs.reduce((sum, s) => sum + planPrice(s), 0),
        newSubscriptions: monthSubs.length,
        bookings: bookingsRecent.filter(
          (b) => b.createdAt >= monthStart && b.createdAt <= monthEnd,
        ).length,
        patients: patientsRecent.filter(
          (p) => p.createdAt >= monthStart && p.createdAt <= monthEnd,
        ).length,
        practices: practicesRecent.filter(
          (p) => p.createdAt >= monthStart && p.createdAt <= monthEnd,
        ).length,
      };
    });

    const dailyBase = new Date(
      now.getFullYear(),
      now.getMonth() + dailyMonthOffset,
      1,
    );
    const daysInMonth = new Date(
      dailyBase.getFullYear(),
      dailyBase.getMonth() + 1,
      0,
    ).getDate();
    const dailyMonthStart = new Date(
      dailyBase.getFullYear(),
      dailyBase.getMonth(),
      1,
    );
    // Daily chart may need bookings outside the trend window when viewing last month with months=3
    const dailyBookingsSource =
      dailyMonthStart < trendStart
        ? await prisma.practiceBooking.findMany({
            where: {
              createdAt: {
                gte: dailyMonthStart,
                lte: new Date(
                  dailyBase.getFullYear(),
                  dailyBase.getMonth() + 1,
                  0,
                  23,
                  59,
                  59,
                  999,
                ),
              },
            },
            select: { createdAt: true },
          })
        : bookingsRecent;

    const dailyBookings = Array.from({ length: daysInMonth }, (_, day) => {
      const dayStart = new Date(
        dailyBase.getFullYear(),
        dailyBase.getMonth(),
        day + 1,
      );
      const dayEnd = new Date(
        dailyBase.getFullYear(),
        dailyBase.getMonth(),
        day + 1,
        23,
        59,
        59,
        999,
      );
      const count = dailyBookingsSource.filter(
        (b) => b.createdAt >= dayStart && b.createdAt <= dayEnd,
      ).length;
      return { day: day + 1, count };
    });

    const subscriptionBreakdown = await prisma.practiceSubscription.groupBy({
      by: ["status"],
      _count: { _all: true },
    });

    const activeSubscriptions = subscriptions.filter((s) =>
      billableStatuses.includes(s.status),
    ).length;

    return {
      months,
      dailyMonthOffset,
      dailyMonthLabel: dailyBase.toLocaleString("en-IN", {
        month: "long",
        year: "numeric",
      }),
      mrr,
      revenueThisMonth,
      revenueLastMonth,
      revenueChangePercent,
      bookingsThisMonth,
      bookingsLastMonth,
      bookingsChangePercent,
      activeSubscriptions,
      newSubscriptionsThisMonth: subsThisMonth.length,
      monthlyTrend,
      dailyBookings,
      subscriptionBreakdown: subscriptionBreakdown.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      comparison: {
        revenue: { thisMonth: revenueThisMonth, lastMonth: revenueLastMonth },
        bookings: { thisMonth: bookingsThisMonth, lastMonth: bookingsLastMonth },
      },
    };
  },

  async listPatients({ q, take, skip }: PageOpts = {}) {
    const limit = clampTake(take);
    const offset = clampSkip(skip);
    const where = {
      role: "user",
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" as const } },
              { name: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          patient: {
            select: {
              contactNumber: true,
              dateOfBirth: true,
              aadharNumber: true,
              panNumber: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      total,
      items: items.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        phone: u.phone,
        gender: u.gender,
        createdAt: u.createdAt,
        contactNumber: u.patient?.contactNumber ?? null,
        dateOfBirth: u.patient?.dateOfBirth ?? null,
        hasId: Boolean(u.patient?.aadharNumber || u.patient?.panNumber),
      })),
    };
  },

  async listDoctors({ q, take, skip }: PageOpts = {}) {
    const limit = clampTake(take);
    const offset = clampSkip(skip);
    const where = {
      role: {
        in: [
          PracticeMemberRole.DOCTOR,
          PracticeMemberRole.PRACTICE_OWNER,
          PracticeMemberRole.PRACTICE_ADMIN,
        ],
      },
      ...(q
        ? {
            OR: [
              { user: { email: { contains: q, mode: "insensitive" as const } } },
              { user: { name: { contains: q, mode: "insensitive" as const } } },
              { practice: { name: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.practiceMember.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, name: true, phone: true } },
          practice: { select: { id: true, name: true, slug: true, isActive: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.practiceMember.count({ where }),
    ]);

    return {
      total,
      items: items.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        isActive: m.isActive,
        email: m.user.email,
        name: m.user.name,
        phone: m.user.phone,
        practice: m.practice,
        createdAt: m.createdAt,
      })),
    };
  },

  async listPractices({ q, take, skip }: PageOpts = {}) {
    const limit = clampTake(take);
    const offset = clampSkip(skip);
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { slug: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.practice.findMany({
        where,
        include: {
          subscription: { include: { plan: true } },
          whatsappNumber: { select: { id: true, phoneNumber: true, status: true } },
          _count: { select: { members: true, bookings: true, locations: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.practice.count({ where }),
    ]);

    return {
      total,
      items: items.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        type: p.type,
        specialty: p.specialty,
        email: p.email,
        phone: p.phone,
        isActive: p.isActive,
        isDirectoryListed: p.isDirectoryListed,
        registrationNo: p.registrationNo,
        createdAt: p.createdAt,
        memberCount: p._count.members,
        bookingCount: p._count.bookings,
        locationCount: p._count.locations,
        subscription: p.subscription
          ? {
              id: p.subscription.id,
              status: p.subscription.status,
              planName: p.subscription.plan.name,
              gracePeriodEnd: p.subscription.gracePeriodEnd,
              currentPeriodEnd: p.subscription.currentPeriodEnd,
            }
          : null,
        whatsapp: p.whatsappNumber,
      })),
    };
  },

  async updatePractice(
    practiceId: string,
    data: { isActive?: boolean; isDirectoryListed?: boolean },
  ) {
    const practice = await prisma.practice.findUnique({ where: { id: practiceId } });
    if (!practice) throw new AppError(404, "Practice not found");

    return prisma.practice.update({
      where: { id: practiceId },
      data: {
        ...(typeof data.isActive === "boolean" ? { isActive: data.isActive } : {}),
        ...(typeof data.isDirectoryListed === "boolean"
          ? { isDirectoryListed: data.isDirectoryListed }
          : {}),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        isDirectoryListed: true,
      },
    });
  },

  async listBookings({ q, status, take, skip }: PageOpts & { status?: string } = {}) {
    const limit = clampTake(take);
    const offset = clampSkip(skip);
    const where = {
      ...(status ? { status: status as never } : {}),
      ...(q
        ? {
            OR: [
              { patientPhone: { contains: q } },
              { patientName: { contains: q, mode: "insensitive" as const } },
              { practice: { name: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.practiceBooking.findMany({
        where,
        include: {
          practice: { select: { id: true, name: true, slug: true } },
          location: { select: { name: true, city: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.practiceBooking.count({ where }),
    ]);

    return {
      total,
      items: items.map((b) => ({
        id: b.id,
        status: b.status,
        mode: b.mode,
        channel: b.channel,
        patientPhone: b.patientPhone,
        patientName: b.patientName,
        slotStart: b.slotStart,
        tokenNumber: b.tokenNumber,
        sessionDate: b.sessionDate,
        createdAt: b.createdAt,
        practice: b.practice,
        location: b.location,
      })),
    };
  },

  async listApprovals() {
    const [reviews, templates, escalations, numbers] = await Promise.all([
      prisma.practiceReview.findMany({
        where: { isPublished: false },
        include: { practice: { select: { name: true, slug: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.messageTemplate.findMany({
        where: {
          status: { in: [MessageTemplateStatus.DRAFT, MessageTemplateStatus.PENDING] },
        },
        include: { practice: { select: { name: true, slug: true } } },
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
      prisma.whatsAppConversation.findMany({
        where: { status: "handed_off" },
        include: { practice: { select: { name: true, slug: true } } },
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
      prisma.whatsAppNumber.findMany({
        where: {
          status: {
            in: [
              WhatsAppNumberStatus.ASSIGNED,
              WhatsAppNumberStatus.VERIFYING,
              WhatsAppNumberStatus.TEMPLATES_PENDING,
              WhatsAppNumberStatus.DISPLAY_NAME_PENDING,
            ],
          },
        },
        include: { practice: { select: { name: true, slug: true } } },
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
    ]);

    return { reviews, templates, escalations, numbers };
  },

  async listReviews(opts?: PageOpts & { published?: boolean }) {
    const take = clampTake(opts?.take);
    const skip = clampSkip(opts?.skip);
    const where =
      opts?.published === undefined
        ? {}
        : { isPublished: opts.published };

    const [items, total] = await Promise.all([
      prisma.practiceReview.findMany({
        where,
        include: { practice: { select: { id: true, name: true, slug: true } } },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.practiceReview.count({ where }),
    ]);

    return {
      total,
      items: items.map((r) => ({
        id: r.id,
        authorName: r.authorName,
        authorPhone: r.authorPhone,
        rating: r.rating,
        providerRating: r.providerRating,
        providerId: r.providerId,
        body: r.body,
        isPublished: r.isPublished,
        createdAt: r.createdAt,
        practice: r.practice,
      })),
    };
  },

  async listPendingTemplates(opts?: PageOpts) {
    const take = clampTake(opts?.take);
    const skip = clampSkip(opts?.skip);
    const where = {
      status: { in: [MessageTemplateStatus.DRAFT, MessageTemplateStatus.PENDING] },
    };

    const [items, total] = await Promise.all([
      prisma.messageTemplate.findMany({
        where,
        include: { practice: { select: { id: true, name: true, slug: true } } },
        orderBy: { updatedAt: "desc" },
        take,
        skip,
      }),
      prisma.messageTemplate.count({ where }),
    ]);

    return { total, items };
  },

  async listEscalations(opts?: PageOpts) {
    const take = clampTake(opts?.take);
    const skip = clampSkip(opts?.skip);
    const where = { status: "handed_off" };

    const [items, total] = await Promise.all([
      prisma.whatsAppConversation.findMany({
        where,
        include: { practice: { select: { id: true, name: true, slug: true } } },
        orderBy: { updatedAt: "desc" },
        take,
        skip,
      }),
      prisma.whatsAppConversation.count({ where }),
    ]);

    return { total, items };
  },

  async listPendingNumbers(opts?: PageOpts) {
    const take = clampTake(opts?.take);
    const skip = clampSkip(opts?.skip);
    const where = {
      status: {
        in: [
          WhatsAppNumberStatus.ASSIGNED,
          WhatsAppNumberStatus.VERIFYING,
          WhatsAppNumberStatus.TEMPLATES_PENDING,
          WhatsAppNumberStatus.DISPLAY_NAME_PENDING,
        ],
      },
    };

    const [items, total] = await Promise.all([
      prisma.whatsAppNumber.findMany({
        where,
        include: { practice: { select: { id: true, name: true, slug: true } } },
        orderBy: { updatedAt: "desc" },
        take,
        skip,
      }),
      prisma.whatsAppNumber.count({ where }),
    ]);

    return { total, items };
  },

  async updateEscalation(
    conversationId: string,
    status: "bot_active" | "handed_off" | "closed",
  ) {
    const conv = await prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new AppError(404, "Conversation not found");

    const prev = (conv.state as Record<string, unknown>) ?? {};
    const handedOff = status === "handed_off";
    return prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: {
        status,
        state: {
          ...prev,
          handedOff,
          ...(status === "bot_active" ? { handedOff: false } : {}),
        },
      },
      include: { practice: { select: { id: true, name: true, slug: true } } },
    });
  },

  async updateReview(reviewId: string, isPublished: boolean) {
    const review = await prisma.practiceReview.findUnique({ where: { id: reviewId } });
    if (!review) throw new AppError(404, "Review not found");
    return prisma.practiceReview.update({
      where: { id: reviewId },
      data: { isPublished },
    });
  },

  async updateTemplateStatus(templateId: string, status: MessageTemplateStatus) {
    if (!Object.values(MessageTemplateStatus).includes(status)) {
      throw new AppError(400, "Invalid template status");
    }
    const template = await prisma.messageTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new AppError(404, "Template not found");
    return prisma.messageTemplate.update({
      where: { id: templateId },
      data: { status },
    });
  },

  async setMemberActive(memberId: string, isActive: boolean) {
    const member = await prisma.practiceMember.findUnique({ where: { id: memberId } });
    if (!member) throw new AppError(404, "Practice member not found");
    return prisma.practiceMember.update({
      where: { id: memberId },
      data: { isActive },
      include: {
        user: { select: { email: true, name: true } },
        practice: { select: { name: true, slug: true } },
      },
    });
  },

  async getWhatsAppOverview() {
    const subscribedStatuses: PracticeSubscriptionStatus[] = [
      PracticeSubscriptionStatus.TRIALING,
      PracticeSubscriptionStatus.ACTIVE,
      PracticeSubscriptionStatus.PAST_DUE,
      PracticeSubscriptionStatus.GRACE,
    ];

    const [
      activeNumbers,
      availableNumbers,
      provisioningNumbers,
      suspendedNumbers,
      subscribedWithoutLine,
    ] =
      await Promise.all([
        prisma.whatsAppNumber.findMany({
          where: { status: WhatsAppNumberStatus.LIVE },
          include: {
            practice: {
              select: {
                id: true,
                name: true,
                slug: true,
                subscription: {
                  include: { plan: { select: { name: true } } },
                },
              },
            },
          },
          orderBy: { activatedAt: "desc" },
        }),
        prisma.whatsAppNumber.findMany({
          where: { status: WhatsAppNumberStatus.AVAILABLE },
          orderBy: { createdAt: "desc" },
        }),
        prisma.whatsAppNumber.findMany({
          where: {
            status: {
              in: [
                WhatsAppNumberStatus.ASSIGNED,
                WhatsAppNumberStatus.VERIFYING,
                WhatsAppNumberStatus.DISPLAY_NAME_PENDING,
                WhatsAppNumberStatus.TEMPLATES_PENDING,
              ],
            },
          },
          include: {
            practice: { select: { id: true, name: true, slug: true } },
          },
          orderBy: { updatedAt: "desc" },
        }),
        prisma.whatsAppNumber.findMany({
          where: { status: WhatsAppNumberStatus.SUSPENDED },
          include: {
            practice: { select: { id: true, name: true, slug: true } },
          },
          orderBy: { updatedAt: "desc" },
        }),
        prisma.practice.findMany({
          where: {
            subscription: { status: { in: subscribedStatuses } },
            whatsappNumber: null,
          },
          include: {
            subscription: {
              include: { plan: { select: { name: true } } },
            },
          },
          orderBy: { name: "asc" },
        }),
      ]);

    return {
      counts: {
        active: activeNumbers.length,
        available: availableNumbers.length,
        provisioning: provisioningNumbers.length,
        suspended: suspendedNumbers.length,
        subscribedWithoutLine: subscribedWithoutLine.length,
      },
      activeNumbers: activeNumbers.map((n) => ({
        id: n.id,
        phoneNumber: n.phoneNumber,
        displayName: n.displayName,
        status: n.status,
        wabaId: n.wabaId,
        wabaPhoneNumberId: n.wabaPhoneNumberId,
        templatesStatus: n.templatesStatus,
        activatedAt: n.activatedAt,
        practice: n.practice
          ? {
              id: n.practice.id,
              name: n.practice.name,
              slug: n.practice.slug,
              subscription: n.practice.subscription
                ? {
                    status: n.practice.subscription.status,
                    planName: n.practice.subscription.plan.name,
                  }
                : null,
            }
          : null,
      })),
      availableNumbers: availableNumbers.map((n) => ({
        id: n.id,
        phoneNumber: n.phoneNumber,
        displayName: n.displayName,
        status: n.status,
        createdAt: n.createdAt,
      })),
      provisioningNumbers: provisioningNumbers.map((n) => ({
        id: n.id,
        phoneNumber: n.phoneNumber,
        displayName: n.displayName,
        status: n.status,
        wabaId: n.wabaId,
        wabaPhoneNumberId: n.wabaPhoneNumberId,
        templatesStatus: n.templatesStatus,
        updatedAt: n.updatedAt,
        practice: n.practice,
      })),
      suspendedNumbers: suspendedNumbers.map((n) => ({
        id: n.id,
        phoneNumber: n.phoneNumber,
        displayName: n.displayName,
        status: n.status,
        updatedAt: n.updatedAt,
        practice: n.practice,
      })),
      subscribedWithoutLine: subscribedWithoutLine.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        subscription: p.subscription
          ? {
              id: p.subscription.id,
              status: p.subscription.status,
              planName: p.subscription.plan.name,
            }
          : null,
      })),
    };
  },
};
