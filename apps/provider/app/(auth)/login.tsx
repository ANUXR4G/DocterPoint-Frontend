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
import { ErrorText, Field } from "@/components/ui";
import { api, setRefreshToken, setToken } from "@/lib/api";
import { useCareTheme } from "@/lib/careTheme";
import { space } from "@/lib/theme";

type Portal = "doctor" | "clinic";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useCareTheme();
  const [portal, setPortal] = useState<Portal>("doctor");
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
        portal,
      }),
    });
    setBusy(false);

    if (res.status !== "successful") {
      setError(res.message || "Login failed");
      return;
    }

    const role = res.role || (res.data as { role?: string } | undefined)?.role;
    if (role && role !== "doctor") {
      setError(
        "This app is for doctors and clinic staff. Patients use the patient app.",
      );
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

  // Explicit padding — nested Stack + SafeAreaView alone still let centered
  // content sit under the status bar on Expo Go.
  const topPad = Math.max(insets.top, 24) + space.md;
  const bottomPad = Math.max(insets.bottom, 24) + space.lg;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.paper }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad, paddingBottom: bottomPad },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        <Text style={[styles.title, { color: theme.ink }]}>Sign in</Text>
        <Text style={[styles.sub, { color: theme.muted }]}>Doctor or clinic</Text>

        <View style={[styles.formCard, { backgroundColor: theme.card }]}>
          <View style={styles.portalRow}>
            {(["doctor", "clinic"] as const).map((item) => {
              const on = portal === item;
              return (
                <Pressable
                  key={item}
                  onPress={() => setPortal(item)}
                  style={[styles.chip, { backgroundColor: on ? theme.ink : theme.paper }]}
                >
                  <Text style={{ color: on ? "#fff" : theme.ink, fontWeight: "600" }}>
                    {item === "doctor" ? "Doctor" : "Clinic"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="Email"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Password"
          />
          <ErrorText text={error} />
          <Pressable
            onPress={login}
            disabled={busy || !email.trim() || !password}
            style={[
              styles.button,
              {
                backgroundColor: theme.ink,
                opacity: busy || !email.trim() || !password ? 0.45 : 1,
              },
            ]}
          >
            <Text style={styles.buttonText}>{busy ? "Signing in…" : "Continue"}</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => router.push("/(auth)/register")} style={styles.linkWrap}>
          <Text style={[styles.link, { color: theme.ink }]}>Create a doctor account</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/(auth)/register-clinic")} style={styles.linkWrap}>
          <Text style={[styles.link, { color: theme.ink }]}>Register a clinic</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "flex-start",
    paddingHorizontal: space.xl,
  },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.6 },
  sub: { marginTop: 6, marginBottom: 20, fontSize: 15 },
  formCard: {
    borderRadius: 22,
    padding: space.xl,
    marginBottom: space.lg,
  },
  portalRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: space.lg,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  button: {
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  linkWrap: { marginTop: space.md, alignItems: "center" },
  link: { fontSize: 14, fontWeight: "600" },
});
