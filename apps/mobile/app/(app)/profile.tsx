import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ClinicAvatar } from "@/components/mobile/ClinicAvatar";
import {
  PremiumAtmosphere,
  PremiumCard,
} from "@/components/mobile/PremiumChrome";
import {
  ErrorText,
  Field,
  HintText,
  Chip,
  Loading,
  PageTitle,
  PrimaryButton,
  Screen,
} from "@/components/ui";
import { api, clearSession } from "@/lib/api";
import { pickProfilePhoto, uploadPhoto } from "@/lib/cloudinary";
import { setCachedPatientName, setCachedPatientPhoto } from "@/lib/dataCache";
import { resolveMediaUrl } from "@/lib/media";
import { colors, space } from "@/lib/theme";
import type { PatientProfile } from "@/lib/types";

const GENDER_OPTIONS = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
  { id: "others", label: "Others" },
] as const;

/** Normalize DOB from DD/MM/YYYY or ISO into YYYY-MM-DD for the form. */
function normalizeDob(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const dmy = value.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${mm}-${dd}`;
  }
  return value.slice(0, 10);
}

export default function ProfileScreen() {
  const router = useRouter();
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
        dateOfBirth: normalizeDob(
          String(p.date_of_birth || p.dateOfBirth || ""),
        ),
        address: p.address ?? "",
      });
      setPhoto(resolveMediaUrl(p.img_src ?? p.imgSrc));
    });
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    if (!form.gender || !["male", "female", "others"].includes(form.gender)) {
      setSaving(false);
      setError("Gender is required. Choose male, female, or others.");
      return;
    }
    const res = await api("/patient/profile", {
      method: "PUT",
      body: JSON.stringify({
        name: form.name,
        gender: form.gender,
        address: form.address,
        contact_number: form.contactNumber,
        date_of_birth: form.dateOfBirth || undefined,
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
    router.replace("/(auth)/login");
  }

  if (loading) return <Loading />;

  return (
    <Screen>
      <PremiumAtmosphere />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageTitle
          eyebrow="Account"
          title="Profile"
          subtitle="Keep your phone updated so WhatsApp bookings link to this account."
        />

        <PremiumCard style={styles.formCard}>
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
                backgroundColor={colors.brandLight}
              />
              <View style={styles.photoBadge}>
                {photoBusy ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Ionicons name="camera" size={14} color={colors.white} />
                )}
              </View>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.photoTitle}>Profile photo</Text>
              <Text style={styles.menuHint}>Helps your clinic recognise you at the desk.</Text>
              <View style={styles.photoActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void changePhoto()}
                  disabled={photoBusy}
                  hitSlop={8}
                >
                  <Text style={styles.photoLink}>{photo ? "Change" : "Add photo"}</Text>
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
          <Field
            label="Full name"
            value={form.name}
            onChangeText={(name) => setForm((f) => ({ ...f, name }))}
          />
          <Field label="Email" value={form.email} editable={false} />
          <Field
            label="Contact number"
            value={form.contactNumber}
            onChangeText={(contactNumber) =>
              setForm((f) => ({ ...f, contactNumber }))
            }
            keyboardType="phone-pad"
          />
          <Text style={styles.genderLabel}>Gender</Text>
          <View style={styles.genderRow}>
            {GENDER_OPTIONS.map((opt) => (
              <Chip
                key={opt.id}
                label={opt.label}
                active={form.gender === opt.id}
                onPress={() => setForm((f) => ({ ...f, gender: opt.id }))}
              />
            ))}
          </View>
          <Field
            label="Date of birth (YYYY-MM-DD)"
            value={form.dateOfBirth}
            onChangeText={(dateOfBirth) => setForm((f) => ({ ...f, dateOfBirth }))}
          />
          <Field
            label="Address"
            value={form.address}
            onChangeText={(address) => setForm((f) => ({ ...f, address }))}
          />

          <ErrorText text={error} />
          {message ? <HintText text={message} /> : null}

          <PrimaryButton label="Save changes" onPress={save} busy={saving} />
        </PremiumCard>

        <View style={styles.menu}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(app)/queries")}
            style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
          >
            <View style={styles.menuIcon}>
              <Ionicons name="help-buoy-outline" size={20} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Help & Support</Text>
              <Text style={styles.menuHint}>Messages from your clinic and Mira</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => void logout()}
            style={({ pressed }) => [
              styles.menuRow,
              styles.menuDivider,
              pressed && styles.menuRowPressed,
            ]}
          >
            <View style={[styles.menuIcon, { backgroundColor: "#fdecec" }]}>
              <Ionicons name="log-out-outline" size={20} color={colors.danger} />
            </View>
            <Text style={[styles.menuLabel, { flex: 1, color: colors.danger }]}>Sign out</Text>
          </Pressable>
        </View>
        <Text style={styles.note}>
          Doctors and clinics use the GlucoGuide Provider app or website.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: 130 },
  menu: {
    marginTop: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    borderRadius: 20,
    overflow: "hidden",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 56,
  },
  menuDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineStrong,
  },
  menuRowPressed: { backgroundColor: colors.paper },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
  },
  menuLabel: { fontSize: 15, fontWeight: "600", color: colors.ink },
  menuHint: { marginTop: 2, fontSize: 12, color: colors.inkSoft },
  formCard: {
    paddingTop: space.lg,
  },
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
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
  },
  genderRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: space.md,
  },
  note: {
    marginTop: space.lg,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkFaint,
    textAlign: "center",
  },
});
