import { settings } from "../../config/index.js";
import { AppError } from "../../core/response.js";
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

type WabaPhoneRow = {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
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
      `${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`,
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
