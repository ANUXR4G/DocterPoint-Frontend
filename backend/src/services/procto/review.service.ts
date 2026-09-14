import { BookingStatus } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../core/response.js";

function phoneTail(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "").slice(-10);
}

export const ReviewService = {
  async listForPractice(practiceId: string) {
    const { getPracticeEntitlement, hasFeatureFlag } = await import(
      "./planEntitlements.js"
    );
    const ent = await getPracticeEntitlement(practiceId);
    if (!ent.usable || !hasFeatureFlag(ent.features, "reviews")) {
      return [];
    }
    return prisma.practiceReview.findMany({
      where: { practiceId, isPublished: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  },

  async summary(practiceId: string) {
    const { getPracticeEntitlement, hasFeatureFlag } = await import(
      "./planEntitlements.js"
    );
    const ent = await getPracticeEntitlement(practiceId);
    if (!ent.usable || !hasFeatureFlag(ent.features, "reviews")) {
      return { average: null, count: 0 };
    }
    const agg = await prisma.practiceReview.aggregate({
      where: { practiceId, isPublished: true },
      _avg: { rating: true },
      _count: { _all: true },
    });
    return {
      average: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null,
      count: agg._count._all,
    };
  },

  /** Batch summaries for find-clinic listing cards. */
  async summariesForPractices(practiceIds: string[]) {
    if (practiceIds.length === 0) return new Map<string, { average: number | null; count: number }>();
    const rows = await prisma.practiceReview.groupBy({
      by: ["practiceId"],
      where: { practiceId: { in: practiceIds }, isPublished: true },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const map = new Map<string, { average: number | null; count: number }>();
    for (const row of rows) {
      map.set(row.practiceId, {
        average: row._avg.rating
          ? Math.round(row._avg.rating * 10) / 10
          : null,
        count: row._count._all,
      });
    }
    return map;
  },

  async getBookingReviewEligibility(
    bookingId: string,
    actor: { userId?: string; phone?: string },
  ) {
    const booking = await prisma.practiceBooking.findUnique({
      where: { id: bookingId },
      include: {
        review: { select: { id: true } },
        practice: { select: { id: true, isActive: true, isDirectoryListed: true } },
      },
    });
    if (!booking) throw new AppError(404, "Booking not found");

    const patientOk =
      (actor.userId && booking.patientId === actor.userId) ||
      (actor.phone &&
        phoneTail(actor.phone) === phoneTail(booking.patientPhone));

    if (!patientOk) {
      return {
        canReview: false,
        alreadyReviewed: false,
        reason: "not_patient",
      };
    }

    if (booking.status !== BookingStatus.COMPLETED) {
      return {
        canReview: false,
        alreadyReviewed: false,
        reason: "not_completed",
      };
    }

    if (booking.review) {
      return {
        canReview: false,
        alreadyReviewed: true,
        reason: "already_reviewed",
      };
    }

    const { getPracticeEntitlement, hasFeatureFlag } = await import(
      "./planEntitlements.js"
    );
    const ent = await getPracticeEntitlement(booking.practiceId);
    if (!ent.usable || !hasFeatureFlag(ent.features, "reviews")) {
      return {
        canReview: false,
        alreadyReviewed: false,
        reason: "reviews_disabled",
      };
    }

    return {
      canReview: true,
      alreadyReviewed: false,
      practiceId: booking.practiceId,
      providerId: booking.providerId,
    };
  },

  async create(input: {
    practiceId: string;
    bookingId: string;
    actorUserId: string;
    actorPhone?: string;
    authorName?: string;
    rating: number;
    providerRating?: number;
    body?: string;
  }) {
    const booking = await prisma.practiceBooking.findUnique({
      where: { id: input.bookingId },
      include: { review: true },
    });
    if (!booking) throw new AppError(404, "Booking not found");
    if (booking.practiceId !== input.practiceId) {
      throw new AppError(400, "Booking does not belong to this practice");
    }

    const eligibility = await this.getBookingReviewEligibility(
      input.bookingId,
      { userId: input.actorUserId, phone: input.actorPhone },
    );
    if (!eligibility.canReview) {
      if (eligibility.alreadyReviewed) {
        throw new AppError(400, "You already reviewed this visit.");
      }
      if (eligibility.reason === "not_completed") {
        throw new AppError(400, "Reviews are available after the visit is completed.");
      }
      if (eligibility.reason === "reviews_disabled") {
        throw new AppError(403, "This clinic has not enabled patient reviews.");
      }
      throw new AppError(403, "You cannot review this visit.");
    }

    const practice = await prisma.practice.findFirst({
      where: {
        id: input.practiceId,
        isDirectoryListed: true,
        isActive: true,
      },
    });
    if (!practice) throw new AppError(404, "Practice not found");

    const { assertFeature } = await import("./planEntitlements.js");
    await assertFeature(
      input.practiceId,
      "reviews",
      "Patient reviews require Growth or Clinic plan.",
    );

    const rating = Math.round(Number(input.rating));
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new AppError(400, "rating must be 1–5");
    }

    let providerRating: number | null = null;
    if (input.providerRating != null) {
      providerRating = Math.round(Number(input.providerRating));
      if (
        !Number.isFinite(providerRating) ||
        providerRating < 1 ||
        providerRating > 5
      ) {
        throw new AppError(400, "providerRating must be 1–5");
      }
    } else if (booking.providerId) {
      providerRating = rating;
    }

    let authorName = input.authorName?.trim();
    if (!authorName || authorName.length < 2) {
      const user = await prisma.user.findUnique({
        where: { id: input.actorUserId },
        select: { name: true },
      });
      authorName = user?.name?.trim() || booking.patientName?.trim() || "Patient";
    }

    const created = await prisma.practiceReview.create({
      data: {
        practiceId: input.practiceId,
        bookingId: input.bookingId,
        patientId: input.actorUserId,
        providerId: booking.providerId,
        authorName: authorName.slice(0, 80),
        authorPhone:
          phoneTail(input.actorPhone || booking.patientPhone) || null,
        rating,
        providerRating,
        body: input.body?.trim().slice(0, 1000) || null,
        isPublished: true,
      },
    });

    const { broadcastOpsInvalidate } = await import("../opsSocket.js");
    void broadcastOpsInvalidate("reviews").catch(() => undefined);

    return created;
  },
};
