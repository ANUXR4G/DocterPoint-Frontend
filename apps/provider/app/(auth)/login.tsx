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
  BrandMark,
  Atmosphere,
  Chip,
  ErrorText,
  Field,
  PageTitle,
  Panel,
  PrimaryButton,
} from "@/components/ui";
import { api, setRefreshToken, setToken } from "@/lib/api";
import { colors, radii, space } from "@/lib/theme";

type Portal = "doctor" | "clinic";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Atmosphere />
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
        <BrandMark />
        <View style={{ height: space.lg }} />
        <PageTitle
          eyebrow="Provider"
          title="Your day on the go"
          subtitle="Same Doctor and Clinic portals as the web — queue, calendar, patients, analytics, and plans."
        />

        <Panel style={styles.formCard}>
          <Text style={styles.portalLabel}>Sign in as</Text>
          <View style={styles.portalRow}>
            <Chip
              label="Doctor"
              active={portal === "doctor"}
              onPress={() => setPortal("doctor")}
            />
            <Chip
              label="Clinic"
              active={portal === "clinic"}
              onPress={() => setPortal("clinic")}
            />
          </View>
          <Text style={styles.portalHint}>
            {portal === "clinic"
              ? "Clinic owners and admins — full practice ops."
              : "Providers and staff — day queue and visits."}
          </Text>

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder={
              portal === "clinic"
                ? "dr.demo@glucoguide.com"
                : "dr.solo@glucoguide.com"
            }
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
            label={portal === "clinic" ? "Clinic sign in" : "Doctor sign in"}
            onPress={login}
            busy={busy}
            disabled={!email.trim() || !password}
          />
        </Panel>

        <View style={styles.registerBox}>
          <Pressable onPress={() => router.push("/(auth)/register")}>
            <Text style={styles.link}>
              New independent doctor? Create account
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push("/(auth)/register-clinic")}>
            <Text style={styles.link}>
              New clinic? Register your practice
            </Text>
          </Pressable>
        </View>

        <Text style={styles.note}>
          Demo · Clinic/owner: dr.demo@glucoguide.com · Staff:
          dr.staff@glucoguide.com · Solo: dr.solo@glucoguide.com · Password:
          Demo@12345
        </Text>
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
  formCard: {
    marginBottom: space.lg,
  },
  portalLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.inkSoft,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  portalRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  portalHint: {
    fontSize: 13,
    color: colors.inkFaint,
    marginBottom: space.md,
    lineHeight: 18,
  },
  registerBox: {
    marginTop: space.md,
    gap: 10,
    padding: space.md,
    borderRadius: radii.lg,
    backgroundColor: colors.paperRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  note: {
    marginTop: space.lg,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkFaint,
  },
  link: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.navy,
    textAlign: "center",
  },
});
