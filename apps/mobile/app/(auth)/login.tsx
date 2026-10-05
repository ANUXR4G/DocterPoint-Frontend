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
import {
  Atmosphere,
  BrandMark,
  ErrorText,
  Field,
  PageTitle,
  PrimaryButton,
} from "@/components/ui";
import { AnimatedView } from "@/lib/motion";
import { api, setRefreshToken, setToken } from "@/lib/api";
import {
  composeLoginPhone,
  DEFAULT_COUNTRY,
  nationalDigitsReady,
  type CountryDial,
} from "@/lib/countries";
import { registerForPush } from "@/lib/push";
import { colors, shadows, radii, space } from "@/lib/theme";

type Step = "phone" | "otp";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("phone");
  const [country, setCountry] = useState<CountryDial>(DEFAULT_COUNTRY);
  const [national, setNational] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [debugOtp, setDebugOtp] = useState("");

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
    setDebugOtp("");
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
        setError(res.message || "Could not send OTP");
        return;
      }
      const from = res.data?.from || "9990052082";
      setHint(`Code sent on WhatsApp from +91 ${from}`);
      if (res.data?.debugOtp) setDebugOtp(res.data.debugOtp);
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send OTP");
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

  const topPad = Math.max(insets.top, 20) + space.md;
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
          {
            paddingTop: topPad,
            paddingBottom: bottomPad,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
      >
        <AnimatedView from="down" delay={40}>
          <BrandMark size="lg" />
        </AnimatedView>

        <View style={{ height: space.xl }} />

        <PageTitle
          eyebrow="Patient care"
          title="Sign in with mobile"
          subtitle="Choose your country, enter your mobile number, then verify with WhatsApp OTP from +91 99900 52082."
        />

        <AnimatedView from="up" delay={120} style={styles.card}>
          {step === "phone" ? (
            <>
              <CountryPhoneField
                country={country}
                onCountryChange={setCountry}
                national={national}
                onNationalChange={setNational}
                placeholder={
                  country.dial === "91" ? "10-digit mobile" : "Mobile number"
                }
              />
              <ErrorText text={error} />
              <PrimaryButton
                label="Send WhatsApp OTP"
                onPress={requestOtp}
                busy={busy}
                disabled={!nationalDigitsReady(national)}
              />
            </>
          ) : (
            <>
              <Text style={styles.hint}>
                {hint || "Enter the 6-digit code from WhatsApp"}
              </Text>
              <Text style={styles.toNumber}>
                To +{country.dial} {national.replace(/\D/g, "")}
              </Text>
              {debugOtp ? (
                <Text style={styles.debug}>Dev code: {debugOtp}</Text>
              ) : null}
              <Field
                label="OTP"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                placeholder="6-digit code"
              />
              <ErrorText text={error} />
              <PrimaryButton
                label="Verify & continue"
                onPress={verifyOtp}
                busy={busy}
                disabled={otp.replace(/\D/g, "").length < 6}
              />
              <Pressable
                onPress={() => {
                  setStep("phone");
                  setOtp("");
                  setError("");
                }}
                style={styles.secondaryLink}
              >
                <Text style={styles.secondaryText}>Change number</Text>
              </Pressable>
              <Pressable onPress={requestOtp} style={styles.secondaryLink}>
                <Text style={styles.secondaryText}>Resend code</Text>
              </Pressable>
            </>
          )}
        </AnimatedView>

        <AnimatedView from="fade" delay={220}>
          <Pressable
            onPress={() => router.push("/(auth)/register")}
            style={styles.registerLink}
          >
            <Text style={styles.registerText}>
              New here?{" "}
              <Text style={styles.registerAction}>
                Create account with WhatsApp OTP
              </Text>
            </Text>
          </Pressable>
          <Text style={styles.note}>
            Patient login is mobile number + WhatsApp OTP only.
          </Text>
        </AnimatedView>
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
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xxl,
    padding: space.xl,
    ...shadows.card,
  },
  hint: {
    fontSize: 13,
    color: colors.inkSoft,
    marginBottom: space.sm,
    lineHeight: 19,
  },
  toNumber: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
    marginBottom: space.md,
  },
  debug: {
    fontSize: 12,
    color: colors.brand,
    fontWeight: "600",
    marginBottom: space.sm,
  },
  note: {
    marginTop: space.lg,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkFaint,
    textAlign: "center",
  },
  registerLink: {
    marginTop: space.lg,
    alignItems: "center",
  },
  registerText: {
    fontSize: 14,
    color: colors.inkSoft,
  },
  registerAction: {
    color: colors.brand,
    fontWeight: "600",
  },
  secondaryLink: {
    marginTop: space.md,
    alignItems: "center",
  },
  secondaryText: {
    fontSize: 13,
    color: colors.brand,
    fontWeight: "600",
  },
});
