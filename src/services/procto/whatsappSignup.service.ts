/**
 * DoubleTick-style WhatsApp number signup for N clinics.
 * Meta Cloud API + Embedded Signup only (no BSP).
 *
 * One Meta App + one webhook → unlimited clinic WABAs / Phone Number IDs.
 */
import { WhatsAppNumberStatus } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../core/response.js";
import { settings } from "../../config/index.js";
import { MetaWhatsAppService } from "./metaWhatsApp.service.js";
import { publicWebOrigin } from "../../config/index.js";

const ACTIVE_LINE_STATUSES: WhatsAppNumberStatus[] = [
  WhatsAppNumberStatus.LIVE,
  WhatsAppNumberStatus.TEMPLATES_PENDING,
  WhatsAppNumberStatus.DISPLAY_NAME_PENDING,
  WhatsAppNumberStatus.VERIFYING,
  WhatsAppNumberStatus.ASSIGNED,
];

export const WhatsAppSignupService = {
  /** Meta Embedded Signup public config for partner / clinic UI. */
  getSignupConfig() {
    const meta = MetaWhatsAppService.getPublicConfig();
    const tokenSet = Boolean(settings.whatsappAccessToken?.trim());
    const webhookVerify = Boolean(settings.whatsappVerifyToken?.trim());
    const appSecret = Boolean(settings.whatsappAppSecret?.trim());

    return {
      ...meta,
      platformReady: Boolean(
        meta.embeddedSignupEnabled && tokenSet && webhookVerify,
      ),
      checklist: {
        metaAppId: Boolean(meta.appId),
        embeddedSignupConfigId: Boolean(meta.configId),
        systemUserToken: tokenSet,
        webhookVerifyToken: webhookVerify,
        appSecret,
        coexistence: meta.coexistenceFlow,
      },
      webhookPath: "/api/v1/procto/whatsapp/webhook",
      clinicConnectPath: "/doctor/subscription",
      /** Shareable hint — clinics complete signup under Billing after login. */
      clinicSignupHint:
        "Clinic owner opens Practice → Billing → Connect with Meta (Embedded Signup).",
    };
  },

  /**
   * Full registry of every WhatsApp line (pool + connected) — DoubleTick-style.
   * Supports filtering by status / search.
   */
  async listRegistry(opts?: { status?: string; q?: string; limit?: number }) {
    const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
    const q = opts?.q?.trim();
    const statusFilter = opts?.status?.trim().toUpperCase();

    const where: {
      status?: WhatsAppNumberStatus | { in: WhatsAppNumberStatus[] };
      OR?: Array<
        | { phoneNumber: { contains: string } }
        | { displayName: { contains: string; mode: "insensitive" } }
        | { wabaId: { contains: string } }
        | { wabaPhoneNumberId: { contains: string } }
        | {
            practice: {
              name: { contains: string; mode: "insensitive" };
            };
          }
      >;
    } = {};

    if (statusFilter === "CONNECTED") {
      where.status = { in: ACTIVE_LINE_STATUSES };
    } else if (
      statusFilter &&
      Object.values(WhatsAppNumberStatus).includes(
        statusFilter as WhatsAppNumberStatus,
      )
    ) {
      where.status = statusFilter as WhatsAppNumberStatus;
    }

    if (q) {
      where.OR = [
        { phoneNumber: { contains: q.replace(/\D/g, "").slice(-10) || q } },
        { displayName: { contains: q, mode: "insensitive" } },
        { wabaId: { contains: q } },
        { wabaPhoneNumberId: { contains: q } },
        { practice: { name: { contains: q, mode: "insensitive" } } },
      ];
    }

    const [rows, total, counts] = await Promise.all([
      prisma.whatsAppNumber.findMany({
        where,
        include: {
          practice: {
            select: {
              id: true,
              name: true,
              slug: true,
              whatsappBusinessNumber: true,
              subscription: {
                include: { plan: { select: { name: true } } },
              },
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }],
        take: limit,
      }),
      prisma.whatsAppNumber.count({ where }),
      prisma.whatsAppNumber.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);

    const byStatus = Object.fromEntries(
      counts.map((c) => [c.status, c._count._all]),
    ) as Record<string, number>;

    const connected =
      (byStatus.LIVE ?? 0) +
      (byStatus.TEMPLATES_PENDING ?? 0) +
      (byStatus.DISPLAY_NAME_PENDING ?? 0) +
      (byStatus.VERIFYING ?? 0) +
      (byStatus.ASSIGNED ?? 0);

    return {
      total,
      summary: {
        connected,
        live: byStatus.LIVE ?? 0,
        provisioning:
          (byStatus.TEMPLATES_PENDING ?? 0) +
          (byStatus.DISPLAY_NAME_PENDING ?? 0) +
          (byStatus.VERIFYING ?? 0) +
          (byStatus.ASSIGNED ?? 0),
        available: byStatus.AVAILABLE ?? 0,
        suspended: byStatus.SUSPENDED ?? 0,
        withWaba: rows.filter((r) => r.wabaId).length,
      },
      signup: this.getSignupConfig(),
      numbers: rows.map((n) => ({
        id: n.id,
        phoneNumber: n.phoneNumber,
        displayName: n.displayName,
        status: n.status,
        provider: n.provider,
        wabaId: n.wabaId,
        wabaPhoneNumberId: n.wabaPhoneNumberId,
        templatesStatus: n.templatesStatus,
        displayNameStatus: n.displayNameStatus,
        verificationStatus: n.verificationStatus,
        activatedAt: n.activatedAt,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        notes: n.notes,
        waMeLink: n.phoneNumber
          ? `https://wa.me/91${n.phoneNumber.replace(/\D/g, "").slice(-10)}`
          : null,
        practice: n.practice
          ? {
              id: n.practice.id,
              name: n.practice.name,
              slug: n.practice.slug,
              planName: n.practice.subscription?.plan?.name ?? null,
              subscriptionStatus: n.practice.subscription?.status ?? null,
              connectUrl: `${publicWebOrigin()}/doctor/subscription`,
            }
          : null,
      })),
    };
  },

  /**
   * Clinics ready for Embedded Signup (subscribed, no line yet).
   * Ops can send them to Billing → Connect with Meta.
   */
  async listPendingSignups() {
    const subscribedStatuses = [
      "TRIALING",
      "ACTIVE",
      "PAST_DUE",
      "GRACE",
    ] as const;

    const practices = await prisma.practice.findMany({
      where: {
        subscription: { status: { in: [...subscribedStatuses] } },
        whatsappNumber: null,
      },
      include: {
        subscription: {
          include: { plan: { select: { name: true } } },
        },
        members: {
          where: {
            isActive: true,
            role: { in: ["PRACTICE_OWNER", "PRACTICE_ADMIN", "DOCTOR"] },
          },
          take: 3,
          include: {
            user: { select: { email: true, name: true, phone: true } },
          },
        },
      },
      orderBy: { name: "asc" },
      take: 200,
    });

    const signup = this.getSignupConfig();

    return {
      signup,
      total: practices.length,
      clinics: practices.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        phone: p.phone,
        planName: p.subscription?.plan?.name ?? null,
        subscriptionStatus: p.subscription?.status ?? null,
        owners: p.members.map((m) => ({
          name: m.user.name,
          email: m.user.email,
          phone: m.user.phone,
        })),
        /** Doctor opens this after login to run Embedded Signup. */
        connectUrl: `${publicWebOrigin()}/doctor/subscription`,
        inviteMessage: signup.embeddedSignupEnabled
          ? `Hi — please open ${publicWebOrigin()}/doctor/subscription, subscribe if needed, then tap "Connect with Meta" to link your clinic WhatsApp number. The booking bot will reply to patients automatically.`
          : `WhatsApp Embedded Signup is not configured yet (set META_APP_ID + META_EMBEDDED_SIGNUP_CONFIG_ID).`,
      })),
    };
  },

  /**
   * Ops runs Embedded Signup / connect for a specific practice
   * (same payload as clinic Billing → Connect with Meta).
   */
  async connectForPractice(
    practiceId: string,
    input: {
      phoneNumber: string;
      wabaPhoneNumberId?: string;
      wabaId?: string;
      oauthCode?: string;
    },
  ) {
    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
    });
    if (!practice) throw new AppError(404, "Practice not found");

    return MetaWhatsAppService.connectPracticeLine(practiceId, input);
  },

  /** Refresh Meta template status for one connected line. */
  async refreshProvision(numberId: string) {
    const row = await prisma.whatsAppNumber.findUnique({
      where: { id: numberId },
    });
    if (!row?.practiceId) {
      throw new AppError(404, "Number not linked to a practice");
    }
    const { MetaWhatsAppProvisionService } = await import(
      "./metaWhatsApp.provision.js"
    );
    return MetaWhatsAppProvisionService.refreshTemplateStatus(row.practiceId);
  },

  /** Refresh all connected lines that have a WABA ID (batch). */
  async refreshAllProvisioning(limit = 50) {
    const rows = await prisma.whatsAppNumber.findMany({
      where: {
        wabaId: { not: null },
        practiceId: { not: null },
        status: { in: ACTIVE_LINE_STATUSES },
      },
      take: Math.min(limit, 100),
      orderBy: { updatedAt: "asc" },
    });

    const { MetaWhatsAppProvisionService } = await import(
      "./metaWhatsApp.provision.js"
    );

    const results: Array<{
      numberId: string;
      practiceId: string;
      ok: boolean;
      templatesStatus?: string;
      error?: string;
    }> = [];

    for (const row of rows) {
      if (!row.practiceId) continue;
      try {
        const r = await MetaWhatsAppProvisionService.refreshTemplateStatus(
          row.practiceId,
        );
        results.push({
          numberId: row.id,
          practiceId: row.practiceId,
          ok: true,
          templatesStatus: r.templatesStatus,
        });
      } catch (err) {
        results.push({
          numberId: row.id,
          practiceId: row.practiceId,
          ok: false,
          error: err instanceof Error ? err.message : "refresh failed",
        });
      }
    }

    return {
      refreshed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  },
};
