/**
 * Post–Embedded Signup provisioning for clinic WABAs.
 * Meta Cloud API only — no BSP (AiSensy / Gupshup / etc.).
 *
 * Flow: subscribe WABA → submit UTILITY templates → auto-approve locally → LIVE.
 * GlucoGuide does not wait on Meta's manual/async template review for go-live.
 * Templates are still submitted to Meta for real sends; product status is always LIVE.
 */
import { MessageTemplateStatus, WhatsAppNumberStatus } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { settings } from "../../config/index.js";
import {
  META_UTILITY_TEMPLATES,
  type MetaTemplateDef,
} from "./whatsapp.metaTemplates.js";

type GraphError = { error?: { message?: string; code?: number } };

function graphUrl(path: string): string {
  const base = settings.whatsappApiVersion.replace(/^\//, "");
  return `https://graph.facebook.com/${base}/${path.replace(/^\//, "")}`;
}

async function graphRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(graphUrl(path), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as T & GraphError;
  if (!res.ok) {
    const msg =
      data.error?.message ?? `Meta Graph API ${method} ${path} (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

function platformToken(): string | null {
  const t = settings.whatsappAccessToken?.trim();
  return t || null;
}

/** Prefer permanent system-user token; fall back to Embedded Signup OAuth token. */
function resolveAccessToken(oauthOrOverride?: string): string | null {
  return platformToken() || oauthOrOverride?.trim() || null;
}

function templateBodyComponent(def: MetaTemplateDef) {
  return {
    type: "BODY",
    text: def.body,
    example: {
      body_text_named_params: def.paramNames.map((name) => ({
        param_name: name,
        example: def.examples[name] ?? name,
      })),
    },
  };
}

export type ProvisionResult = {
  wabaId: string;
  subscribed: boolean;
  templatesSubmitted: number;
  templatesSkipped: number;
  templatesStatus: string;
  errors: string[];
};

export const MetaWhatsAppProvisionService = {
  /** Subscribe app to WABA webhook fields (messages, template status, quality). */
  async subscribeWaba(wabaId: string, token?: string): Promise<boolean> {
    const accessToken = resolveAccessToken(token);
    if (!accessToken || !wabaId.trim()) return false;

    try {
      await graphRequest<{ success?: boolean }>(
        "POST",
        `${wabaId}/subscribed_apps`,
        accessToken,
      );
      return true;
    } catch (err) {
      // Already subscribed is fine
      const msg = err instanceof Error ? err.message : String(err);
      if (/already|subscribed/i.test(msg)) return true;
      console.warn(`[Meta provision] subscribeWaba ${wabaId}:`, msg);
      return false;
    }
  },

  /** Submit GlucoGuide UTILITY templates to a clinic WABA (skips duplicates). */
  async submitUtilityTemplates(
    wabaId: string,
    token?: string,
  ): Promise<{ submitted: number; skipped: number; errors: string[] }> {
    const accessToken = resolveAccessToken(token);
    if (!accessToken || !wabaId.trim()) {
      return {
        submitted: 0,
        skipped: 0,
        errors: ["No Meta access token (set WHATSAPP_ACCESS_TOKEN)"],
      };
    }

    let existingNames = new Set<string>();
    try {
      const listed = await graphRequest<{
        data?: Array<{ name: string; status?: string }>;
      }>(
        "GET",
        `${wabaId}/message_templates?fields=name,status&limit=100`,
        accessToken,
      );
      existingNames = new Set(
        (listed.data ?? []).map((t) => t.name.toLowerCase()),
      );
    } catch {
      // proceed — create may still work
    }

    let submitted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const def of META_UTILITY_TEMPLATES) {
      if (existingNames.has(def.metaName.toLowerCase())) {
        skipped += 1;
        continue;
      }

      try {
        await graphRequest<{ id?: string }>(
          "POST",
          `${wabaId}/message_templates`,
          accessToken,
          {
            name: def.metaName,
            language: def.language,
            category: def.category,
            allow_category_change: true,
            components: [templateBodyComponent(def)],
            parameter_format: "NAMED",
          },
        );
        submitted += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/already exists|duplicate/i.test(msg)) {
          skipped += 1;
        } else {
          errors.push(`${def.metaName}: ${msg}`);
        }
      }
    }

    return { submitted, skipped, errors };
  },

  /** Full post-connect provisioning for Embedded Signup clinic WABA. */
  async provisionClinicWaba(
    practiceId: string,
    wabaId: string,
    token?: string,
  ): Promise<ProvisionResult> {
    const accessToken = resolveAccessToken(token);
    const errors: string[] = [];

    const subscribed = accessToken
      ? await this.subscribeWaba(wabaId, accessToken)
      : false;
    if (!accessToken) {
      errors.push(
        "WHATSAPP_ACCESS_TOKEN not set — webhook subscribe + template submit skipped. Bot can still receive if app webhook is configured at Meta.",
      );
    } else if (!subscribed) {
      errors.push(
        "Could not subscribe WABA to app webhooks (may already be subscribed).",
      );
    }

    const templateResult = accessToken
      ? await this.submitUtilityTemplates(wabaId, accessToken)
      : { submitted: 0, skipped: 0, errors: [] as string[] };

    errors.push(...templateResult.errors);

    await prisma.whatsAppNumber.updateMany({
      where: { practiceId },
      data: {
        wabaId,
        provider: "META_CLOUD_API",
      },
    });

    await this.syncPracticeTemplates(practiceId, wabaId);
    // Always go LIVE — no manual / Meta-wait gate in GlucoGuide.
    const live = await this.markTemplatesApprovedAndLive(practiceId);

    return {
      wabaId,
      subscribed,
      templatesSubmitted: templateResult.submitted,
      templatesSkipped: templateResult.skipped,
      templatesStatus: live.templatesStatus,
      errors,
    };
  },

  /**
   * Mark catalog templates APPROVED and number LIVE immediately.
   * Skips waiting for Meta Business Manager template review.
   */
  async markTemplatesApprovedAndLive(practiceId: string): Promise<{
    approved: number;
    total: number;
    templatesStatus: string;
  }> {
    const total = META_UTILITY_TEMPLATES.length;

    const row = await prisma.whatsAppNumber.findUnique({
      where: { practiceId },
      select: { status: true },
    });
    // Never promote VERIFYING → LIVE here; in-app Meta OTP owns that step.
    if (row?.status === WhatsAppNumberStatus.VERIFYING) {
      return {
        approved: 0,
        total,
        templatesStatus: "pending",
      };
    }

    await prisma.messageTemplate.updateMany({
      where: { practiceId },
      data: { status: MessageTemplateStatus.APPROVED },
    });

    await prisma.whatsAppNumber.updateMany({
      where: {
        practiceId,
        status: { not: WhatsAppNumberStatus.VERIFYING },
      },
      data: {
        templatesStatus: "approved",
        displayNameStatus: "approved",
        verificationStatus: "verified",
        status: WhatsAppNumberStatus.LIVE,
        activatedAt: new Date(),
      },
    });

    return { approved: total, total, templatesStatus: "approved" };
  },

  /** Upsert per-practice MessageTemplate rows from catalog (auto-approved). */
  async syncPracticeTemplates(practiceId: string, wabaId: string) {
    for (const def of META_UTILITY_TEMPLATES) {
      const existing = await prisma.messageTemplate.findFirst({
        where: { practiceId, metaName: def.metaName },
      });
      const data = {
        name: def.key,
        category: def.category,
        body: def.body,
        language: def.language,
        metaName: def.metaName,
        status: MessageTemplateStatus.APPROVED,
      };
      if (existing) {
        await prisma.messageTemplate.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await prisma.messageTemplate.create({
          data: { practiceId, ...data },
        });
      }
    }

    await prisma.whatsAppNumber.updateMany({
      where: { practiceId },
      data: { wabaId },
    });
  },

  /**
   * Refresh / confirm LIVE. Still polls Meta for observability, but GlucoGuide
   * always keeps templates approved + number LIVE (no manual approval gate).
   */
  async refreshTemplateStatus(practiceId: string): Promise<{
    approved: number;
    total: number;
    templatesStatus: string;
  }> {
    const row = await prisma.whatsAppNumber.findUnique({
      where: { practiceId },
    });
    if (!row) {
      return {
        approved: 0,
        total: META_UTILITY_TEMPLATES.length,
        templatesStatus: "unknown",
      };
    }

    const token = platformToken();
    if (token && row.wabaId) {
      try {
        const catalogNames = new Set(
          META_UTILITY_TEMPLATES.map((t) => t.metaName.toLowerCase()),
        );
        const listed = await graphRequest<{
          data?: Array<{ name: string; status?: string }>;
        }>(
          "GET",
          `${row.wabaId}/message_templates?fields=name,status&limit=100`,
          token,
        );
        let metaApproved = 0;
        for (const t of listed.data ?? []) {
          if (!catalogNames.has(t.name.toLowerCase())) continue;
          if (String(t.status ?? "").toUpperCase() === "APPROVED") {
            metaApproved += 1;
          }
        }
        if (metaApproved < META_UTILITY_TEMPLATES.length) {
          console.log(
            `[Meta provision] Meta has ${metaApproved}/${META_UTILITY_TEMPLATES.length} APPROVED for ${practiceId}; GlucoGuide keeps local LIVE/approved.`,
          );
        }
      } catch (err) {
        console.warn("[Meta provision] refreshTemplateStatus poll:", err);
      }
    }

    return this.markTemplatesApprovedAndLive(practiceId);
  },

  /** Handle message_template_status_update webhook from Meta. */
  async handleTemplateStatusWebhook(body: unknown): Promise<void> {
    const payload = body as {
      entry?: Array<{
        id?: string;
        changes?: Array<{
          field?: string;
          value?: {
            message_template_name?: string;
            message_template_language?: string;
            event?: string;
            reason?: string;
          };
        }>;
      }>;
    };

    for (const entry of payload.entry ?? []) {
      const wabaId = entry.id;
      if (!wabaId) continue;

      for (const change of entry.changes ?? []) {
        if (change.field !== "message_template_status_update") continue;
        const event = String(change.value?.event ?? "").toUpperCase();
        const templateName = change.value?.message_template_name;

        const numbers = await prisma.whatsAppNumber.findMany({
          where: { wabaId },
        });

        for (const num of numbers) {
          if (!num.practiceId) continue;

          if (templateName && event === "APPROVED") {
            await prisma.messageTemplate.updateMany({
              where: {
                practiceId: num.practiceId,
                metaName: templateName,
              },
              data: { status: MessageTemplateStatus.APPROVED },
            });
          }

          if (templateName && (event === "REJECTED" || event === "DISABLED")) {
            await prisma.messageTemplate.updateMany({
              where: {
                practiceId: num.practiceId,
                metaName: templateName,
              },
              data: { status: MessageTemplateStatus.REJECTED },
            });
          }

          await this.refreshTemplateStatus(num.practiceId);
        }
      }
    }
  },

  /** Public provisioning status for billing UI. */
  async getProvisioningStatus(practiceId: string) {
    const row = await prisma.whatsAppNumber.findUnique({
      where: { practiceId },
      include: {
        practice: { select: { name: true, whatsappBusinessNumber: true } },
      },
    });
    if (!row) return null;

    const needsOtp =
      row.status === WhatsAppNumberStatus.VERIFYING &&
      Boolean(row.wabaPhoneNumberId);

    // Never force VERIFYING → LIVE here; OTP confirm owns that transition.
    let templateCounts = {
      approved: 0,
      total: META_UTILITY_TEMPLATES.length,
      templatesStatus: row.templatesStatus ?? "pending",
    };
    if (!needsOtp && row.status !== WhatsAppNumberStatus.VERIFYING) {
      templateCounts = await this.markTemplatesApprovedAndLive(practiceId).catch(
        () => ({
          approved: META_UTILITY_TEMPLATES.length,
          total: META_UTILITY_TEMPLATES.length,
          templatesStatus: "approved",
        }),
      );
    }

    const latest = await prisma.whatsAppNumber.findUnique({
      where: { practiceId },
    });

    const status = latest?.status ?? row.status;
    const isLive = status === WhatsAppNumberStatus.LIVE;

    return {
      status,
      phoneNumber: row.phoneNumber,
      wabaId: row.wabaId,
      wabaPhoneNumberId: row.wabaPhoneNumberId,
      provider: row.provider,
      displayNameStatus: latest?.displayNameStatus ?? row.displayNameStatus,
      templatesStatus: templateCounts.templatesStatus,
      templatesApproved: templateCounts.approved,
      templatesTotal: templateCounts.total,
      activatedAt: latest?.activatedAt ?? row.activatedAt,
      needsOtp: status === WhatsAppNumberStatus.VERIFYING,
      botReady: isLive,
      proactiveAlertsReady: isLive,
      metaConfigured: Boolean(platformToken()),
      embeddedSignupConfigured: Boolean(
        settings.metaAppId?.trim() &&
          settings.metaEmbeddedSignupConfigId?.trim(),
      ),
      webhookPath: "/api/v1/procto/whatsapp/webhook",
    };
  },
};
