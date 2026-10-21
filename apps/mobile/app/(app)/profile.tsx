import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgIcon } from "@/components/icons/SvgIcon";
import { ClinicAvatar } from "@/components/mobile/ClinicAvatar";
import { HouseholdPicker } from "@/components/mobile/HouseholdPicker";
import { useCareTheme, type CarePalette } from "@/lib/careTheme";
import { ErrorText, Loading, Screen } from "@/components/ui";
import { api, clearSession } from "@/lib/api";
import { pickProfilePhoto, uploadPhoto } from "@/lib/cloudinary";
import { setCachedPatientName, setCachedPatientPhoto } from "@/lib/dataCache";
import { contentBottomPad, safeTopInset } from "@/lib/dockLayout";
import { resolveMediaUrl } from "@/lib/media";
import { PressableScale } from "@/lib/motion";
import { colors, radii, shadows, space } from "@/lib/theme";
import type { PatientProfile } from "@/lib/types";

const GENDER_OPTIONS = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
  { id: "others", label: "Others" },
] as const;

/** Normalize DOB from DD/MM/YYYY or ISO into YYYY-MM-DD for the form. */
function ProfileField({
  label,
  theme,
  style,
  ...props
}: TextInputProps & { label: string; theme: CarePalette }) {
  const locked = props.editable === false;
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.muted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.muted}
        style={[
          styles.input,
          {
            backgroundColor: theme.paper,
            color: theme.ink,
            borderColor: theme.line,
          },
          locked && styles.inputLocked,
          style,
        ]}
        {...props}
      />
    </View>
  );
}

