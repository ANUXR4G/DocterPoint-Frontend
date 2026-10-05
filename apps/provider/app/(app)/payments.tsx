import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Chip,
  EmptyState,
  ErrorText,
  Field,
  HintText,
  Loading,
  PageTitle,
  Panel,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui";
import { DashMetric, PremiumAtmosphere } from "@/components/mobile/PremiumChrome";
import { contentBottomPad } from "@/lib/dockLayout";
import {
  usePracticeLive,
  usePracticeLiveRefresh,
} from "@/lib/PracticeLiveContext";
import { usePractice } from "@/lib/practiceContext";
import {
  cancelPaymentRequest,
  createPaymentRequest,
  fetchPayments,
  refreshPaymentRequest,
  resendPaymentRequest,
  type PaymentRequestRow,
  type PaymentRequestStatus,
  type PaymentsListResponse,
} from "@/lib/procto";
import type { PracticePatient } from "@/lib/types";
import { colors, radii, space } from "@/lib/theme";

type StatusFilter = "ALL" | PaymentRequestStatus;

const STATUS_TONE: Record<PaymentRequestStatus, { fg: string; bg: string; label: string }> = {
  PAID: { fg: "#047857", bg: "#d1fae5", label: "Paid" },
  PENDING: { fg: "#b45309", bg: "#fef3c7", label: "Awaiting payment" },
  EXPIRED: { fg: "#475569", bg: "#e2e8f0", label: "Link expired" },
  CANCELLED: { fg: "#475569", bg: "#e2e8f0", label: "Cancelled" },
};

const KIND_LABEL: Record<PaymentRequestRow["kind"], string> = {
  ADVANCE: "Advance booking",
  CONSULTATION: "Consultation fee",
  CUSTOM: "Custom request",
};

function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

function shortDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PaymentsScreen() {
  const insets = useSafeAreaInsets();
  const { practiceId, membership } = usePractice();
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [data, setData] = useState<PaymentsListResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!practiceId) return;
      if (!opts?.silent) {
        setLoading(true);
        setError("");
      }
      const res = await fetchPayments(practiceId, {
        status: filter === "ALL" ? undefined : filter,
      });
      if (!opts?.silent) setLoading(false);
      if (res.status !== "successful" || !res.data) {
        if (!opts?.silent) setError(res.message || "Could not load payments.");
        return;
      }
      setData(res.data);
    },
    [practiceId, filter],
  );

  useEffect(() => {
    void load();
  }, [load]);

  usePracticeLiveRefresh(() => void load({ silent: true }), {
    bookings: false,
    ops: true,
  });

  function replaceRow(row: PaymentRequestRow) {
    setData((prev) =>
      prev
        ? { ...prev, items: prev.items.map((r) => (r.id === row.id ? row : r)) }
        : prev,
    );
  }

  async function runAction(
    row: PaymentRequestRow,
    fn: (id: string) => ReturnType<typeof refreshPaymentRequest>,
  ) {
    setBusyId(row.id);
    const res = await fn(row.id);
    setBusyId(null);
    if (res.status !== "successful" || !res.data) {
      Alert.alert("Payments", res.message || "Action failed.");
      return;
    }
    replaceRow(res.data);
    void load({ silent: true });
  }

  function confirmCancel(row: PaymentRequestRow) {
    Alert.alert(
      "Cancel payment link?",
      `${rupees(row.amount)} for ${row.patientName || row.patientPhone}. The patient will no longer be able to pay with this link.`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Cancel link",
          style: "destructive",
          onPress: () => void runAction(row, cancelPaymentRequest),
        },
      ],
    );
  }

  const summary = data?.summary;
  const enabled = data?.paymentsEnabled !== false;

  return (
    <View style={styles.root}>
      <PremiumAtmosphere />
      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: space.lg,
            paddingBottom: contentBottomPad(insets.bottom),
          },
        ]}
      >
        <PageTitle
          eyebrow={membership?.practice.name}
          title="Payments"
          subtitle="Razorpay links sent on WhatsApp — advance booking, consultation fee and custom requests."
        />

        {summary ? (
          <View style={styles.metrics}>
            <DashMetric label="Collected" value={rupees(summary.collected)} tone="teal" />
            <DashMetric label="Pending" value={rupees(summary.pending)} tone="blue" />
          </View>
        ) : null}

        {!enabled ? (
          <HintText text="Online payments are not configured for this clinic yet (Razorpay keys missing)." />
        ) : formOpen ? (
          <RequestForm
            practiceId={practiceId}
            onClose={() => setFormOpen(false)}
            onSent={(row) => {
              setFormOpen(false);
              setData((prev) =>
                prev ? { ...prev, items: [row, ...prev.items] } : prev,
              );
              void load({ silent: true });
              Alert.alert(
                "Payment request",
                row.waDelivery === "FAILED"
                  ? `Link created but WhatsApp delivery failed${row.waError ? `: ${row.waError}` : ""}. Use Share link to send it another way.`
                  : `${rupees(row.amount)} request sent to ${row.patientName || row.patientPhone} on WhatsApp.`,
              );
            }}
          />
        ) : (
          <PrimaryButton label="Request payment" onPress={() => setFormOpen(true)} />
        )}

        <View style={styles.chips}>
          {(
            [
              ["ALL", "All"],
              ["PENDING", "Pending"],
              ["PAID", "Paid"],
              ["EXPIRED", "Expired"],
              ["CANCELLED", "Cancelled"],
            ] as const
          ).map(([id, label]) => (
            <Chip
              key={id}
              label={label}
              active={filter === id}
              onPress={() => setFilter(id)}
            />
          ))}
        </View>

        <ErrorText text={error} />
        {error ? <PrimaryButton label="Retry" onPress={() => void load()} /> : null}
        {loading ? <Loading /> : null}

        {!loading && !error && data ? (
          data.items.length === 0 ? (
            <EmptyState text="No payment requests yet." />
          ) : (
            data.items.map((row) => (
              <PaymentCard
                key={row.id}
                row={row}
                busy={busyId === row.id}
                onRefresh={() => void runAction(row, refreshPaymentRequest)}
                onResend={() => void runAction(row, resendPaymentRequest)}
                onCancel={() => confirmCancel(row)}
              />
            ))
          )
        ) : null}
      </ScrollView>
    </View>
  );
}

