import { prisma } from "../../db/prisma.js";
import { AppError } from "../../core/response.js";
import { decrypt, encrypt } from "../../core/security.js";
import {
  RazorpayAuthError,
  createRazorpayClient,
  razorpay,
  type RazorpayClient,
} from "../../lib/razorpay.js";
import { publicApiOrigin } from "./bookingCalendar.js";
import { PracticeService } from "./practice.service.js";

export const RAZORPAY_KEY_ID_RE = /^rzp_(test|live)_[A-Za-z0-9]{8,32}$/;

export type PracticeRazorpayFields = {
  razorpayKeyId?: string | null;
  razorpayKeySecretEnc?: string | null;
};

export type PaymentAccount = {
  source: "PRACTICE" | "PLATFORM";
  client: RazorpayClient;
};

export function razorpayKeyMode(keyId: string | null | undefined) {
  if (!keyId) return null;
  return keyId.startsWith("rzp_live_") ? ("LIVE" as const) : ("TEST" as const);
}

/** Key ID is written and cleared together with the secret (secret is omitted from default reads). */
export function hasOwnRazorpayKeys(p: PracticeRazorpayFields): boolean {
  return Boolean(p.razorpayKeyId);
}

/** Payments can be taken for this practice (own keys, else the platform account). */
export function practicePaymentsEnabled(p: PracticeRazorpayFields): boolean {
  return hasOwnRazorpayKeys(p) || razorpay.isConfigured();
}

function practiceClient(p: PracticeRazorpayFields): RazorpayClient | null {
  if (!p.razorpayKeyId || !p.razorpayKeySecretEnc) return null;
  try {
    return createRazorpayClient({
      keyId: p.razorpayKeyId,
      keySecret: decrypt(p.razorpayKeySecretEnc),
    });
  } catch (err) {
    console.warn("[payment] could not decrypt clinic Razorpay secret:", err);
    return null;
  }
}

/** Account for new links: the clinic's own keys win, else the platform account. */
export function accountForPractice(p: PracticeRazorpayFields): PaymentAccount | null {
  const own = practiceClient(p);
  if (own) return { source: "PRACTICE", client: own };
  const platform = razorpay.platformClient();
  return platform ? { source: "PLATFORM", client: platform } : null;
}

/**
 * Account that created an existing link (`keyId` null = platform, pre-dates
 * clinic keys). Null when that key is no longer configured.
 */
export async function accountForLink(
  practiceId: string,
  keyId: string | null,
): Promise<RazorpayClient | null> {
  const platform = razorpay.platformClient();
  if (!keyId || (platform && keyId === platform.keyId)) return platform;
  const practice = await prisma.practice.findUnique({
    where: { id: practiceId },
    select: { razorpayKeyId: true, razorpayKeySecretEnc: true },
  });
  if (!practice || practice.razorpayKeyId !== keyId) return null;
  return practiceClient(practice);
}

export function practiceWebhookUrl(practiceId: string): string {
  return `${publicApiOrigin()}/api/v1/procto/payments/razorpay/webhook/${practiceId}`;
}

function lastFour(enc: string | null): string | null {
  if (!enc) return null;
  try {
    return decrypt(enc).slice(-4);
  } catch {
    return null;
  }
}

async function loadSettings(practiceId: string) {
  const p = await prisma.practice.findUnique({
    where: { id: practiceId },
    select: {
      razorpayKeyId: true,
      razorpayKeySecretEnc: true,
      razorpayWebhookSecretEnc: true,
      razorpayVerifiedAt: true,
    },
  });
  if (!p) throw new AppError(404, "practice not found.");
  return p;
}

function settingsView(
  practiceId: string,
  p: Awaited<ReturnType<typeof loadSettings>>,
) {
  const connected = hasOwnRazorpayKeys(p);
  return {
    connected,
    keyId: p.razorpayKeyId,
    mode: razorpayKeyMode(p.razorpayKeyId),
    secretLast4: lastFour(p.razorpayKeySecretEnc),
    hasWebhookSecret: Boolean(p.razorpayWebhookSecretEnc),
    verifiedAt: p.razorpayVerifiedAt,
    webhookUrl: practiceWebhookUrl(practiceId),
    platformFallback: !connected && razorpay.isConfigured(),
  };
}