/** Digits only, shown as DD-MM-YYYY while the patient types. */
function formatDobDisplay(raw: string): string {
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(value);
  if (dmy) {
    return `${dmy[1].padStart(2, "0")}-${dmy[2].padStart(2, "0")}-${dmy[3]}`;
  }
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

/** DD-MM-YYYY to the YYYY-MM-DD the profile API stores. */
function dobToIso(display: string): string | null {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(display.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    year < 1900 ||
    date > new Date()
  ) {
    return null;
  }
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useCareTheme();
  const [form, setForm] = useState({
    name: "",
    email: "",
    gender: "",
    contactNumber: "",
    dateOfBirth: "",
    address: "",
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");

  async function savePhoto(url: string | null) {
    const res = await api<PatientProfile>("/patient/profile", {
      method: "PUT",
      body: JSON.stringify({ img_src: url ?? "" }),
    });
    if (res.status !== "successful") {
      setPhotoError(res.message || "Could not save the photo.");
      return;
    }
    const uri = resolveMediaUrl(url);
    setPhoto(uri);
    setCachedPatientPhoto(uri);
  }

  async function changePhoto() {
    setPhotoError("");
    const picked = await pickProfilePhoto();
    if (picked === "denied") {
      setPhotoError("Photo access was blocked. Allow photos in Settings.");
      return;
    }
    if (!picked) return;
    setPhotoBusy(true);
    try {
      await savePhoto(await uploadPhoto(picked));
    } catch {
      setPhotoError("Upload failed. Check your connection and try again.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    setPhotoError("");
    setPhotoBusy(true);
    await savePhoto(null);
    setPhotoBusy(false);
  }

  const [profileGen, setProfileGen] = useState(0);

  useEffect(() => {
    api<PatientProfile>("/patient/profile").then((res) => {
      setLoading(false);
      if (res.status !== "successful") {
        setError(res.message || "Failed to load profile");
        return;
      }
      const p = (res.data || res) as PatientProfile;
      setForm({
        name: p.name ?? "",
        email: p.email ?? "",
        gender: (p.gender ?? "").toLowerCase(),
        contactNumber: String(p.contact_number || p.contactNumber || p.phone || ""),
        dateOfBirth: formatDobDisplay(
          String(p.date_of_birth || p.dateOfBirth || ""),
        ),
        address: p.address ?? "",
      });
      setPhoto(resolveMediaUrl(p.img_src ?? p.imgSrc));
    });
  }, [profileGen]);

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    if (!form.gender || !["male", "female", "others"].includes(form.gender)) {
      setSaving(false);
      setError("Gender is required. Choose male, female, or others.");
      return;
    }
    let dateOfBirth: string | undefined;
    if (form.dateOfBirth.trim()) {
      const iso = dobToIso(form.dateOfBirth);
      if (!iso) {
        setSaving(false);
        setError("Enter date of birth as DD-MM-YYYY.");
        return;
      }
      dateOfBirth = iso;
    }
    const res = await api("/patient/profile", {
      method: "PUT",
      body: JSON.stringify({
        name: form.name,
        gender: form.gender,
        address: form.address,
        contact_number: form.contactNumber,
        date_of_birth: dateOfBirth,
      }),
    });
    setSaving(false);
    if (res.status !== "successful") {
      setError(res.message || "Update failed");
      return;
    }
    if (form.name.trim()) setCachedPatientName(form.name.trim());
    setMessage("Profile saved.");
  }

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    await clearSession();
    router.replace("/(auth)/welcome");
  }

  if (loading) return <Loading />;

  return (
    <Screen style={{ backgroundColor: theme.paper }}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: safeTopInset(insets.top) + 8,
            paddingBottom: contentBottomPad(insets.bottom),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: theme.ink }]}>Profile</Text>
        <Text style={[styles.pageSub, { color: theme.muted }]}>
          Keep your phone updated so WhatsApp bookings link to this account.
        </Text>
        <HouseholdPicker onSwitched={() => setProfileGen((n) => n + 1)} />

        <View style={[styles.formCard, { backgroundColor: theme.card }]}>
          <View style={styles.photoRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={photo ? "Change profile photo" : "Add profile photo"}
              onPress={() => void changePhoto()}
              disabled={photoBusy}
            >
              <ClinicAvatar
                name={form.name || "You"}
                uri={photo}
                size={76}
                radius={38}
                backgroundColor={theme.visit}
              />
              <View style={[styles.photoBadge, { backgroundColor: theme.ink, borderColor: theme.card }]}>
                {photoBusy ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <SvgIcon name="camera" size={14} color={colors.white} />
                )}
              </View>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[styles.photoTitle, { color: theme.ink }]}>Profile photo</Text>
              <Text style={[styles.menuHint, { color: theme.muted }]}>
                Helps your clinic recognise you at the desk.
              </Text>
              <View style={styles.photoActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void changePhoto()}
                  disabled={photoBusy}
                  hitSlop={8}
                >
                  <Text style={[styles.photoLink, { color: theme.visitInk }]}>{photo ? "Change" : "Add photo"}</Text>
                </Pressable>
                {photo ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void removePhoto()}
                    disabled={photoBusy}
                    hitSlop={8}
                  >
                    <Text style={[styles.photoLink, { color: colors.danger }]}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
          <ErrorText text={photoError} />
          <ProfileField
            theme={theme}
            label="Full name"
            value={form.name}
            onChangeText={(name) => setForm((f) => ({ ...f, name }))}
          />
          <ProfileField theme={theme} label="Email" value={form.email} editable={false} />
          <ProfileField
            theme={theme}
            label="Contact number"
            value={form.contactNumber}
            onChangeText={(contactNumber) =>
              setForm((f) => ({ ...f, contactNumber }))
            }
            keyboardType="phone-pad"
          />
          <Text style={[styles.genderLabel, { color: theme.muted }]}>Gender</Text>
          <View style={styles.genderRow}>
            {GENDER_OPTIONS.map((opt) => {
              const active = form.gender === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setForm((f) => ({ ...f, gender: opt.id }))}
                  style={[
                    styles.genderChip,
                    { backgroundColor: active ? theme.ink : theme.paper },
                  ]}
                >
                  <Text style={[styles.genderText, { color: active ? colors.white : theme.ink }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <ProfileField
            theme={theme}
            label="Date of birth"
            value={form.dateOfBirth}
            onChangeText={(text) =>
              setForm((f) => ({ ...f, dateOfBirth: formatDobDisplay(text) }))
            }
            keyboardType="number-pad"
            placeholder="DD-MM-YYYY"
            maxLength={10}
          />
          <ProfileField
            theme={theme}
            label="Address"
            value={form.address}
            onChangeText={(address) => setForm((f) => ({ ...f, address }))}
          />

          <ErrorText text={error} />
          {message ? (
            <Text style={[styles.saved, { color: theme.taskInk }]}>{message}</Text>
          ) : null}

          <PressableScale
            onPress={save}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save changes"
            style={[styles.save, { backgroundColor: theme.ink }]}
          >
            {saving ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.saveText}>Save changes</Text>
            )}
          </PressableScale>
        </View>

        <View style={[styles.menu, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(app)/settings" as never)}
            style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
          >
            <View style={[styles.menuIcon, { backgroundColor: theme.visit }]}>
              <SvgIcon name="settings" size={20} color={theme.visitInk} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: theme.ink }]}>Theme</Text>
              <Text style={[styles.menuHint, { color: theme.muted }]}>Colour theme for the whole app</Text>
            </View>
            <SvgIcon name="chevronRight" size={18} color={theme.muted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(app)/queries")}
            style={({ pressed }) => [styles.menuRow, { borderTopColor: theme.line, borderTopWidth: StyleSheet.hairlineWidth }, pressed && styles.menuRowPressed]}
          >
            <View style={[styles.menuIcon, { backgroundColor: theme.people }]}>
              <SvgIcon name="help" size={20} color={theme.peopleInk} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: theme.ink }]}>Help & Support</Text>
              <Text style={[styles.menuHint, { color: theme.muted }]}>Messages from your clinic and Mira</Text>
            </View>
            <SvgIcon name="chevronRight" size={18} color={theme.muted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => void logout()}
            style={({ pressed }) => [
              styles.menuRow,
              { borderTopColor: theme.line, borderTopWidth: StyleSheet.hairlineWidth },
              pressed && styles.menuRowPressed,
            ]}
          >
            <View style={[styles.menuIcon, { backgroundColor: theme.alert }]}>
              <SvgIcon name="logout" size={20} color={colors.danger} />
            </View>
            <Text style={[styles.menuLabel, { flex: 1, color: theme.alertInk }]}>Sign out</Text>
          </Pressable>
        </View>
        <Text style={[styles.note, { color: theme.muted }]}>
          Doctors and clinics use the GlucoGuide Provider app or website.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  pageTitle: {
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  pageSub: { marginTop: 6, marginBottom: 16, fontSize: 14, lineHeight: 20 },
  menu: {
    marginTop: space.lg,
    borderRadius: 26,
    overflow: "hidden",
    ...shadows.soft,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 56,
  },
  menuRowPressed: { opacity: 0.72 },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
  },
  menuLabel: { fontSize: 15, fontWeight: "600" },
  menuHint: { marginTop: 2, fontSize: 12, lineHeight: 16 },
  formCard: {
    marginTop: space.md,
    borderRadius: 26,
    padding: space.lg,
    ...shadows.soft,
  },
  field: { marginBottom: space.md },
  fieldLabel: { marginBottom: 6, fontSize: 13, fontWeight: "600" },
  input: {
    height: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  inputLocked: { opacity: 0.72 },
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    marginBottom: space.md,
  },
  photoBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
    borderWidth: 2,
    borderColor: colors.white,
  },
  photoTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  photoActions: { flexDirection: "row", gap: space.lg, marginTop: 8 },
  photoLink: { fontSize: 14, fontWeight: "700", color: colors.brand },
  genderLabel: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: "600",
  },
  genderRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: space.md,
  },
  genderChip: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  genderText: { fontSize: 14, fontWeight: "600" },
  saved: { marginBottom: space.md, fontSize: 14, fontWeight: "600" },
  save: {
    minHeight: 48,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: colors.white, fontSize: 15, fontWeight: "700" },
  note: {
    marginTop: space.lg,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
});
