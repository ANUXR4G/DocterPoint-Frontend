import { useRouter } from "expo-router";
import { useState } from "react";
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
  ErrorText,
  Field,
  PageTitle,
  PrimaryButton,
} from "@/components/ui";
import { api, setRefreshToken, setToken } from "@/lib/api";
import { colors, space } from "@/lib/theme";

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [licenseNo, setLicenseNo] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [consultationFee, setConsultationFee] = useState("500");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function register() {
    setBusy(true);
    setError("");
    const res = await api("/auth/register/doctor", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        licenseNo: licenseNo.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: phone.trim() || undefined,
        consultationFee: Number(consultationFee) || 500,
        bookingType: "TIME",
        workingDays: [1, 2, 3, 4, 5],
        startTime: "09:00",
        endTime: "17:00",
        breakStartTime: "13:00",
        breakEndTime: "14:00",
        slotDurationMins: 15,
        patientsPerSlot: 1,
        appointmentValidityDays: 7,
      }),
    });
    setBusy(false);

    if (res.status !== "successful") {
      setError(res.message || "Registration failed");
      return;
    }

    const access =
      res.access_token ||
      res.token ||
      (res.data as { access_token?: string } | undefined)?.access_token;
    const refresh =
      res.refresh_token ||
      (res.data as { refresh_token?: string } | undefined)?.refresh_token;
    if (!access) {
      setError("No token returned from API.");
      return;
    }
    await setToken(access);
    if (refresh) await setRefreshToken(refresh);
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
          eyebrow="Doctor"
          title="Create your practice"
          subtitle="Same independent-doctor signup as web Doctor Login. Clinic owners use Register clinic instead."
        />
        <Field
          label="Dr name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          placeholder="Dr. Priya Nair"
        />
        <Field
          label="License number"
          value={licenseNo}
          onChangeText={setLicenseNo}
          autoCapitalize="characters"
          placeholder="MCI / NMC number"
        />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="you@clinic.com"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
        />
        <Field
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="10-digit mobile"
        />
        <Field
          label="Consultation fee (INR)"
          value={consultationFee}
          onChangeText={setConsultationFee}
          keyboardType="numeric"
        />
        <ErrorText text={error} />
        <PrimaryButton
          label="Create account"
          onPress={register}
          busy={busy}
          disabled={!name.trim() || !licenseNo.trim() || !email.trim() || !password}
        />
        <Pressable onPress={() => router.replace("/(auth)/login")}>
          <Text style={styles.link}>Already registered? Sign in</Text>
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
  link: {
    marginTop: space.md,
    fontSize: 14,
    fontWeight: "600",
    color: colors.navy,
    textAlign: "center",
  },
});
