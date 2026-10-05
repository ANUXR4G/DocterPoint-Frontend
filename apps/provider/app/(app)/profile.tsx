import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgIcon } from "@/components/icons/SvgIcon";
import { Chip, PageTitle } from "@/components/ui";
import { PremiumAtmosphere } from "@/components/mobile/PremiumChrome";
import { clearSession } from "@/lib/api";
import { pickAndUploadPhoto } from "@/lib/cloudinary";
import { contentBottomPad } from "@/lib/dockLayout";
import { resolveMediaUrl } from "@/lib/media";
import {
  canManagePractice,
  isClinicAdminRole,
  usePractice,
  usePracticeLabel,
} from "@/lib/practiceContext";
import { updateMyPhoto, updatePracticeLogo } from "@/lib/procto";
import { colors, radii, shadows, space } from "@/lib/theme";

/** Account — photos, practice switch, sign out. Portal pages live in the sidebar. */
export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    memberships,
    membership,
    practiceIndex,
    setPracticeIndex,
    refresh,
  } = usePractice();
  const label = usePracticeLabel(membership);
  const isClinicAdmin = isClinicAdminRole(membership?.role);
  const canManage = canManagePractice(membership);
  const me = membership?.practice.members.find(
    (m) => m.userId === membership.userId,
  )?.user;
  const [photoBusy, setPhotoBusy] = useState<"me" | "logo" | null>(null);
  const [photoError, setPhotoError] = useState("");

  async function changePhoto(target: "me" | "logo", remove = false) {
    if (!membership) return;
    setPhotoError("");
    let url: string | null = null;
    if (!remove) {
      let picked: string | "denied" | null;
      try {
        setPhotoBusy(target);
        picked = await pickAndUploadPhoto();
      } catch {
        setPhotoBusy(null);
        setPhotoError("Upload failed. Check your connection and try again.");
        return;
      }
      if (picked === "denied") {
        setPhotoBusy(null);
        setPhotoError("Photo access was blocked. Allow photos in Settings.");
        return;
      }
      if (!picked) {
        setPhotoBusy(null);
        return;
      }
      url = picked;
    }
    setPhotoBusy(target);
    const res =
      target === "me"
        ? await updateMyPhoto(url)
        : await updatePracticeLogo(membership.practice.id, url);
    if (res.status !== "successful") {
      setPhotoBusy(null);
      setPhotoError(res.message || "Could not save the photo.");
      return;
    }
    await refresh();
    setPhotoBusy(null);
  }

  async function signOut() {
    await clearSession();
    router.replace("/(auth)/login");
  }

  return (
    <View style={styles.root}>
      <PremiumAtmosphere />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: space.lg,
            paddingBottom: contentBottomPad(insets.bottom),
          },
        ]}
      >
        <PageTitle
          eyebrow={isClinicAdmin ? "Clinic portal" : "Doctor portal"}
          title={membership?.practice.name ?? "No practice"}
          subtitle={label}
        />

        {memberships.length > 1 ? (
          <View style={{ marginBottom: space.lg }}>
            <Text style={styles.section}>Switch practice</Text>
            <View style={styles.chips}>
              {memberships.map((m, i) => (
                <Chip
                  key={m.practice.id}
                  label={m.practice.name}
                  active={i === practiceIndex}
                  onPress={() => setPracticeIndex(i)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {membership ? (
          <>
            <Text style={styles.section}>Photos</Text>
            <View style={[styles.group, styles.photoGroup]}>
              <PhotoTile
                label="Your photo"
                name={me?.name || "You"}
                uri={resolveMediaUrl(me?.imgSrc)}
                round
                busy={photoBusy === "me"}
                disabled={photoBusy != null}
                onChange={() => void changePhoto("me")}
                onRemove={() => void changePhoto("me", true)}
              />
              {canManage ? (
                <PhotoTile
                  label="Clinic logo"
                  name={membership.practice.name}
                  uri={resolveMediaUrl(membership.practice.bgSrc)}
                  busy={photoBusy === "logo"}
                  disabled={photoBusy != null}
                  onChange={() => void changePhoto("logo")}
                  onRemove={() => void changePhoto("logo", true)}
                />
              ) : null}
            </View>
            {photoError ? <Text style={styles.photoError}>{photoError}</Text> : null}
          </>
        ) : null}

        <Text style={styles.section}>Account</Text>
        <View style={styles.group}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(app)/settings" as never)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={styles.iconWrap}>
              <SvgIcon name="settings" size={20} color={colors.brand} />
            </View>
            <View style={styles.text}>
              <Text style={styles.label}>Settings</Text>
              <Text style={styles.hint} numberOfLines={1}>
                Practice profile, fees and contact
              </Text>
            </View>
            <SvgIcon name="chevronRight" size={18} color={colors.inkSoft} />
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => void signOut()}
          style={({ pressed }) => [
            styles.group,
            styles.row,
            pressed && styles.rowPressed,
          ]}
        >
          <View style={[styles.iconWrap, styles.iconDanger]}>
            <SvgIcon name="logout" size={20} color={colors.danger} />
          </View>
          <Text style={[styles.label, { color: colors.danger }]}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function PhotoTile({
  label,
  name,
  uri,
  round,
  busy,
  disabled,
  onChange,
  onRemove,
}: {
  label: string;
  name: string;
  uri: string | null;
  round?: boolean;
  busy: boolean;
  disabled: boolean;
  onChange: () => void;
  onRemove: () => void;
}) {
  const radius = round ? 36 : 18;
  const initial =
    name.replace(/^Dr\.?\s*/i, "").trim().charAt(0).toUpperCase() || "?";
  return (
    <View style={styles.photoTile}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          uri ? `Change ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`
        }
        onPress={onChange}
        disabled={disabled}
      >
        {uri ? (
          <Image source={{ uri }} style={[styles.photo, { borderRadius: radius }]} />
        ) : (
          <View style={[styles.photo, styles.photoEmpty, { borderRadius: radius }]}>
            <Text style={styles.photoInitial}>{initial}</Text>
          </View>
        )}
        <View style={styles.photoBadge}>
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <SvgIcon name="camera" size={13} color="#fff" />
          )}
        </View>
      </Pressable>
      <Text style={styles.photoLabel}>{label}</Text>
      {uri ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRemove}
          disabled={disabled}
          hitSlop={8}
        >
          <Text style={styles.photoRemove}>Remove</Text>
        </Pressable>
      ) : (
        <Text style={styles.hint}>Tap to add</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  content: { paddingHorizontal: space.xl },
  section: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.inkSoft,
    marginBottom: space.sm,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  group: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    marginBottom: space.lg,
    overflow: "hidden",
    ...shadows.soft,
  },
  photoGroup: {
    flexDirection: "row",
    gap: space.lg,
    padding: space.lg,
  },
  photoTile: { alignItems: "center", gap: 6, flex: 1 },
  photo: { width: 72, height: 72 },
  photoEmpty: {
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  photoInitial: { fontSize: 24, fontWeight: "700", color: colors.brand },
  photoBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.white,
  },
  photoLabel: { fontSize: 13, fontWeight: "600", color: colors.ink },
  photoRemove: { fontSize: 12, fontWeight: "600", color: colors.danger },
  photoError: {
    color: colors.danger,
    marginTop: -space.md,
    marginBottom: space.lg,
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: 14,
  },
  rowPressed: { backgroundColor: colors.brandMist },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  iconDanger: { backgroundColor: "#fdecec" },
  text: { flex: 1, minWidth: 0 },
  label: { fontSize: 16, fontWeight: "600", color: colors.ink },
  hint: { marginTop: 2, fontSize: 12, color: colors.inkSoft },
});
