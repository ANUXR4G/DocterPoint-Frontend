import crypto from "crypto";
import { settings } from "../config/index.js";
import { AppError } from "../core/response.js";

type RazorpayRequestInit = {
  method?: string;
  body?: unknown;
};

export type RazorpaySubscription = {
  id: string;
  status: string;
  plan_id?: string;
  customer_id?: string;
  current_start?: number;
  current_end?: number;
  short_url?: string;
  notes?: Record<string, string> | string;
};

export type RazorpayCustomer = {
  id: string;
  email?: string;
  contact?: string;
  name?: string;
};

export type RazorpayPaymentLink = {
  id: string;
  short_url: string;
  status: "created" | "partially_paid" | "paid" | "expired" | "cancelled";
  amount: number;
  amount_paid?: number;
  expire_by?: number;
  reference_id?: string;
  payments?: Array<{ payment_id: string; status?: string; created_at?: number }> | null;
  notes?: Record<string, string> | string;
};

export type RazorpayCredentials = { keyId: string; keySecret: string };

/** Razorpay rejected the key pair (HTTP 401 from Razorpay — not a user-session 401). */
export class RazorpayAuthError extends AppError {
  constructor(message: string) {
    super(502, message);
  }
}

async function rzpFetch<T>(
  creds: RazorpayCredentials,
  path: string,
  init: RazorpayRequestInit = {},
): Promise<T> {
  const auth = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { description?: string };
  };
  if (res.status === 401) {
    throw new RazorpayAuthError(
      json.error?.description ?? "Razorpay authentication failed",
    );
  }
  if (!res.ok) {
    throw new AppError(
      502,
      json.error?.description ?? `Razorpay request failed (${res.status})`,
    );
  }
  return json;
}