export const PaymentAccountService = {
  async getSettings(practiceId: string, actorUserId: string) {
    await PracticeService.assertProfileEditor(practiceId, actorUserId, "payment settings");
    return settingsView(practiceId, await loadSettings(practiceId));
  },

  /**
   * Save the clinic's Razorpay keys after a live check with Razorpay. A blank
   * secret keeps the stored one (same key ID only); a blank webhook secret
   * keeps the stored one, `null` clears it.
   */
  async saveSettings(
    practiceId: string,
    actorUserId: string,
    input: { keyId?: unknown; keySecret?: unknown; webhookSecret?: unknown },
  ) {
    await PracticeService.assertProfileEditor(practiceId, actorUserId, "payment settings");
    const current = await loadSettings(practiceId);

    const keyId = String(input.keyId ?? "").trim();
    if (!RAZORPAY_KEY_ID_RE.test(keyId)) {
      throw new AppError(
        400,
        "Enter a valid Razorpay Key ID (starts with rzp_live_ or rzp_test_).",
      );
    }
    let keySecret = String(input.keySecret ?? "").trim();
    if (!keySecret) {
      if (current.razorpayKeyId !== keyId || !current.razorpayKeySecretEnc) {
        throw new AppError(400, "Enter the Razorpay Key Secret.");
      }
      keySecret = decrypt(current.razorpayKeySecretEnc);
    }
    if (keySecret.length < 8 || keySecret.length > 128 || /\s/.test(keySecret)) {
      throw new AppError(400, "That Key Secret doesn't look right.");
    }

    let webhookSecretEnc: string | null | undefined;
    if (input.webhookSecret === null) {
      webhookSecretEnc = null;
    } else {
      const w = String(input.webhookSecret ?? "").trim();
      if (w) {
        if (w.length > 128) throw new AppError(400, "Webhook secret is too long.");
        webhookSecretEnc = encrypt(w);
      }
    }

    try {
      await createRazorpayClient({ keyId, keySecret }).request(
        "/payments?count=1",
      );
    } catch (err) {
      if (err instanceof RazorpayAuthError) {
        throw new AppError(
          400,
          "Razorpay rejected this Key ID / Key Secret. Copy both again from Razorpay Dashboard → Account & Settings → API Keys.",
        );
      }
      throw new AppError(
        502,
        "Could not reach Razorpay to check these keys. Try again in a minute.",
      );
    }

    const updated = await prisma.practice.update({
      where: { id: practiceId },
      data: {
        razorpayKeyId: keyId,
        razorpayKeySecretEnc: encrypt(keySecret),
        razorpayVerifiedAt: new Date(),
        ...(webhookSecretEnc !== undefined
          ? { razorpayWebhookSecretEnc: webhookSecretEnc }
          : {}),
      },
      select: {
        razorpayKeyId: true,
        razorpayKeySecretEnc: true,
        razorpayWebhookSecretEnc: true,
        razorpayVerifiedAt: true,
      },
    });
    console.log(
      `[payment] practice ${practiceId} Razorpay keys saved by ${actorUserId} (${razorpayKeyMode(keyId)})`,
    );
    return settingsView(practiceId, updated);
  },

  async removeSettings(practiceId: string, actorUserId: string) {
    await PracticeService.assertProfileEditor(practiceId, actorUserId, "payment settings");
    const updated = await prisma.practice.update({
      where: { id: practiceId },
      data: {
        razorpayKeyId: null,
        razorpayKeySecretEnc: null,
        razorpayWebhookSecretEnc: null,
        razorpayVerifiedAt: null,
      },
      select: {
        razorpayKeyId: true,
        razorpayKeySecretEnc: true,
        razorpayWebhookSecretEnc: true,
        razorpayVerifiedAt: true,
      },
    });
    console.log(`[payment] practice ${practiceId} Razorpay keys removed by ${actorUserId}`);
    return settingsView(practiceId, updated);
  },

  /** Webhook secret for the clinic's own account (null when not set). */
  async webhookSecret(practiceId: string): Promise<{ secret: string; keyId: string } | null> {
    const p = await prisma.practice.findUnique({
      where: { id: practiceId },
      select: { razorpayKeyId: true, razorpayWebhookSecretEnc: true },
    });
    if (!p?.razorpayKeyId || !p.razorpayWebhookSecretEnc) return null;
    try {
      return { secret: decrypt(p.razorpayWebhookSecretEnc), keyId: p.razorpayKeyId };
    } catch {
      return null;
    }
  },
};
