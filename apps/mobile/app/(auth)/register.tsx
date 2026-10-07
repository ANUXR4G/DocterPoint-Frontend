import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
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
  IdDocumentScanSection,
  type IdentityDocumentsPayload,
  type ProfileDraft,
} from "@/components/IdDocumentScanSection";
import { VoiceField } from "@/components/VoiceField";
import {
  BrandMark,
  Chip,
  ErrorText,
  Field,
  PageTitle,
  PrimaryButton,
  SectionTitle,
} from "@/components/ui";
import { friendlyWhatsAppError } from "@/lib/whatsappErrors";
import {
  parseAadhaarInput,
  validateAadhar,
  validatePan,
} from "@/lib/indianIdInput";
import { api, setRefreshToken, setToken } from "@/lib/api";
import {
  composeLoginPhone,
  DEFAULT_COUNTRY,
  nationalDigitsReady,
  type CountryDial,
} from "@/lib/countries";
import { registerForPush } from "@/lib/push";
import { colors, space } from "@/lib/theme";
import {
  updateProfile,
  uploadAadharCard,
  uploadProfilePhoto,
} from "@/lib/user";

const GENDERS = [
  { value: "male" as const, label: "Male" },
  { value: "female" as const, label: "Female" },
  { value: "others" as const, label: "Other" },
];

type Step = "phone" | "otp" | "profile";

const emptyProfile = (): ProfileDraft => ({
  name: "",
  gender: "male",
  address: "",
  profession: "",
  dateOfBirth: "",
  contactNumber: "",
  emergencyNumber: "",
});