function PaymentCard({
  row,
  busy,
  onRefresh,
  onResend,
  onCancel,
}: {
  row: PaymentRequestRow;
  busy: boolean;
  onRefresh: () => void;
  onResend: () => void;
  onCancel: () => void;
}) {
  const tone = STATUS_TONE[row.status];
  const pending = row.status === "PENDING";
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.patient} numberOfLines={1}>
            {row.patientName || row.patientPhone}
          </Text>
          <Text style={styles.meta} numberOfLines={2}>
            {KIND_LABEL[row.kind]}
            {row.purpose ? ` · ${row.purpose}` : ""}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.amount}>{rupees(row.amount)}</Text>
          <View style={[styles.badge, { backgroundColor: tone.bg }]}>
            <Text style={[styles.badgeText, { color: tone.fg }]}>{tone.label}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.meta}>
        Sent {shortDate(row.createdAt)}
        {row.providerName ? ` · Dr ${row.providerName.replace(/^Dr\.?\s*/i, "")}` : ""}
        {row.waDelivery === "FAILED" ? " · WhatsApp not delivered" : ""}
      </Text>
      {row.status === "PAID" ? (
        <Text style={styles.meta}>
          Paid {shortDate(row.paidAt)}
          {row.paymentId ? ` · ${row.paymentId}` : ""}
          {row.receiptDelivery === "SENT"
            ? " · Confirmation sent"
            : row.receiptDelivery === "FAILED"
              ? " · Confirmation not delivered"
              : ""}
        </Text>
      ) : pending && row.expiresAt ? (
        <Text style={styles.meta}>Link valid till {shortDate(row.expiresAt)}</Text>
      ) : null}
      {pending ? (
        <View style={styles.actions}>
          <ActionLink label="Refresh" onPress={onRefresh} disabled={busy} />
          {row.linkUrl ? (
            <ActionLink
              label="Share link"
              disabled={busy}
              onPress={() =>
                void Share.share({
                  message: `Pay ${rupees(row.amount)}: ${row.linkUrl}`,
                })
              }
            />
          ) : null}
          <ActionLink label="Resend" onPress={onResend} disabled={busy} />
          <ActionLink label="Cancel" onPress={onCancel} disabled={busy} danger />
        </View>
      ) : null}
    </View>
  );
}

