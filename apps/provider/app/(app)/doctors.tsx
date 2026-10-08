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
  Chip,
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
  createPracticeStaff,
  createSpecialty,
  fetchPracticeBilling,
  listSpecialties,
  openPracticeSchedule,
  setPracticeMemberActive,
  type PracticeBilling,
  type SpecialtyOption,
} from "@/lib/procto";
import { colors, radii, shadows, space } from "@/lib/theme";

const ROLE_LABEL: Record<string, string> = {
  PRACTICE_OWNER: "Owner",
  PRACTICE_ADMIN: "Admin",
  DOCTOR: "Doctor",
  RECEPTIONIST: "Receptionist",
  NURSE: "Nurse",
};

const STAFF_ROLES = [
  { value: "PRACTICE_ADMIN" as const, label: "Admin" },
  { value: "RECEPTIONIST" as const, label: "Reception" },
  { value: "NURSE" as const, label: "Nurse" },
];

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
  const [specialtyIds, setSpecialtyIds] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<SpecialtyOption[]>([]);
  const [specQuery, setSpecQuery] = useState("");
  const [licenseNo, setLicenseNo] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffPhone, setStaffPhone] = useState("");
  const [staffRole, setStaffRole] = useState<(typeof STAFF_ROLES)[number]["value"]>(
    "RECEPTIONIST",
  );

  const doctors = useMemo(
    () =>
      (practice?.members ?? []).filter(
        (m) => m.role === "DOCTOR" || m.role === "PRACTICE_OWNER",
      ),
    [practice?.members],
  );
  const staff = useMemo(
    () =>
      (practice?.members ?? []).filter(
        (m) =>
          m.role === "PRACTICE_ADMIN" ||
          m.role === "RECEPTIONIST" ||
          m.role === "NURSE",
      ),
    [practice?.members],
  );
  const visibleSpecs = catalog.filter((s) =>
    s.name.toLowerCase().includes(specQuery.trim().toLowerCase()),
  );
  const specExact = catalog.some(
    (s) => s.name.toLowerCase() === specQuery.trim().toLowerCase(),
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

  useEffect(() => {
    let cancelled = false;
    void listSpecialties().then((res) => {
      if (cancelled || res.status !== "successful" || !Array.isArray(res.data)) return;
      setCatalog(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!specialtyIds.length) {
      setError("Select a specialty from the list.");
      return;
    }
    setBusy(true);
    const res = await createPracticeDoctor(practice.id, {
      name: name.trim(),
      email: email.trim(),
      password: password.trim(),
      phone: phone.trim() || undefined,
      specialtyIds,
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
    setSpecialtyIds([]);
    setSpecQuery("");
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

  async function openSchedule(userId: string) {
    if (!practice) return;
    setError("");
    setMessage("");
    setBusy(true);
    const res = await openPracticeSchedule(practice.id, userId);
    setBusy(false);
    if (res.status !== "successful") {
      setError(res.message || "Could not open the schedule.");
      return;
    }
    setMessage(res.message || "Schedule is open. Edit it under Hours.");
    await refresh();
  }

  async function addNamedSpecialty() {
    const name = specQuery.trim();
    if (name.length < 2) return;
    setBusy(true);
    setError("");
    const res = await createSpecialty(name);
    setBusy(false);
    const row = res.data;
    if (res.status !== "successful" || !row?.id) {
      setError(res.message || "Could not add that specialty.");
      return;
    }
    setCatalog((prev) =>
      prev.some((p) => p.id === row.id)
        ? prev
        : [...prev, row].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setSpecialtyIds((ids) => (ids.includes(row.id) ? ids : [...ids, row.id]));
    setSpecQuery("");
  }

  async function addStaff() {
    if (!practice) return;
    setError("");
    setMessage("");
    if (!staffName.trim() || !staffEmail.trim() || staffPassword.trim().length < 6) {
      setError("Name, email, and a password of at least 6 characters are required.");
      return;
    }
    setBusy(true);
    const res = await createPracticeStaff(practice.id, {
      name: staffName.trim(),
      email: staffEmail.trim(),
      password: staffPassword.trim(),
      phone: staffPhone.trim() || undefined,
      role: staffRole,
    });
    setBusy(false);
    if (res.status !== "successful") {
      setError(res.message || "Could not add that person.");
      return;
    }
    const label = STAFF_ROLES.find((r) => r.value === staffRole)?.label ?? "Staff";
    setMessage(
      `${staffName.trim()} added as ${label}. Admin uses Clinic Login. Reception and nurse use Doctor Login.`,
    );
    setStaffName("");
    setStaffEmail("");
    setStaffPassword("");
    setStaffPhone("");
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
                    {ROLE_LABEL[m.role] ?? m.role}
                  </Text>
                </View>
                {m.role === "PRACTICE_OWNER" ? (
                  <Pressable
                    onPress={() => void openSchedule(m.userId)}
                    disabled={busy}
                    hitSlop={8}
                  >
                    <Text style={styles.link}>Open schedule</Text>
                  </Pressable>
                ) : null}
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
              label="Search specialties *"
              value={specQuery}
              onChangeText={setSpecQuery}
              autoCapitalize="words"
            />
            <View style={styles.chips}>
              {visibleSpecs.map((s) => (
                <Chip
                  key={s.id}
                  label={s.name}
                  active={specialtyIds.includes(s.id)}
                  onPress={() =>
                    setSpecialtyIds((ids) =>
                      ids.includes(s.id) ? ids.filter((id) => id !== s.id) : [...ids, s.id],
                    )
                  }
                />
              ))}
            </View>
            {specQuery.trim().length > 1 && !specExact ? (
              <Pressable onPress={() => void addNamedSpecialty()} disabled={busy}>
                <Text style={styles.link}>Add “{specQuery.trim()}”</Text>
              </Pressable>
            ) : null}
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

        {staff.length ? (
          <>
            <Text style={styles.section}>Clinic team</Text>
            {staff.map((m) => (
              <View key={m.userId} style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{m.user.name || "Unnamed"}</Text>
                  {m.user.email ? <Text style={styles.meta}>{m.user.email}</Text> : null}
                  <Text style={styles.role}>{ROLE_LABEL[m.role] ?? m.role}</Text>
                </View>
              </View>
            ))}
          </>
        ) : null}

        <Text style={styles.section}>Add clinic staff</Text>
        <Text style={styles.hint}>
          Admin uses Clinic Login. Receptionist and nurse use Doctor Login. They are not bookable doctors.
        </Text>
        <Field label="Name *" value={staffName} onChangeText={setStaffName} />
        <View style={styles.chips}>
          {STAFF_ROLES.map((r) => (
            <Chip
              key={r.value}
              label={r.label}
              active={staffRole === r.value}
              onPress={() => setStaffRole(r.value)}
            />
          ))}
        </View>
        <Field
          label="Login email *"
          value={staffEmail}
          onChangeText={setStaffEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field
          label="Login password *"
          value={staffPassword}
          onChangeText={setStaffPassword}
          secureTextEntry
        />
        <Field
          label="Phone"
          value={staffPhone}
          onChangeText={setStaffPhone}
          keyboardType="phone-pad"
        />
        <PrimaryButton
          label={busy ? "Saving…" : "Add staff"}
          onPress={() => void addStaff()}
          busy={busy}
          disabled={busy}
          tone="ghost"
        />
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
  link: { fontSize: 13, fontWeight: "700", color: colors.brand },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: space.md,
  },
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
