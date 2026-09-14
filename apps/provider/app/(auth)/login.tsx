import { useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  BrandMark,
  Atmosphere,
  ErrorText,
  Field,
  PageTitle,
  PrimaryButton,
} from "@/components/ui";
import { api, setRefreshToken, setToken } from "@/lib/api";
import { colors, space } from "@/lib/theme";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function login() {
    setBusy(true);
    setError("");
    const res = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: email.trim(),
        password,
        role: "doctor",
      }),
    });
    setBusy(false);

    if (res.status !== "successful") {
      setError(res.message || "Login failed");
      return;
    }

    const role = res.role || (res.data as { role?: string } | undefined)?.role;
    if (role && role !== "doctor") {
      setError("This app is for doctors and practice staff. Patients use the patient app.");
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
    router.replace("/(app)/queue");
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Atmosphere />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <BrandMark />
        <View style={{ height: space.lg }} />
        <PageTitle
          eyebrow="Doctor"
          title="Your day on the go"
          subtitle="Queue, calendar, patients, and visit notes — same bookings as the web doctor dashboard and WhatsApp."
        />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="dr.demo@glucoguide.com"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
        />
        <ErrorText text={error} />
        <PrimaryButton
          label="Sign in"
          onPress={login}
          busy={busy}
          disabled={!email.trim() || !password}
        />
        <Text style={styles.note}>
          Demo: dr.demo@glucoguide.com / Demo@12345 · Full schedule tools also
          on the web portal.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: space.xl,
    paddingBottom: 48,
  },
  note: {
    marginTop: space.lg,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkFaint,
  },
});