function ActionLink({
  label,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8}>
      <Text
        style={[
          styles.action,
          danger && { color: colors.danger },
          disabled && { opacity: 0.4 },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function RequestForm({
  practiceId,
  onClose,
  onSent,
}: {
  practiceId: string | null;
  onClose: () => void;
  onSent: (row: PaymentRequestRow) => void;
}) {
  const { patients } = usePracticeLive();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<PracticePatient | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || picked) return [];
    return patients
      .filter(
        (p) =>
          (p.name || "").toLowerCase().includes(q) ||
          p.phone.includes(q) ||
          (p.mrn || "").toLowerCase().includes(q),
      )
      .slice(0, 5);
  }, [patients, query, picked]);

  async function submit() {
    if (!practiceId) return;
    setError("");
    const patientName = picked?.name || name.trim();
    const patientPhone = picked?.phone || phone.trim();
    if (!patientName || !patientPhone) {
      setError("Pick a patient or enter their name and WhatsApp number.");
      return;
    }
    if (!amount.trim()) {
      setError("Enter the amount in ₹.");
      return;
    }
    if (!purpose.trim()) {
      setError("Say what the payment is for.");
      return;
    }
    setBusy(true);
    const res = await createPaymentRequest({
      practiceId,
      patientId: picked?.patientId ?? null,
      patientName,
      patientPhone,
      amount: amount.trim(),
      purpose: purpose.trim(),
      expiresInDays: days,
    });
    setBusy(false);
    if (res.status !== "successful" || !res.data) {
      setError(res.message || "Could not send the payment request.");
      return;
    }
    onSent(res.data);
  }

  return (
    <Panel style={{ marginBottom: space.lg }}>
      <Text style={styles.formTitle}>Request payment on WhatsApp</Text>
      {picked ? (
        <View style={styles.picked}>
          <Text style={styles.patient} numberOfLines={1}>
            {picked.name || picked.phone}
          </Text>
          <Text style={styles.meta}>{picked.phone}</Text>
          <Pressable onPress={() => setPicked(null)} hitSlop={8}>
            <Text style={styles.action}>Change</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Field
            label="Find patient (name, phone or MRN)"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
          {matches.map((p) => (
            <Pressable
              key={`${p.phone}-${p.patientId ?? p.name}`}
              style={styles.match}
              onPress={() => {
                setPicked(p);
                setQuery("");
              }}
            >
              <Text style={styles.patient}>{p.name || "Unnamed"}</Text>
              <Text style={styles.meta}>
                {p.phone}
                {p.mrn ? ` · ${p.mrn}` : ""}
              </Text>
            </Pressable>
          ))}
          <Text style={styles.or}>or a new patient</Text>
          <Field label="Patient name" value={name} onChangeText={setName} />
          <Field
            label="WhatsApp number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </>
      )}
      <Field
        label="Amount (₹)"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
      />
      <Field
        label="For"
        value={purpose}
        onChangeText={setPurpose}
        placeholder="e.g. Lab tests, Procedure advance"
        maxLength={250}
      />
      <Text style={styles.label}>Link valid for</Text>
      <View style={styles.chips}>
        {[1, 3, 7, 30].map((d) => (
          <Chip
            key={d}
            label={d === 1 ? "1 day" : `${d} days`}
            active={days === d}
            onPress={() => setDays(d)}
          />
        ))}
      </View>
      <ErrorText text={error} />
      <PrimaryButton label="Send on WhatsApp" onPress={() => void submit()} busy={busy} />
      <View style={{ height: space.sm }} />
      <SecondaryButton label="Close" onPress={onClose} disabled={busy} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  content: { paddingHorizontal: space.xl },
  metrics: { flexDirection: "row", gap: space.md, marginBottom: space.lg },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginVertical: space.md,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: "#fff",
    borderRadius: radii.xl,
    padding: space.lg,
    marginBottom: space.md,
    gap: 4,
  },
  cardHead: { flexDirection: "row", gap: space.md, marginBottom: 4 },
  patient: { fontSize: 15, fontWeight: "700", color: colors.ink },
  amount: { fontSize: 16, fontWeight: "800", color: colors.ink },
  meta: { fontSize: 12, color: colors.inkSoft },
  badge: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.lg, marginTop: space.sm },
  action: { fontSize: 13, fontWeight: "700", color: colors.navy },
  formTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: space.md,
  },
  picked: {
    borderRadius: radii.lg,
    backgroundColor: colors.brandMist,
    padding: space.md,
    marginBottom: space.lg,
    gap: 2,
  },
  match: {
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  or: {
    marginVertical: space.md,
    fontSize: 12,
    color: colors.inkSoft,
    textAlign: "center",
  },
  label: { fontSize: 13, fontWeight: "600", color: colors.inkSoft },
});
