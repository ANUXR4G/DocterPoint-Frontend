import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Atmosphere,
  BrandMark,
  Chip,
  ErrorText,
  Field,
  PageTitle,
  PrimaryButton,
} from "@/components/ui";
import { api, setRefreshToken, setToken } from "@/lib/api";
import { colors, space } from "@/lib/theme";

type Plan = {
  id: string;
  name: string;
  priceMonthlyInr: number;
};

export default function ClinicRegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [clinicName, setClinicName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [telNo, setTelNo] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consultationFee, setConsultationFee] = useState("500");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await api<Plan[]>("/procto/practices/plans");
      if (res.status === "successful" && Array.isArray(res.data)) {
        const rows = res.data;
        setPlans(rows);
        const growth = rows.find((p) => p.name === "Growth");
        setPlanId(growth?.id ?? rows[0]?.id ?? "");
      }
    })();
  }, []);

  async function register() {
    setError("");
    const fee = Number(consultationFee);
    if (
      !clinicName.trim() ||
      !address.trim() ||
      !registrationNo.trim() ||
      !telNo.trim() ||
      !email.trim() ||
      !password
    ) {
      setError("Fill clinic name, address, reg no, phone, email, and password.");
      return;
    }
    if (!Number.isFinite(fee) || fee <= 0) {
      setError("Enter a consultation fee greater than 0.");
      return;
    }
    if (!planId) {
      setError("Choose a subscription plan to continue.");
      return;
    }

    setBusy(true);
    const signup = await api("/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
        role: "doctor",
        portal: "clinic",
        name: clinicName.trim(),
        phone: telNo.trim(),
      }),
    });

    if (signup.status !== "successful") {
      setBusy(false);
      setError(signup.message || "Could not create clinic account.");
      return;
    }

    const access =
      signup.access_token ||
      signup.token ||
      (signup.data as { access_token?: string } | undefined)?.access_token;
    const refresh =
      signup.refresh_token ||
      (signup.data as { refresh_token?: string } | undefined)?.refresh_token;
    if (!access) {
      setBusy(false);
      setError("No token returned from signup.");
      return;
    }
    await setToken(access);
    if (refresh) await setRefreshToken(refresh);

    const cityResolved =
      city.trim() ||
      address
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .at(-1) ||
      "India";

    const onboard = await api("/procto/practices/onboard", {
      method: "POST",
      body: JSON.stringify({
        name: clinicName.trim(),
        type: "CLINIC",
        specialty: "General",
        consultationFee: fee,
        registrationNo: registrationNo.trim(),
        phone: telNo.trim(),
        email: email.trim().toLowerCase(),
        planId,
        location: {
          name: "Main Clinic",
          address: address.trim(),
          city: cityResolved,
        },
      }),
    });
    setBusy(false);

    if (onboard.status !== "successful") {
      setError(
        onboard.message ||
          "Account created, but practice setup failed. Finish onboarding on the web clinic portal.",
      );
      return;
    }

    router.replace("/(app)/dashboard");
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Atmosphere />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 24) + space.md,
            paddingBottom: Math.max(insets.bottom, 24) + space.lg,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        <BrandMark />
        <View style={{ height: space.lg }} />
        <PageTitle
          eyebrow="Clinic"
          title="Register your practice"
          subtitle="Creates the owner account, clinic, and trial — same as web Clinic Login register."
        />

        <Field
          label="Clinic name"
          value={clinicName}
          onChangeText={setClinicName}
          placeholder="City Care Clinic"
        />
        <Field
          label="Address"
          value={address}
          onChangeText={setAddress}
          placeholder="Street, area"
        />
        <Field
          label="City"
          value={city}
          onChangeText={setCity}
          placeholder="Bangalore"
        />
        <Field
          label="Registration no."
          value={registrationNo}
          onChangeText={setRegistrationNo}
          autoCapitalize="characters"
        />
        <Field
          label="Clinic phone"
          value={telNo}
          onChangeText={setTelNo}
          keyboardType="phone-pad"
          placeholder="+91…"
        />
        <Field
          label="Owner email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <Field
          label="Consultation fee (INR)"
          value={consultationFee}
          onChangeText={setConsultationFee}
          keyboardType="number-pad"
        />

        <Text style={styles.planLabel}>Plan</Text>
        <View style={styles.planRow}>
          {plans.map((p) => (
            <Chip
              key={p.id}
              label={`${p.name} · ₹${p.priceMonthlyInr}/mo`}
              active={planId === p.id}
              onPress={() => setPlanId(p.id)}
            />
          ))}
        </View>

        <ErrorText text={error} />
        <PrimaryButton
          label="Create clinic"
          onPress={() => void register()}
          busy={busy}
        />
        <Pressable onPress={() => router.replace("/(auth)/login")}>
          <Text style={styles.link}>Already have an account? Sign in</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: {
    flexGrow: 1,
    justifyContent: "flex-start",
    paddingHorizontal: space.xl,
  },
  planLabel: {
    marginTop: space.sm,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: "700",
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  planRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginBottom: space.md,
  },
  link: {
    marginTop: space.md,
    fontSize: 14,
    fontWeight: "600",
    color: colors.navy,
    textAlign: "center",
  },
});