function hmacHexEqual(secret: string, data: string, signature: string | undefined) {
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(data).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export type CreatePaymentLinkBody = {
  amount: number;
  currency?: string;
  description: string;
  reference_id?: string;
  expire_by?: number;
  customer?: { name?: string; contact?: string; email?: string };
  notify?: { sms?: boolean; email?: boolean };
  reminder_enable?: boolean;
  callback_url?: string;
  callback_method?: "get";
  notes?: Record<string, string>;
};

/** Payment Links on any Razorpay account (clinic-owned or the platform's). */
export function createRazorpayClient(creds: RazorpayCredentials) {
  return {
    keyId: creds.keyId,
    request<T>(path: string, init?: RazorpayRequestInit) {
      return rzpFetch<T>(creds, path, init);
    },
    createPaymentLink(body: CreatePaymentLinkBody) {
      return rzpFetch<RazorpayPaymentLink>(creds, "/payment_links", {
        method: "POST",
        body: { currency: "INR", accept_partial: false, ...body },
      });
    },
    getPaymentLink(paymentLinkId: string) {
      return rzpFetch<RazorpayPaymentLink>(
        creds,
        `/payment_links/${encodeURIComponent(paymentLinkId)}`,
      );
    },
    cancelPaymentLink(paymentLinkId: string) {
      return rzpFetch<RazorpayPaymentLink>(
        creds,
        `/payment_links/${encodeURIComponent(paymentLinkId)}/cancel`,
        { method: "POST" },
      );
    },
    /** Redirect after a Payment Link is paid (`callback_url`, GET params). */
    verifyPaymentLinkSignature(params: {
      paymentLinkId: string;
      referenceId: string;
      status: string;
      paymentId: string;
      signature: string | undefined;
    }) {
      return hmacHexEqual(
        creds.keySecret,
        `${params.paymentLinkId}|${params.referenceId}|${params.status}|${params.paymentId}`,
        params.signature,
      );
    },
  };
}

export type RazorpayClient = ReturnType<typeof createRazorpayClient>;

export function verifyRazorpayWebhook(
  secret: string,
  rawBody: string,
  signature: string | undefined,
): boolean {
  return hmacHexEqual(secret, rawBody, signature);
}

export type RazorpayPlan = {
  id: string;
  period: string;
  interval: number;
  item: { name: string; amount: number; currency: string };
};

/**
 * GlucoGuide Razorpay client (practice subscriptions).
 * When keys are missing, BillingService falls back to mock activate.
 */
export const razorpay = {
  isConfigured(): boolean {
    return Boolean(settings.razorpayKeyId && settings.razorpayKeySecret);
  },

  get keyId(): string {
    return settings.razorpayKeyId;
  },

  get webhookSecret(): string {
    return settings.razorpayWebhookSecret;
  },

  /** Platform account as a Payment Links client; null when env keys are missing. */
  platformClient(): RazorpayClient | null {
    if (!this.isConfigured()) return null;
    return createRazorpayClient({
      keyId: settings.razorpayKeyId,
      keySecret: settings.razorpayKeySecret,
    });
  },

  async request<T>(path: string, init: RazorpayRequestInit = {}): Promise<T> {
    if (!this.isConfigured()) {
      throw new AppError(503, "Razorpay keys are not configured");
    }
    return rzpFetch<T>(
      { keyId: settings.razorpayKeyId, keySecret: settings.razorpayKeySecret },
      path,
      init,
    );
  },

  verifyWebhookSignature(
    rawBody: string,
    signature: string | undefined,
  ): boolean {
    const secret = this.webhookSecret;
    if (!secret || !signature) return false;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signature),
      );
    } catch {
      return false;
    }
  },

  /** Razorpay Checkout success — subscription payments. */
  verifySubscriptionPaymentSignature(
    paymentId: string,
    subscriptionId: string,
    signature: string | undefined,
  ): boolean {
    if (!this.isConfigured() || !signature) return false;
    const expected = crypto
      .createHmac("sha256", settings.razorpayKeySecret)
      .update(`${paymentId}|${subscriptionId}`)
      .digest("hex");
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signature),
      );
    } catch {
      return false;
    }
  },

  createPlan(body: {
    period: "monthly" | "yearly";
    interval: number;
    item: {
      name: string;
      amount: number;
      currency: string;
      description?: string;
    };
  }) {
    return this.request<RazorpayPlan>("/plans", { method: "POST", body });
  },

  createCustomer(body: {
    name: string;
    email?: string;
    contact: string;
    notes?: Record<string, string>;
  }) {
    return this.request<RazorpayCustomer>("/customers", {
      method: "POST",
      body,
    });
  },

  createSubscription(body: {
    plan_id: string;
    total_count: number;
    customer_notify?: number;
    quantity?: number;
    customer_id?: string;
    notes?: Record<string, string>;
  }) {
    return this.request<RazorpaySubscription>("/subscriptions", {
      method: "POST",
      body,
    });
  },

  cancelSubscription(razorpaySubscriptionId: string, cancelAtCycleEnd: boolean) {
    return this.request(`/subscriptions/${razorpaySubscriptionId}/cancel`, {
      method: "POST",
      body: { cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0 },
    });
  },

  getSubscription(razorpaySubscriptionId: string) {
    return this.request<RazorpaySubscription>(
      `/subscriptions/${razorpaySubscriptionId}`,
    );
  },

  getPayment(razorpayPaymentId: string) {
    return this.request<{
      id: string;
      status: string;
      amount?: number;
      currency?: string;
      notes?: Record<string, string> | string;
      // Subscription id may appear on payment entity for subscription invoices
      subscription_id?: string;
    }>(`/payments/${razorpayPaymentId}`);
  },

  createOrder(body: {
    amount: number;
    currency?: string;
    receipt?: string;
    notes?: Record<string, string>;
  }) {
    return this.request<{
      id: string;
      amount: number;
      currency: string;
      status: string;
      receipt?: string;
    }>("/orders", {
      method: "POST",
      body: {
        amount: body.amount,
        currency: body.currency ?? "INR",
        receipt: body.receipt,
        notes: body.notes,
      },
    });
  },

  createPaymentLink(body: {
    amount: number;
    currency?: string;
    description: string;
    reference_id?: string;
    expire_by?: number;
    customer?: { name?: string; contact?: string; email?: string };
    notify?: { sms?: boolean; email?: boolean };
    reminder_enable?: boolean;
    callback_url?: string;
    callback_method?: "get";
    notes?: Record<string, string>;
  }) {
    return this.request<RazorpayPaymentLink>("/payment_links", {
      method: "POST",
      body: { currency: "INR", accept_partial: false, ...body },
    });
  },

  getPaymentLink(paymentLinkId: string) {
    return this.request<RazorpayPaymentLink>(
      `/payment_links/${encodeURIComponent(paymentLinkId)}`,
    );
  },

  cancelPaymentLink(paymentLinkId: string) {
    return this.request<RazorpayPaymentLink>(
      `/payment_links/${encodeURIComponent(paymentLinkId)}/cancel`,
      { method: "POST" },
    );
  },

  /** Redirect after a Payment Link is paid (`callback_url`, GET params). */
  verifyPaymentLinkSignature(params: {
    paymentLinkId: string;
    referenceId: string;
    status: string;
    paymentId: string;
    signature: string | undefined;
  }): boolean {
    if (!this.isConfigured() || !params.signature) return false;
    const expected = crypto
      .createHmac("sha256", settings.razorpayKeySecret)
      .update(
        `${params.paymentLinkId}|${params.referenceId}|${params.status}|${params.paymentId}`,
      )
      .digest("hex");
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(params.signature),
      );
    } catch {
      return false;
    }
  },

  /** Razorpay Checkout success — one-time order payments. */
  verifyOrderPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string | undefined,
  ): boolean {
    if (!this.isConfigured() || !signature) return false;
    const expected = crypto
      .createHmac("sha256", settings.razorpayKeySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signature),
      );
    } catch {
      return false;
    }
  },
};
