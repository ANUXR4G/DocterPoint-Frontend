import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  EmptyState,
  ErrorText,
  Field,
  PageTitle,
  PrimaryButton,
} from "@/components/ui";
import { PremiumAtmosphere } from "@/components/mobile/PremiumChrome";
import { contentBottomPad } from "@/lib/dockLayout";
import { withDrTitle } from "@/lib/doctorName";
import { isClinicAdminRole, usePractice } from "@/lib/practiceContext";
import {
  createPracticeDoctor,
  fetchPracticeBilling,
  setPracticeMemberActive,
  type PracticeBilling,
} from "@/lib/procto";
import { colors, radii, shadows, space } from "@/lib/theme";

/** Clinic doctor roster — add / deactivate without opening the website. */
export default function DoctorsScreen() {
  const insets = useSafeAreaInsets();
  const { membership, refresh } = usePractice();
  const isAdmin = isClinicAdminRole(membership?.role);
  const practice = membership?.practice;

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [billing, setBilling] = useState<PracticeBilling | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [licenseNo, setLicenseNo] = useState("");

  const doctors = useMemo(
    () =>
      (practice?.members ?? []).filter(
        (m) => m.role === "DOCTOR" || m.role === "PRACTICE_OWNER",
      ),
    [practice?.members],
  );

  const loadBilling = useCallback(async () => {
    if (!practice?.id || !isAdmin) return;
    const res = await fetchPracticeBilling(practice.id);
    if (res.status === "successful" && res.data) {
      setBilling(res.data as PracticeBilling);
    }
  }, [practice?.id, isAdmin]);

  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  const ent = billing?.entitlement;
  const multiDoctor =
    ent?.features?.multiDoctor === true || ent?.features?.multiDoctor === 1;
  const canAddMore =
    Boolean(ent?.usable) && (multiDoctor || doctors.length < 1);

  async function addDoctor() {
    if (!practice) return;
    setError("");
    setMessage("");
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("Name, email, and password are required.");
      return;
    }
    if (password.trim().length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    const res = await createPracticeDoctor(practice.id, {
      name: name.trim(),
      email: email.trim(),
      password: password.trim(),
      phone: phone.trim() || undefined,
      specialty: specialty.trim() || undefined,
      licenseNo: licenseNo.trim() || undefined,
    });
    setBusy(false);
    if (res.status !== "successful") {
      setError(res.message || "Could not add doctor.");
      return;
    }
    setMessage("Doctor added. They can sign in with this email and password.");
    setName("");
    setEmail("");
    setPassword("");
    setPhone("");
    setSpecialty("");
    setLicenseNo("");
    await refresh();
    await loadBilling();
  }

  function confirmDeactivate(userId: string, label: string) {
    Alert.alert(
      "Deactivate doctor?",
      `${label} will no longer appear on the clinic roster.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: () => void deactivate(userId),
        },
      ],
    );
  }

  async function deactivate(userId: string) {
    if (!practice) return;
    setError("");
    setMessage("");
    setBusy(true);
    const res = await setPracticeMemberActive(practice.id, userId, false);
    setBusy(false);
    if (res.status !== "successful") {
      setError(res.message || "Could not deactivate doctor.");
      return;
    }
    setMessage("Doctor deactivated.");
    await refresh();
  }

  if (!isAdmin) {
    return (
      <View style={styles.root}>
        <PremiumAtmosphere />
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: contentBottomPad(insets.bottom) },
          ]}
        >
          <PageTitle
            eyebrow="Clinic"
            title="Doctors"
            subtitle="Only the clinic owner or admin can manage the doctor roster."
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <PremiumAtmosphere />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: contentBottomPad(insets.bottom) },
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await refresh();
              await loadBilling();
              setRefreshing(false);
            }}
            tintColor={colors.brand}
          />
        }
      >
        <PageTitle
          eyebrow="Clinic"
          title="Doctors"
          subtitle={`Manage doctors for ${practice?.name ?? "this clinic"}.`}
        />

        <ErrorText text={error} />
        {message ? <Text style={styles.ok}>{message}</Text> : null}

        <Text style={styles.section}>Roster</Text>
        {!doctors.length ? (
          <EmptyState text="No doctors on this clinic yet." />
        ) : (
          doctors.map((m) => {
            const label = withDrTitle(m.user.name) || m.user.email || "Doctor";
            const specialtyHint =
              m.user.doctor?.description?.split("—")[0]?.trim() || "";
            const canRemove =
              m.role === "DOCTOR" && m.userId !== membership?.userId;
            return (
              <View key={m.userId} style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{label}</Text>
                  {m.user.email ? (
                    <Text style={styles.meta}>{m.user.email}</Text>
                  ) : null}
                  {specialtyHint ? (
                    <Text style={styles.meta}>{specialtyHint}</Text>
                  ) : null}
                  <Text style={styles.role}>
                    {m.role === "PRACTICE_OWNER" ? "Owner" : "Doctor"}
                  </Text>
                </View>
                {canRemove ? (
                  <Pressable
                    onPress={() => confirmDeactivate(m.userId, label)}
                    disabled={busy}
                    hitSlop={8}
                  >
                    <Text style={styles.danger}>Deactivate</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })
        )}

        <Text style={styles.section}>Add doctor</Text>
        {!canAddMore ? (
          <Text style={styles.hint}>
            {!ent?.usable
              ? "An active subscription is required to add doctors. Open Subscription in the menu."
              : "Multi-doctor clinics need Growth or Clinic. Upgrade under Subscription."}
          </Text>
        ) : (
          <>
            <Field label="Doctor name *" value={name} onChangeText={setName} />
            <Field
              label="Login email *"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Field
              label="Login password *"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <Field
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <Field
              label="Specialty"
              value={specialty}
              onChangeText={setSpecialty}
            />
            <Field
              label="License no"
              value={licenseNo}
              onChangeText={setLicenseNo}
            />
            <PrimaryButton
              label={busy ? "Adding…" : "Add doctor"}
              onPress={() => void addDoctor()}
              busy={busy}
              disabled={busy}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    gap: space.sm,
  },
  section: {
    marginTop: space.md,
    marginBottom: space.xs,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: colors.inkSoft,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: space.lg,
    marginBottom: space.sm,
    ...shadows.soft,
  },
  name: { fontSize: 16, fontWeight: "700", color: colors.ink },
  meta: { marginTop: 2, fontSize: 13, color: colors.inkSoft },
  role: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "700",
    color: colors.brand,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  danger: { fontSize: 13, fontWeight: "700", color: colors.danger },
  hint: {
    fontSize: 13,
    color: colors.inkSoft,
    lineHeight: 18,
    marginBottom: space.md,
  },
  ok: {
    color: colors.success,
    fontSize: 14,
    fontWeight: "600",
  },
});
