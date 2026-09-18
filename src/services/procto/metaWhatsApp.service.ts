import { settings } from "../../config/index.js";
import { AppError } from "../../core/response.js";
import { prisma } from "../../db/prisma.js";
import { NumberPoolService } from "./numberPool.service.js";

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

function graphUrl(path: string): string {
  const base = settings.whatsappApiVersion.replace(/^\//, "");
  return `https://graph.facebook.com/${base}/${path.replace(/^\//, "")}`;
}

type GraphError = { error?: { message?: string; code?: number } };

async function graphGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(graphUrl(path), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as T & GraphError;
  if (!res.ok) {
    throw new AppError(
      502,
      data.error?.message ?? `Meta Graph API error (${res.status})`,
    );
  }
  return data;
}

async function graphPost<T>(
  path: string,
  token: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(graphUrl(path), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & GraphError;
  if (!res.ok) {
    throw new AppError(
      502,
      data.error?.message ?? `Meta Graph API error (${res.status})`,
    );
  }
  return data;
}

type WabaPhoneRow = {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  code_verification_status?: string;
};

function generateTwoStepPin(): string {
  const fromEnv = settings.whatsappTwoStepPin;
  if (fromEnv.length === 6) return fromEnv;
  return String(Math.floor(100000 + Math.random() * 900000));
}

export type RegistrationPhoneProvisionResult = {
  ok: boolean;
  mode: "meta_added" | "meta_existing" | "mock" | "skipped" | "error";
  phoneNumberId?: string | null;
  message?: string;
};

export const MetaWhatsAppService = {
  isEmbeddedSignupConfigured(): boolean {
    return Boolean(
      settings.metaAppId?.trim() && settings.metaEmbeddedSignupConfigId?.trim(),
    );
  },

  isAutoResolveConfigured(): boolean {
    return Boolean(
      settings.whatsappAccessToken?.trim() && settings.whatsappWabaId?.trim(),
    );
  },

  /** Public config for frontend Embedded Signup (no secrets). */
  getPublicConfig() {
    const apiVersion = settings.whatsappApiVersion.replace(/^v/i, "");
    return {
      appId: settings.metaAppId || null,
      configId: settings.metaEmbeddedSignupConfigId || null,
      apiVersion,
      embeddedSignupEnabled: this.isEmbeddedSignupConfigured(),
      autoResolveEnabled: this.isAutoResolveConfigured(),
      coexistenceFlow:
        settings.metaEmbeddedSignupFeature === "whatsapp_business_app_onboarding",
    };
  },

  /**
   * Add a clinic/doctor registration Tel to the platform Meta WABA phone list
   * (Graph POST /{waba-id}/phone_numbers). If the number is already on the WABA,
   * resolves its Phone Number ID instead.
   */
  async addPhoneNumberToWaba(opts: {
    phoneNumber: string;
    verifiedName: string;
    countryCode?: string;
    wabaId?: string;
    accessToken?: string;
  }): Promise<{ phoneNumberId: string; created: boolean }> {
    const token = opts.accessToken ?? settings.whatsappAccessToken;
    const wabaId = opts.wabaId ?? settings.whatsappWabaId;
    if (!token?.trim() || !wabaId?.trim()) {
      throw new AppError(
        503,
        "WHATSAPP_ACCESS_TOKEN and WHATSAPP_WABA_ID are required to add numbers to Meta.",
      );
    }

    const phone = digitsOnly(opts.phoneNumber);
    if (phone.length < 10) {
      throw new AppError(400, "phoneNumber must be a valid 10-digit mobile");
    }

    // Already on the account? Reuse — do not POST a duplicate.
    try {
      const existing = await this.resolvePhoneNumberId(phone, {
        wabaId,
        accessToken: token,
      });
      return { phoneNumberId: existing.phoneNumberId, created: false };
    } catch {
      // Not found (or lookup failed) — try creating on the WABA.
    }

    const cc = (opts.countryCode || "91").replace(/\D/g, "") || "91";
    const verifiedName = opts.verifiedName.trim().slice(0, 100) || "Clinic";

    try {
      const created = await graphPost<{ id?: string }>(
        `${wabaId}/phone_numbers`,
        token,
        {
          cc,
          phone_number: phone,
          verified_name: verifiedName,
        },
      );
      if (!created.id) {
        throw new AppError(502, "Meta did not return a Phone Number ID.");
      }
      return { phoneNumberId: created.id, created: true };
    } catch (err) {
      // Race / already exists — resolve again
      const msg = err instanceof Error ? err.message : String(err);
      if (/already|exist|duplicate|200000/i.test(msg)) {
        const existing = await this.resolvePhoneNumberId(phone, {
          wabaId,
          accessToken: token,
        });
        return { phoneNumberId: existing.phoneNumberId, created: false };
      }
      throw err;
    }
  },

  /**
   * Registration hook: put the Tel on Meta's phone number list and link it in
   * GlucoGuide. Never throws — signup must succeed even if Meta is unavailable.
   *
   * - Meta configured → POST (or resolve) on platform WABA, then link row
   * - New numbers → VERIFYING + auto SMS OTP (complete in-app)
   * - No Meta credentials → MOCK LIVE line so local demos still work
   */
  async ensurePhoneListedAtRegistration(opts: {
    practiceId: string;
    phoneNumber: string;
    displayName: string;
  }): Promise<RegistrationPhoneProvisionResult> {
    const phone = digitsOnly(opts.phoneNumber);
    if (phone.length < 10) {
      return { ok: false, mode: "skipped", message: "Invalid phone" };
    }

    try {
      const already = await prisma.whatsAppNumber.findUnique({
        where: { practiceId: opts.practiceId },
      });
      if (already) {
        return {
          ok: true,
          mode: "skipped",
          phoneNumberId: already.wabaPhoneNumberId,
          message: "Practice already has a WhatsApp line",
        };
      }

      const { NumberPoolService } = await import("./numberPool.service.js");

      if (!this.isAutoResolveConfigured()) {
        await NumberPoolService.linkRegistrationNumber(opts.practiceId, {
          phoneNumber: phone,
          displayName: opts.displayName,
          status: "LIVE",
          provider: "MOCK",
          notes:
            "Auto-linked at registration (MOCK — set WHATSAPP_ACCESS_TOKEN + WHATSAPP_WABA_ID to add to Meta).",
        });
        return {
          ok: true,
          mode: "mock",
          message: "Linked as MOCK WhatsApp line (Meta credentials not configured).",
        };
      }

      const { phoneNumberId, created } = await this.addPhoneNumberToWaba({
        phoneNumber: phone,
        verifiedName: opts.displayName,
      });

      if (created) {
        const pin = generateTwoStepPin();
        await NumberPoolService.linkRegistrationNumber(opts.practiceId, {
          phoneNumber: phone,
          displayName: opts.displayName,
          wabaPhoneNumberId: phoneNumberId,
          wabaId: settings.whatsappWabaId || undefined,
          status: "VERIFYING",
          provider: "META_CLOUD_API",
          twoStepPin: pin,
          notes:
            "Added to Meta WABA at registration. Complete in-app SMS/voice OTP to go LIVE.",
        });

        // Best-effort: send OTP immediately so the clinic can verify without WhatsApp Manager.
        try {
          await this.requestPhoneVerificationCode(phoneNumberId, {
            method: "SMS",
          });
        } catch (otpErr) {
          console.warn(
            `[Meta] auto request_code failed for ${phoneNumberId}:`,
            otpErr instanceof Error ? otpErr.message : otpErr,
          );
        }

        return {
          ok: true,
          mode: "meta_added",
          phoneNumberId,
          message:
            "Number added to Meta. Enter the SMS OTP in Billing → WhatsApp to go LIVE.",
        };
      }

      // Already on WABA — try register + LIVE (may already be verified).
      try {
        await this.finishVerifiedNumberGoLive(opts.practiceId, {
          phoneNumber: phone,
          phoneNumberId,
          displayName: opts.displayName,
        });
        return {
          ok: true,
          mode: "meta_existing",
          phoneNumberId,
          message: "Number already on Meta — connected and LIVE.",
        };
      } catch {
        await NumberPoolService.connectOwnNumber(opts.practiceId, {
          phoneNumber: phone,
          wabaPhoneNumberId: phoneNumberId,
          wabaId: settings.whatsappWabaId || undefined,
        });
        return {
          ok: true,
          mode: "meta_existing",
          phoneNumberId,
          message: "Number already on Meta — connected to this practice.",
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[Meta] ensurePhoneListedAtRegistration practice=${opts.practiceId}:`,
        message,
      );
      try {
        const { NumberPoolService } = await import("./numberPool.service.js");
        await NumberPoolService.linkRegistrationNumber(opts.practiceId, {
          phoneNumber: phone,
          displayName: opts.displayName,
          status: "VERIFYING",
          provider: this.isAutoResolveConfigured()
            ? "META_CLOUD_API"
            : "MOCK",
          notes: `Registration queued Meta add (pending): ${message}`,
        });
      } catch (inner) {
        console.warn(
          "[Meta] linkRegistrationNumber fallback failed:",
          inner instanceof Error ? inner.message : inner,
        );
      }
      return { ok: false, mode: "error", message };
    }
  },

  /** Request SMS/VOICE OTP for a Meta Phone Number ID. */
  async requestPhoneVerificationCode(
    phoneNumberId: string,
    opts?: { method?: "SMS" | "VOICE"; language?: string; accessToken?: string },
  ): Promise<{ ok: true }> {
    const token = opts?.accessToken ?? settings.whatsappAccessToken;
    if (!token?.trim()) {
      throw new AppError(503, "WHATSAPP_ACCESS_TOKEN is not set.");
    }
    const method = opts?.method === "VOICE" ? "VOICE" : "SMS";
    const language = opts?.language || "en_US";
    const id = phoneNumberId.trim();
    if (!id) throw new AppError(400, "phoneNumberId is required");

    await graphPost<{ success?: boolean }>(
      `${id}/request_code?code_method=${method}&language=${encodeURIComponent(language)}`,
      token,
      {},
    );
    return { ok: true };
  },

  /** Submit OTP from request_code. */
  async verifyPhoneCode(
    phoneNumberId: string,
    code: string,
    accessToken?: string,
  ): Promise<{ ok: true }> {
    const token = accessToken ?? settings.whatsappAccessToken;
    if (!token?.trim()) {
      throw new AppError(503, "WHATSAPP_ACCESS_TOKEN is not set.");
    }
    const id = phoneNumberId.trim();
    const cleaned = code.replace(/\D/g, "");
    if (!id) throw new AppError(400, "phoneNumberId is required");
    if (cleaned.length < 4) throw new AppError(400, "Invalid verification code");

    await graphPost<{ success?: boolean }>(
      `${id}/verify_code?code=${encodeURIComponent(cleaned)}`,
      token,
      {},
    );
    return { ok: true };
  },

  /** Register verified number for Cloud API messaging. */
  async registerPhoneForCloudApi(
    phoneNumberId: string,
    pin: string,
    accessToken?: string,
  ): Promise<{ ok: true }> {
    const token = accessToken ?? settings.whatsappAccessToken;
    if (!token?.trim()) {
      throw new AppError(503, "WHATSAPP_ACCESS_TOKEN is not set.");
    }
    const id = phoneNumberId.trim();
    const pinDigits = pin.replace(/\D/g, "").slice(0, 6);
    if (!id) throw new AppError(400, "phoneNumberId is required");
    if (pinDigits.length !== 6) {
      throw new AppError(400, "Two-step PIN must be 6 digits");
    }

    await graphPost<{ success?: boolean }>(`${id}/register`, token, {
      messaging_product: "whatsapp",
      pin: pinDigits,
    });
    return { ok: true };
  },

  /**
   * Practice-owner: re-send Meta OTP for a VERIFYING line.
   */
  async requestOtpForPractice(
    practiceId: string,
    opts?: { method?: "SMS" | "VOICE" },
  ) {
    const row = await prisma.whatsAppNumber.findUnique({
      where: { practiceId },
    });
    if (!row) throw new AppError(404, "No WhatsApp line for this practice");
    if (row.status !== "VERIFYING") {
      throw new AppError(
        400,
        `Line status is ${row.status} — OTP is only for VERIFYING numbers.`,
      );
    }
    if (!row.wabaPhoneNumberId) {
      throw new AppError(
        400,
        "Meta Phone Number ID missing. Re-run registration connect or contact support.",
      );
    }

    await this.requestPhoneVerificationCode(row.wabaPhoneNumberId, {
      method: opts?.method === "VOICE" ? "VOICE" : "SMS",
    });

    return {
      ok: true as const,
      phoneNumber: row.phoneNumber,
      method: opts?.method === "VOICE" ? "VOICE" : "SMS",
      message: `Verification code sent via ${opts?.method === "VOICE" ? "voice" : "SMS"} to +91 ${row.phoneNumber}.`,
    };
  },

  /**
   * Practice-owner: confirm Meta OTP → register Cloud API → LIVE.
   */
  async confirmOtpForPractice(practiceId: string, code: string) {
    const row = await prisma.whatsAppNumber.findUnique({
      where: { practiceId },
    });
    if (!row) throw new AppError(404, "No WhatsApp line for this practice");
    if (row.status !== "VERIFYING") {
      throw new AppError(
        400,
        `Line status is ${row.status} — OTP confirm is only for VERIFYING numbers.`,
      );
    }
    if (!row.wabaPhoneNumberId) {
      throw new AppError(400, "Meta Phone Number ID missing.");
    }

    const pin =
      (row.twoStepPin && row.twoStepPin.length === 6
        ? row.twoStepPin
        : null) ||
      (settings.whatsappTwoStepPin.length === 6
        ? settings.whatsappTwoStepPin
        : null) ||
      generateTwoStepPin();

    try {
      await this.verifyPhoneCode(row.wabaPhoneNumberId, code);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Already verified on Meta — continue to register.
      if (!/136024|already.?verif/i.test(msg)) {
        throw err;
      }
    }

    try {
      await this.registerPhoneForCloudApi(row.wabaPhoneNumberId, pin);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Already registered is fine.
      if (!/already.?regist|133016|133015/i.test(msg)) {
        // PIN mismatch — try once with freshly generated pin only if env/default unused
        if (/133005|pin/i.test(msg) && pin !== settings.whatsappTwoStepPin) {
          const retryPin = generateTwoStepPin();
          await this.registerPhoneForCloudApi(row.wabaPhoneNumberId, retryPin);
          await prisma.whatsAppNumber.update({
            where: { id: row.id },
            data: { twoStepPin: retryPin },
          });
        } else {
          throw err;
        }
      }
    }

    const { NumberPoolService } = await import("./numberPool.service.js");
    const { WhatsAppNumberStatus } = await import("@prisma/client");
    const updated = await NumberPoolService.advanceStatus(
      row.id,
      WhatsAppNumberStatus.LIVE,
      {
        verificationStatus: "verified",
        displayNameStatus: "approved",
        templatesStatus: "approved",
        wabaPhoneNumberId: row.wabaPhoneNumberId,
        notes: "Verified via in-app Meta OTP; registered for Cloud API.",
      },
    );

    // Ensure PIN persisted if we generated one during confirm.
    if (!row.twoStepPin || row.twoStepPin.length !== 6) {
      await prisma.whatsAppNumber.update({
        where: { id: row.id },
        data: { twoStepPin: pin },
      });
    }

    try {
      const { MetaWhatsAppProvisionService } = await import(
        "./metaWhatsApp.provision.js"
      );
      if (row.wabaId || settings.whatsappWabaId) {
        await MetaWhatsAppProvisionService.syncPracticeTemplates(
          practiceId,
          row.wabaId || settings.whatsappWabaId,
        );
      }
    } catch (err) {
      console.warn(
        "[Meta] post-OTP template sync:",
        err instanceof Error ? err.message : err,
      );
    }

    return {
      ok: true as const,
      status: updated.status,
      phoneNumber: updated.phoneNumber,
      wabaPhoneNumberId: updated.wabaPhoneNumberId,
      message: "WhatsApp line is LIVE. Patients can message this number.",
    };
  },

  /** Existing WABA number: register + connect LIVE without OTP UI. */
  async finishVerifiedNumberGoLive(
    practiceId: string,
    opts: {
      phoneNumber: string;
      phoneNumberId: string;
      displayName: string;
    },
  ) {
    const pin = generateTwoStepPin();
    try {
      await this.registerPhoneForCloudApi(opts.phoneNumberId, pin);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/already.?regist|133016|133015/i.test(msg)) {
        throw err;
      }
    }

    const { NumberPoolService } = await import("./numberPool.service.js");
    await NumberPoolService.connectOwnNumber(practiceId, {
      phoneNumber: opts.phoneNumber,
      wabaPhoneNumberId: opts.phoneNumberId,
      wabaId: settings.whatsappWabaId || undefined,
    });

    await prisma.whatsAppNumber.updateMany({
      where: { practiceId },
      data: { twoStepPin: pin },
    });
  },

  /** Look up Meta Phone Number ID from a clinic mobile on the platform WABA. */
  async resolvePhoneNumberId(
    phoneNumber: string,
    opts?: { wabaId?: string; accessToken?: string },
  ) {
    const token = opts?.accessToken ?? settings.whatsappAccessToken;
    const wabaId = opts?.wabaId ?? settings.whatsappWabaId;
    if (!token?.trim()) {
      throw new AppError(
        503,
        "WHATSAPP_ACCESS_TOKEN is not set on the server.",
      );
    }
    if (!wabaId?.trim()) {
      throw new AppError(
        503,
        "WHATSAPP_WABA_ID is not set on the server.",
      );
    }

    const target = digitsOnly(phoneNumber);
    if (target.length < 10) {
      throw new AppError(400, "phoneNumber must be a valid 10-digit mobile");
    }

    const payload = await graphGet<{ data: WabaPhoneRow[] }>(
      `${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status`,
      token,
    );

    const match = payload.data.find((row) => {
      const d = (row.display_phone_number ?? "").replace(/\D/g, "").slice(-10);
      return d === target;
    });

    if (!match) {
      throw new AppError(
        404,
        "Number not found on your Meta WhatsApp account. Add it in WhatsApp Manager or use Connect with Meta.",
      );
    }

    return {
      phoneNumberId: match.id,
      displayPhoneNumber: match.display_phone_number ?? null,
      verifiedName: match.verified_name ?? null,
    };
  },

  async discoverPhoneInWaba(
    wabaId: string,
    accessToken: string,
    phoneNumber?: string,
  ) {
    if (phoneNumber?.trim()) {
      return this.resolvePhoneNumberId(phoneNumber, { wabaId, accessToken });
    }

    const payload = await graphGet<{ data: WabaPhoneRow[] }>(
      `${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`,
      accessToken,
    );

    if (payload.data.length === 1) {
      return {
        phoneNumberId: payload.data[0]!.id,
        displayPhoneNumber: payload.data[0]!.display_phone_number ?? null,
        verifiedName: payload.data[0]!.verified_name ?? null,
      };
    }

    throw new AppError(
      400,
      "Multiple WhatsApp numbers on this Meta account — enter your clinic mobile so we can match the correct ID.",
    );
  },

  async exchangeCodeForToken(code: string): Promise<string> {
    const appId = settings.metaAppId;
    const secret = settings.metaAppSecret || settings.whatsappAppSecret;
    if (!appId || !secret) {
      throw new AppError(
        503,
        "META_APP_ID and META_APP_SECRET (or WHATSAPP_APP_SECRET) must be set.",
      );
    }

    const params = new URLSearchParams({
      client_id: appId,
      client_secret: secret,
      code,
    });

    const res = await fetch(graphUrl(`oauth/access_token?${params.toString()}`));
    const data = (await res.json()) as {
      access_token?: string;
      error?: { message?: string };
    };

    if (!res.ok || !data.access_token) {
      throw new AppError(
        502,
        data.error?.message ?? "Failed to exchange Meta authorization code.",
      );
    }

    return data.access_token;
  },

  /**
   * Resolve Phone Number ID (Embedded Signup payload, OAuth code, or WABA lookup)
   * then connect the practice line and run Meta provisioning.
   */
  async connectPracticeLine(
    practiceId: string,
    input: {
      phoneNumber: string;
      wabaPhoneNumberId?: string;
      wabaId?: string;
      oauthCode?: string;
    },
  ) {
    let phoneNumberId = input.wabaPhoneNumberId?.trim() || "";
    const wabaId = input.wabaId?.trim() || "";
    let oauthToken: string | undefined;

    if (input.oauthCode?.trim()) {
      oauthToken = await this.exchangeCodeForToken(input.oauthCode.trim());
    }

    const lookupToken = oauthToken || settings.whatsappAccessToken;

    if (!phoneNumberId && wabaId && lookupToken) {
      const discovered = await this.discoverPhoneInWaba(
        wabaId,
        lookupToken,
        input.phoneNumber,
      );
      phoneNumberId = discovered.phoneNumberId;
    }

    if (!phoneNumberId && this.isAutoResolveConfigured()) {
      const resolved = await this.resolvePhoneNumberId(input.phoneNumber);
      phoneNumberId = resolved.phoneNumberId;
    }

    const metaConfigured = Boolean(settings.whatsappAccessToken?.trim());
    if ((metaConfigured || wabaId) && !phoneNumberId) {
      throw new AppError(
        400,
        "Could not find Meta Phone Number ID. Use Connect with Meta (Embedded Signup) or enter the Phone Number ID from WhatsApp Manager.",
      );
    }

    const connected = await NumberPoolService.connectOwnNumber(practiceId, {
      phoneNumber: input.phoneNumber,
      wabaPhoneNumberId: phoneNumberId || undefined,
      wabaId: wabaId || undefined,
    });

    let provision = null;
    if (wabaId) {
      const { MetaWhatsAppProvisionService } = await import(
        "./metaWhatsApp.provision.js"
      );
      try {
        provision = await MetaWhatsAppProvisionService.provisionClinicWaba(
          practiceId,
          wabaId,
          oauthToken,
        );
      } catch (err) {
        console.error("[Meta provision] post-connect failed:", err);
        provision = {
          wabaId,
          subscribed: false,
          templatesSubmitted: 0,
          templatesSkipped: 0,
          templatesStatus: "error",
          errors: [
            err instanceof Error ? err.message : "Provisioning failed",
          ],
        };
      }
    }

    return { ...connected, provision };
  },
};
