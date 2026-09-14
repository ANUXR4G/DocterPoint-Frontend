import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  RazorpayCheckoutModal,
  type RazorpaySubPaymentResult,
} from "@/components/RazorpayCheckoutModal";
import {
  EmptyState,
  ErrorText,
  PageTitle,
  PrimaryButton,
} from "@/components/ui";
import { usePractice } from "@/lib/practiceContext";
import {
  cancelPendingCheckout,
  confirmPracticeBilling,
  fetchPracticeBilling,
  subscribePractice,
  type ClinicPlan,
  type PracticeBilling,
  type RazorpaySubCheckout,
} from "@/lib/procto";
import { colors, space } from "@/lib/theme";

function featureList(plan: ClinicPlan): string[] {
  const f = (plan.features ?? {}) as Record<string, unknown>;
  const items: string[] = [];
  if (plan.maxBookingsPerMonth) {
    items.push(`Up to ${plan.maxBookingsPerMonth} bookings / month`);
  }
  if (f.directory) items.push("Directory listing");
  if (f.whatsappLine) items.push("WhatsApp booking line");
  if (f.reminders) items.push("Appointment reminders");
  if (f.reviews) items.push("Patient reviews");
  if (f.priorityListing) items.push("Priority ranking on Find Care");
  if (f.multiDoctor) items.push("Multi-doctor clinic");
  if (f.queueAnalytics) items.push("Queue analytics");
  if (f.dedicatedSupport) items.push("Dedicated support");
  if (items.length === 0) items.push("Core booking & queue");
  return items;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SubscriptionsScreen() {
  const { practiceId, membership } = usePractice();
  const canManage =
    membership?.role === "PRACTICE_OWNER" ||
    membership?.role === "PRACTICE_ADMIN";

  const [data, setData] = useState<PracticeBilling | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checkout, setCheckout] = useState<RazorpaySubCheckout | null>(null);

  const load = useCallback(async () => {
    if (!practiceId) return;
    setError("");
    const res = await fetchPracticeBilling(practiceId);
    if (res.status === "successful" && res.data) {
      setData(res.data as PracticeBilling);
    } else {
      setError(res.message || "Could not load subscription");
      setData(null);
    }
  }, [practiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openPaidCheckout(payload: RazorpaySubCheckout) {
    setCheckout(payload);
  }

  async function onPaymentSuccess(result: RazorpaySubPaymentResult) {
    if (!practiceId) return;
    setCheckout(null);
    setBusyPlanId("confirm");
    const payment = {
      razorpayPaymentId: result.razorpay_payment_id,
      razorpaySubscriptionId: result.razorpay_subscription_id,
      razorpaySignature: result.razorpay_signature,
    };
    try {
      let lastError =
        "Razorpay succeeded but confirmation failed. Contact support.";
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await confirmPracticeBilling(practiceId, payment);
        if (res.status === "successful") {
          const ent = (
            res.data as { entitlement?: { usable?: boolean } } | undefined
          )?.entitlement;
          if (ent && ent.usable === false) {
            lastError =
              "Payment received but plan features are not active yet.";
            await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
            continue;
          }
          setMessage("Payment successful — your plan features are now active.");
          await load();
          return;
        }
        lastError = res.message || lastError;
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }

      const billing = await fetchPracticeBilling(practiceId);
      const usable = Boolean(
        (billing.data as PracticeBilling | undefined)?.entitlement?.usable,
      );
      if (usable) {
        setMessage("Payment successful — your plan features are now active.");
        await load();
        return;
      }

      Alert.alert(
        "Payment received",
        `${lastError} Do not pay again — pull to refresh, or contact support.`,
      );
      await load();
    } catch (err) {
      Alert.alert(
        "Confirm failed",
        err instanceof Error
          ? err.message
          : "Could not confirm payment. Do not pay again — refresh this screen.",
      );
    } finally {
      setBusyPlanId(null);
    }
  }

  async function choosePlan(
    planId: string,
    mode: "trial" | "activate" | "change",
  ) {
    if (!practiceId) return;
    if (!canManage) {
      setError("Only clinic owners/admins can change the subscription.");
      return;
    }
    setBusyPlanId(planId);
    setError("");
    setMessage("");

    const res = await subscribePractice(practiceId, { planId, mode });
    const payload = res.data as
      | {
          checkout?: RazorpaySubCheckout | null;
          scheduledPlan?: ClinicPlan | null;
        }
      | undefined;

    const expectsCheckout =
      mode !== "trial" &&
      Boolean(data?.razorpayConfigured) &&
      (mode === "activate" || mode === "change");

    if (res.status === "successful") {
      if (payload?.checkout?.subscriptionId && payload.checkout.keyId) {
        try {
          setMessage("Opening checkout…");
          await openPaidCheckout(payload.checkout);
        } catch (err) {
          await cancelPendingCheckout(practiceId).catch(() => null);
          setError(
            err instanceof Error
              ? err.message
              : "Payment was not completed. You can try again.",
          );
          await load();
        } finally {
          setBusyPlanId(null);
        }
        return;
      }

      if (expectsCheckout && mode === "activate") {
        setError(res.message || "Could not start checkout. Please try again.");
        setBusyPlanId(null);
        return;
      }

      if (payload?.scheduledPlan) {
        setMessage(
          `Plan change to ${payload.scheduledPlan.name} scheduled for end of billing period.`,
        );
      } else {
        setMessage(
          mode === "trial"
            ? "14-day trial started."
            : "Subscription updated.",
        );
      }
      await load();
      setBusyPlanId(null);
      return;
    }

    setError(res.message || "Could not update subscription.");
    setBusyPlanId(null);
  }

  const currentPlanId = data?.subscription?.plan?.id ?? null;
  const plans = data?.plans ?? [];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={colors.brand}
        />
      }
    >
      <PageTitle
        eyebrow={membership?.practice.name}
        title="Subscription"
        subtitle="Clinic plans power booking limits and WhatsApp. Patients never see this."
      />

      <ErrorText text={error} />
      {message ? <Text style={styles.message}>{message}</Text> : null}

      {data?.subscription ? (
        <View style={styles.card}>
          <Text style={styles.section}>Current plan</Text>
          <Text style={styles.planName}>{data.subscription.plan.name}</Text>
          <Text style={styles.meta}>
            Status: {data.subscription.status.replace(/_/g, " ")}
          </Text>
          <Text style={styles.meta}>
            Period: {formatDate(data.subscription.currentPeriodStart)} →{" "}
            {formatDate(data.subscription.currentPeriodEnd)}
          </Text>
          {data.entitlement ? (
            <Text style={styles.meta}>
              Usage: {data.entitlement.bookingsUsedThisPeriod}
              {data.entitlement.maxBookingsPerMonth != null
                ? ` / ${data.entitlement.maxBookingsPerMonth}`
                : ""}{" "}
              bookings this period
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            No active plan yet. Start a trial or activate a plan below.
          </Text>
        </View>
      )}

      {!canManage ? (
        <Text style={styles.hint}>
          View only — ask a practice owner/admin to change the plan.
        </Text>
      ) : null}

      {plans.length === 0 && !error ? (
        <EmptyState text="No plans available." />
      ) : (
        plans.map((plan) => {
          const busy = busyPlanId === plan.id;
          const isCurrent = currentPlanId === plan.id;
          const features = featureList(plan);
          return (
            <View
              key={plan.id}
              style={[styles.card, isCurrent && styles.cardCurrent]}
            >
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  {isCurrent ? (
                    <Text style={styles.currentBadge}>Current</Text>
                  ) : null}
                </View>
                <View style={styles.priceBlock}>
                  <Text style={styles.price}>
                    ₹{plan.priceMonthlyInr.toLocaleString("en-IN")}
                  </Text>
                  <Text style={styles.period}>/ month</Text>
                </View>
              </View>

              {features.map((f) => (
                <Text key={f} style={styles.feature}>
                  · {f}
                </Text>
              ))}

              {canManage && !isCurrent ? (
                <View style={styles.actions}>
                  {!data?.subscription ||
                  !["ACTIVE", "TRIALING", "PAST_DUE", "GRACE"].includes(
                    data.subscription.status,
                  ) ? (
                    <>
                      <PrimaryButton
                        label={busy ? "…" : "Start trial"}
                        onPress={() => void choosePlan(plan.id, "trial")}
                        busy={busy}
                        disabled={Boolean(busyPlanId)}
                        tone="ghost"
                      />
                      <Pressable
                        onPress={() => void choosePlan(plan.id, "activate")}
                        disabled={Boolean(busyPlanId)}
                        style={[
                          styles.payBtn,
                          Boolean(busyPlanId) && { opacity: 0.5 },
                        ]}
                      >
                        {busy ? (
                          <ActivityIndicator color={colors.white} />
                        ) : (
                          <Text style={styles.payText}>
                            {data?.razorpayConfigured
                              ? "Pay with Razorpay"
                              : "Activate"}
                          </Text>
                        )}
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      onPress={() => void choosePlan(plan.id, "change")}
                      disabled={Boolean(busyPlanId)}
                      style={[
                        styles.payBtn,
                        Boolean(busyPlanId) && { opacity: 0.5 },
                      ]}
                    >
                      {busy ? (
                        <ActivityIndicator color={colors.white} />
                      ) : (
                        <Text style={styles.payText}>Switch to this plan</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              ) : null}
            </View>
          );
        })
      )}

      <Text style={styles.footnote}>
        Billing uses the same practice subscription as the web doctor portal.
      </Text>

      <RazorpayCheckoutModal
        visible={Boolean(checkout)}
        checkout={checkout}
        prefill={
          data?.practice
            ? {
                name: data.practice.name,
                email: data.practice.email ?? undefined,
                contact: data.practice.phone ?? undefined,
              }
            : undefined
        }
        onSuccess={(result) => void onPaymentSuccess(result)}
        onClose={(reason) => {
          setCheckout(null);
          // User dismissed before paying — only then clear upgrade pending.
          // After a successful payment, onSuccess handles activation.
          if (practiceId && reason) {
            void cancelPendingCheckout(practiceId).catch(() => null);
            void load();
          }
          if (reason) setError(reason);
          setBusyPlanId(null);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.xl, paddingBottom: 48 },
  banner: {
    backgroundColor: colors.brandMist,
    padding: space.lg,
    marginBottom: space.md,
  },
  bannerText: { fontSize: 13, lineHeight: 19, color: colors.brandDeep },
  message: {
    color: colors.ok,
    fontSize: 14,
    marginBottom: space.md,
    fontWeight: "600",
  },
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paperRaised,
    padding: space.lg,
    marginBottom: space.md,
  },
  cardCurrent: { borderColor: colors.brand },
  section: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.inkFaint,
    marginBottom: 6,
  },
  planName: { fontSize: 20, fontWeight: "700", color: colors.ink },
  currentBadge: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: colors.brand,
  },
  meta: { marginTop: 4, fontSize: 13, color: colors.inkSoft },
  hint: {
    marginBottom: space.md,
    fontSize: 13,
    color: colors.inkSoft,
    lineHeight: 18,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: space.md,
  },
  priceBlock: { alignItems: "flex-end" },
  price: { fontSize: 20, fontWeight: "700", color: colors.ink },
  period: { fontSize: 12, color: colors.inkFaint },
  feature: {
    fontSize: 13,
    color: colors.inkSoft,
    marginBottom: 6,
    lineHeight: 18,
  },
  actions: { marginTop: space.md, gap: 10 },
  payBtn: {
    backgroundColor: colors.brand,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  payText: { color: colors.white, fontWeight: "700", fontSize: 15 },
  footnote: {
    marginTop: space.lg,
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkFaint,
    textAlign: "center",
  },
});
