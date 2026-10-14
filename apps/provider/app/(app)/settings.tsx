import { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ClinicalMastersPanel } from "@/components/ClinicalMastersPanel";
import {
  Chip,
  ErrorText,
  Field,
  PageTitle,
  PrimaryButton,
} from "@/components/ui";
import { PremiumAtmosphere } from "@/components/mobile/PremiumChrome";
import { contentBottomPad } from "@/lib/dockLayout";
import { canManagePractice, usePractice } from "@/lib/practiceContext";
import { updatePracticeProfile } from "@/lib/procto";
import { ThemeSwatches } from "@/lib/careTheme";
import { colors, radii, space } from "@/lib/theme";

const NOTICE_OPTIONS = [
  { hours: 24, label: "24 hours" },
  { hours: 48, label: "48 hours" },
  { hours: 72, label: "72 hours" },
  { hours: 168, label: "7 days" },
] as const;

/** In-app practice settings — same fields as the web Settings profile form. */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { membership, refresh } = usePractice();
  const canManage = canManagePractice(membership);
  const practice = membership?.practice;
  const loc = practice?.locations?.[0];

  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [fee, setFee] = useState("");
  const [advance, setAdvance] = useState("");
  const [noticeHours, setNoticeHours] = useState(24);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!practice) return;
    setName(practice.name ?? "");
    setSpecialty(practice.specialty ?? "");
    setRegistrationNo(practice.registrationNo ?? "");
    setAddress(loc?.address ?? "");
    setCity(loc?.city ?? "");
    setPhone(practice.phone ?? practice.whatsappBusinessNumber ?? "");
    setEmail(practice.email ?? "");
    setFee(
      practice.consultationFee != null ? String(practice.consultationFee) : "",
    );
    setAdvance(
      practice.advanceBookingAmount != null
        ? String(practice.advanceBookingAmount)
        : "",
    );
    setNoticeHours(practice.scheduleNoticeHours ?? 24);
  }, [practice, loc?.address, loc?.city]);

  async function save() {
    if (!practice || !canManage) return;
    setError("");
    setMessage("");
    if (!name.trim()) {
      setError("Clinic name is required.");
      return;
    }
    const feeNum = Number(fee);
    if (!Number.isFinite(feeNum) || feeNum <= 0) {
      setError("Appointment fee must be greater than 0.");
      return;
    }
    setBusy(true);
    const res = await updatePracticeProfile(practice.id, {
      name: name.trim(),
      specialty: specialty.trim() || undefined,
      registrationNo: registrationNo.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      consultationFee: feeNum,
      advanceBookingAmount: advance.trim() === "" ? null : Number(advance),
      scheduleNoticeHours: noticeHours,
      location: {
        id: loc?.id,
        name: loc?.name || city.trim() || "Clinic",
        address: address.trim(),
        city: city.trim(),
      },
    });
    setBusy(false);
    if (res.status !== "successful") {
      setError(res.message || "Could not save settings.");
      return;
    }
    await refresh();
    setMessage("Settings saved.");
  }

  if (!canManage) {
    return (
      <View style={styles.root}>
        <PremiumAtmosphere />
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: contentBottomPad(insets.bottom) },
          ]}
        >
          <ThemeSwatches />
          <PageTitle
            eyebrow="Account"
            title="Settings"
            subtitle="Only the clinic owner or admin can edit practice settings."
          />
          <Text style={styles.hint}>
            Open Account for your photo, or ask your clinic admin to update
            clinic details.
          </Text>
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
      >
        <ThemeSwatches />
        <PageTitle
          eyebrow="Clinic"
          title="Settings"
          subtitle="Practice profile, fees and contact — saved in the app."
        />

        <Text style={styles.section}>Clinic details</Text>
        <Field label="Clinic name *" value={name} onChangeText={setName} />
        <Field
          label="Registration no"
          value={registrationNo}
          onChangeText={setRegistrationNo}
        />
        <Field
          label="Specialty"
          value={specialty}
          onChangeText={setSpecialty}
          placeholder="e.g. Diabetology"
        />

        <Text style={styles.section}>Location & contact</Text>
        <Field
          label="Street address"
          value={address}
          onChangeText={setAddress}
        />
        <Field label="City / area" value={city} onChangeText={setCity} />
        <Field
          label="Tel"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        {practice?.whatsappBusinessNumber ? (
          <Text style={styles.hint}>
            Tel may be locked to your WhatsApp booking line (
            {practice.whatsappBusinessNumber}).
          </Text>
        ) : null}
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.section}>Fees & booking rules</Text>
        <Field
          label="Appointment fee (₹) *"
          value={fee}
          onChangeText={setFee}
          keyboardType="decimal-pad"
        />
        <Field
          label="Advance booking amount (₹, optional)"
          value={advance}
          onChangeText={setAdvance}
          keyboardType="decimal-pad"
        />
        <Text style={styles.label}>Schedule change notice</Text>
        <View style={styles.chips}>
          {NOTICE_OPTIONS.map((o) => (
            <Chip
              key={o.hours}
              label={o.label}
              active={noticeHours === o.hours}
              onPress={() => setNoticeHours(o.hours)}
            />
          ))}
        </View>

        <ErrorText text={error} />
        {message ? <Text style={styles.ok}>{message}</Text> : null}

        <PrimaryButton
          label={busy ? "Saving…" : "Save settings"}
          onPress={() => void save()}
          busy={busy}
          disabled={busy}
        />

        <Text style={styles.section}>Clinical masters</Text>
        <Text style={styles.hint}>
          Vitals bands, allergy catalog, and pain scales used on every visit.
        </Text>
        {practice?.id ? (
          <ClinicalMastersPanel
            practiceId={practice.id}
            clinicalMasters={practice.clinicalMasters}
            onSaved={() => void refresh()}
          />
        ) : null}

        <View style={styles.linksCard}>
          <Text style={styles.linksTitle}>Also in the app</Text>
          <Text style={styles.hint}>
            Hours & blocks, Subscription, and Payments are in the bottom dock —
            scroll sideways to open them. No website required.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
  },
  section: {
    marginTop: space.md,
    marginBottom: space.sm,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: colors.inkSoft,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.inkSoft,
    marginBottom: space.sm,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginBottom: space.lg,
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
    marginBottom: space.md,
  },
  linksCard: {
    marginTop: space.xl,
    padding: space.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
  },
  linksTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: 4,
  },
});