function toApiDate(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split("-");
    return `${m}/${d}/${y}`;
  }
  return trimmed;
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

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("phone");
  const [country, setCountry] = useState<CountryDial>(DEFAULT_COUNTRY);
  const [national, setNational] = useState("");
  const [otp, setOtp] = useState("");
  const [hint, setHint] = useState("");
  const [debugOtp, setDebugOtp] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [profile, setProfile] = useState<ProfileDraft>(emptyProfile);
  const [aadharNumber, setAadharNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [identityDocs, setIdentityDocs] = useState<IdentityDocumentsPayload>({
    idImages: [],
    profilePhoto: null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wantEmail, setWantEmail] = useState<"yes" | "no" | null>(null);
  const [email, setEmail] = useState("");

  const fullPhone = composeLoginPhone(country, national);

  const handleProfileChange = useCallback(
    (next: ProfileDraft | ((prev: ProfileDraft) => ProfileDraft)) => {
      setProfile((prev) =>
        typeof next === "function" ? next(prev) : next,
      );
    },
    [],
  );

  const handleDocumentsChange = useCallback(
    (payload: IdentityDocumentsPayload) => {
      setIdentityDocs(payload);
    },
    [],
  );

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
      }>("/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({ phone: fullPhone }),
      });
      if (res.status !== "successful") {
        setError(friendlyWhatsAppError(res.message));
        return;
      }
      const from = res.data?.from || "9990052082";
      setHint(`Code sent on WhatsApp from +91 ${from}`);
      if (res.data?.debugOtp) setDebugOtp(res.data.debugOtp);
      setProfile((prev) => ({
        ...prev,
        contactNumber: fullPhone || prev.contactNumber,
      }));
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
          name: profile.name.trim() || undefined,
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
        setError("Account created but no session token returned.");
        return;
      }
      await setToken(access);
      if (refresh) await setRefreshToken(refresh);
      setAccessToken(access);
      setStep("profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  function validateProfile(): string | null {
    if (!profile.name.trim()) return "Full name is required.";
    if (!profile.dateOfBirth.trim()) return "Date of birth is required.";
    if (!profile.gender) return "Please select a gender.";
    if (!profile.contactNumber.trim()) return "Contact number is required.";
    if (!profile.emergencyNumber.trim())
      return "Emergency contact is required.";
    if (!profile.address.trim()) return "Address is required.";
    if (wantEmail === null) {
      return "Please choose whether to add an email address.";
    }
    if (wantEmail === "yes") {
      const trimmed = email.trim().toLowerCase();
      if (!trimmed) return "Enter your email, or choose No.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return "Enter a valid email address.";
      }
    }
    return validateAadhar(aadharNumber) || validatePan(panNumber);
  }

  async function finishProfile() {
    setError("");
    const validationError = validateProfile();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!accessToken) {
      setError("Session expired. Verify WhatsApp OTP again.");
      setStep("phone");
      return;
    }

    setBusy(true);
    try {
      const updateRes = await updateProfile(accessToken, {
        name: profile.name.trim(),
        gender: profile.gender,
        address: profile.address.trim(),
        profession: profile.profession.trim(),
        contact_number: profile.contactNumber.trim(),
        emergency_number: profile.emergencyNumber.trim(),
        date_of_birth: toApiDate(profile.dateOfBirth),
        ...(wantEmail === "yes" && email.trim()
          ? { email: email.trim().toLowerCase() }
          : {}),
        ...(aadharNumber.trim()
          ? { aadhar_number: parseAadhaarInput(aadharNumber) }
          : {}),
        ...(panNumber.trim()
          ? { pan_number: panNumber.trim().toUpperCase() }
          : {}),
      });

      if (updateRes.status !== "successful") {
        setError(updateRes.message || "Could not save profile.");
        return;
      }

      if (identityDocs.profilePhoto) {
        await uploadProfilePhoto(accessToken, {
          imageBase64: identityDocs.profilePhoto.base64,
          mimeType: identityDocs.profilePhoto.mimeType,
        });
      }

      const aadharImage =
        identityDocs.idImages.find((img) => img.documentType === "AADHAAR") ??
        identityDocs.idImages[0];
      if (aadharImage) {
        await uploadAadharCard(accessToken, {
          imageBase64: aadharImage.base64,
          mimeType: aadharImage.mimeType,
        });
      }

      try {
        await registerForPush();
      } catch {
        /* optional */
      }

      router.replace("/(app)/home");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not finish profile.",
      );
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
        <BrandMark />
        <View style={{ height: space.lg }} />
        <PageTitle
          eyebrow="Patient"
          title={
            step === "profile"
              ? "Complete your profile"
              : "Create account with mobile"
          }
          subtitle={
            step === "profile"
              ? "Optional ID scan and email, then finish your details. Sign-in stays WhatsApp OTP."
              : "Choose your country (default India +91). We verify with a WhatsApp code from +91 99900 52082."
          }
        />

        {step === "phone" ? (
          <>
            <Field
              label="Full name (optional for now)"
              value={profile.name}
              onChangeText={(name) =>
                setProfile((prev) => ({ ...prev, name }))
              }
              placeholder="As on your ID"
            />
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
              onPress={() => void requestOtp()}
              busy={busy}
              disabled={!nationalDigitsReady(national)}
            />
          </>
        ) : null}

        {step === "otp" ? (
          <>
            <Text style={styles.hint}>
              {hint || "Enter the 6-digit code from WhatsApp"}
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
              onPress={() => void verifyOtp()}
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
            <Pressable
              onPress={() => void requestOtp()}
              style={styles.secondaryLink}
            >
              <Text style={styles.secondaryText}>Resend code</Text>
            </Pressable>
          </>
        ) : null}

        {step === "profile" ? (
          <>
            <SectionTitle>1. Identity (optional)</SectionTitle>
            <IdDocumentScanSection
              onProfileChange={handleProfileChange}
              aadharNumber={aadharNumber}
              panNumber={panNumber}
              onAadharNumberChange={setAadharNumber}
              onPanNumberChange={setPanNumber}
              onDocumentsChange={handleDocumentsChange}
            />

            <SectionTitle>2. Basic details</SectionTitle>
            <Text style={styles.sectionHint}>
              Review and complete any missing fields after the scan.
            </Text>

            <Field
              label="Full legal name *"
              value={profile.name}
              onChangeText={(name) =>
                setProfile((prev) => ({ ...prev, name }))
              }
              placeholder="As on your ID"
            />

            <Field
              label="Date of birth *"
              value={profile.dateOfBirth}
              onChangeText={(dateOfBirth) =>
                setProfile((prev) => ({ ...prev, dateOfBirth }))
              }
              placeholder="YYYY-MM-DD or MM/DD/YYYY"
            />

            <Text style={styles.label}>Gender *</Text>
            <View style={styles.chipRow}>
              {GENDERS.map((g) => (
                <Chip
                  key={g.value}
                  label={g.label}
                  active={profile.gender === g.value}
                  onPress={() =>
                    setProfile((prev) => ({ ...prev, gender: g.value }))
                  }
                />
              ))}
            </View>

            <Field
              label="Profession"
              value={profile.profession}
              onChangeText={(profession) =>
                setProfile((prev) => ({ ...prev, profession }))
              }
            />

            <Field
              label="Contact number *"
              value={profile.contactNumber}
              onChangeText={(contactNumber) =>
                setProfile((prev) => ({ ...prev, contactNumber }))
              }
              keyboardType="phone-pad"
            />

            <Field
              label="Emergency contact *"
              value={profile.emergencyNumber}
              onChangeText={(emergencyNumber) =>
                setProfile((prev) => ({ ...prev, emergencyNumber }))
              }
              keyboardType="phone-pad"
            />

            <VoiceField
              label="Address *"
              value={profile.address}
              onChangeText={(address) =>
                setProfile((prev) => ({ ...prev, address }))
              }
              placeholder="Home / current address"
              micAriaLabel="Record address by voice"
            />

            <SectionTitle>3. Email (optional)</SectionTitle>
            <Text style={styles.sectionHint}>
              Do you want to add an email address? You can always sign in with
              WhatsApp OTP either way.
            </Text>
            <View style={styles.chipRow}>
              <Chip
                label="Yes, add email"
                active={wantEmail === "yes"}
                onPress={() => setWantEmail("yes")}
              />
              <Chip
                label="No, skip"
                active={wantEmail === "no"}
                onPress={() => {
                  setWantEmail("no");
                  setEmail("");
                }}
              />
            </View>
            {wantEmail === "yes" ? (
              <Field
                label="Email address *"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="you@example.com"
              />
            ) : null}

            <ErrorText text={error} />
            <PrimaryButton
              label="Save & open app"
              onPress={() => void finishProfile()}
              busy={busy}
            />
            <Pressable
              onPress={() => router.replace("/(app)/home")}
              style={styles.secondaryLink}
            >
              <Text style={styles.secondaryText}>Skip for now</Text>
            </Pressable>
          </>
        ) : null}

        {step !== "profile" ? (
          <Pressable
            onPress={() => router.replace("/(auth)/login")}
            style={styles.switchLink}
          >
            <Text style={styles.switchText}>
              Already registered?{" "}
              <Text style={styles.switchAction}>Sign in with OTP</Text>
            </Text>
          </Pressable>
        ) : null}
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
  sectionHint: {
    marginBottom: space.md,
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  hint: {
    fontSize: 13,
    color: colors.inkSoft,
    marginBottom: space.md,
    lineHeight: 19,
  },
  debug: {
    fontSize: 12,
    color: colors.brand,
    fontWeight: "600",
    marginBottom: space.sm,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.inkSoft,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: space.md,
  },
  switchLink: {
    marginTop: space.lg,
    alignItems: "center",
  },
  switchText: {
    fontSize: 14,
    color: colors.inkSoft,
  },
  switchAction: {
    color: colors.brand,
    fontWeight: "700",
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
