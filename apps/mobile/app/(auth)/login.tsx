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
import { CountryPhoneField } from "@/components/CountryPhoneField";
import { ErrorText, Field } from "@/components/ui";
import { useCareTheme } from "@/lib/careTheme";
import { api, setRefreshToken, setToken } from "@/lib/api";
import {
  composeLoginPhone,
  DEFAULT_COUNTRY,
  nationalDigitsReady,
  type CountryDial,
} from "@/lib/countries";
import { registerForPush } from "@/lib/push";
import { friendlyWhatsAppError } from "@/lib/whatsappErrors";
import { space } from "@/lib/theme";

type Step = "phone" | "otp";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useCareTheme();
  const [step, setStep] = useState<Step>("phone");
  const [country, setCountry] = useState<CountryDial>(DEFAULT_COUNTRY);
  const [national, setNational] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);

  const fullPhone = composeLoginPhone(country, national);

  async function afterAuth(access?: string, refresh?: string) {
    if (access) await setToken(access);
    if (refresh) await setRefreshToken(refresh);
    router.replace("/(app)/home");
    void registerForPush().catch(() => {
      // optional on simulator / Expo Go
    });
  }

  function extractTokens(res: Record<string, unknown>) {
    const data = res.data as
      | { access_token?: string; refresh_token?: string; token?: string }
      | undefined;
    const access =
      (res.access_token as string | undefined) ||
      (res.token as string | undefined) ||
      data?.access_token ||
      data?.token;
    const refresh =
      (res.refresh_token as string | undefined) || data?.refresh_token;
    return { access, refresh };
  }

  async function requestOtp() {
    setBusy(true);
    setError("");
    setHint("");
    try {
      const res = await api<{
        phone?: string;
        debugOtp?: string;
        from?: string;
        expiresInSec?: number;
      }>("/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({ phone: fullPhone }),
      });
      if (res.status !== "successful") {
        setError(friendlyWhatsAppError(res.message));
        return;
      }
      setHint("Code sent on WhatsApp");
      setStep("otp");
    } catch (err) {
      setError(
        friendlyWhatsAppError(
          err instanceof Error ? err.message : "Could not send OTP",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setBusy(true);
    setError("");
    try {
      const res = await api("/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({
          phone: fullPhone,
          code: otp.trim(),
        }),
      });
      if (res.status !== "successful") {
        setError(res.message || "Invalid code");
        return;
      }
      const role = res.role || (res.data as { role?: string } | undefined)?.role;
      if (role && role !== "user") {
        setError("This app is for patients only.");
        return;
      }
      const { access, refresh } = extractTokens(res as Record<string, unknown>);
      if (!access) {
        setError("Login succeeded but no token was returned.");
        return;
      }
      await afterAuth(access, refresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  const canContinue =
    step === "phone" ? nationalDigitsReady(national) : otp.replace(/\D/g, "").length >= 6;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.paper }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 28,
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
      >
        <Text style={[styles.title, { color: theme.ink }]}>Sign in</Text>
        <Text style={[styles.sub, { color: theme.muted }]}>
          {step === "phone" ? "Enter your mobile number." : "Enter the code from WhatsApp."}
        </Text>

        <View style={[styles.card, { backgroundColor: theme.card }]}>
          {step === "phone" ? (
            <CountryPhoneField
              country={country}
              onCountryChange={setCountry}
              national={national}
              onNationalChange={setNational}
              placeholder={country.dial === "91" ? "10-digit mobile" : "Mobile number"}
            />
          ) : (
            <>
              <Text style={[styles.hint, { color: theme.muted }]}>
                {hint || "Enter the 6-digit code"}
              </Text>
              <Text style={[styles.toNumber, { color: theme.ink }]}>
                +{country.dial} {national.replace(/\D/g, "")}
              </Text>
              <Field
                label="OTP"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                placeholder="6-digit code"
                style={styles.otp}
              />
              <View style={styles.otpLinks}>
                <Pressable
                  onPress={() => {
                    setStep("phone");
                    setOtp("");
                    setError("");
                  }}
                >
                  <Text style={[styles.secondaryText, { color: theme.muted }]}>Change number</Text>
                </Pressable>
                <Pressable onPress={requestOtp}>
                  <Text style={[styles.secondaryText, { color: theme.ink }]}>Resend code</Text>
                </Pressable>
              </View>
            </>
          )}
          <ErrorText text={error} />
        </View>

        <View style={styles.spacer} />

        <Pressable onPress={() => router.push("/(auth)/register")} style={styles.registerLink}>
          <Text style={[styles.registerText, { color: theme.muted }]}>
            New here? <Text style={{ color: theme.ink, fontWeight: "700" }}>Create account</Text>
          </Text>
        </Pressable>
        <Pressable
          onPress={step === "phone" ? requestOtp : verifyOtp}
          disabled={busy || !canContinue}
          style={[
            styles.button,
            { backgroundColor: theme.ink, opacity: busy || !canContinue ? 0.45 : 1 },
          ]}
        >
          <Text style={styles.buttonText}>
            {busy ? (step === "phone" ? "Sending…" : "Checking…") : "Continue"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 18,
  },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.6, textAlign: "center" },
  sub: { marginTop: 6, marginBottom: 24, fontSize: 15, textAlign: "center" },
  card: {
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  spacer: { flex: 1, minHeight: 24 },
  otp: {
    height: 52,
    paddingVertical: 0,
    textAlignVertical: "center",
  },
  otpLinks: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  button: {
    height: 54,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  hint: {
    fontSize: 13,
    marginBottom: space.sm,
    lineHeight: 19,
    textAlign: "center",
  },
  toNumber: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: space.md,
    textAlign: "center",
  },
  registerLink: { alignItems: "center" },
  registerText: { fontSize: 14, textAlign: "center" },
  secondaryText: { fontSize: 13, fontWeight: "600" },
});
