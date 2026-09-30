import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { type ComponentProps, useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import {
  fetchPracticeNotifications,
  updateMyPhoto,
  updatePracticeLogo,
} from "@/lib/procto";
import { colors, radii, shadows, space } from "@/lib/theme";
import { doctorWebPath } from "@/lib/webPortal";

type IconName = ComponentProps<typeof Ionicons>["name"];

type MenuItem = {
  key: string;
  label: string;
  hint: string;
  icon: IconName;
  /** In-app screen; otherwise `web` opens the same page on the web portal. */
  href?: Href;
  web?: string;
  badge?: number;
};

/**
 * "More" = the rest of the web portal sidebar (same order, names and role rules);
 * the dock already carries Dashboard, Queue, Appointments, Patients and Calendar.
 */
export default function MoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    memberships,
    membership,
    practiceId,
    practiceIndex,
    setPracticeIndex,
    refresh,
  } = usePractice();
  const label = usePracticeLabel(membership);
  const [openAlerts, setOpenAlerts] = useState(0);

  const isClinicAdmin = isClinicAdminRole(membership?.role);
  const canManage = canManagePractice(membership);
  const isReception = membership?.role === "RECEPTIONIST";
  const me = membership?.practice.members.find((m) => m.userId === membership.userId)?.user;
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

  useFocusEffect(
    useCallback(() => {
      if (!practiceId) return;
      let alive = true;
      void fetchPracticeNotifications(practiceId, { take: 1 }).then((res) => {
        if (alive && res.status === "successful") setOpenAlerts(res.data?.total ?? 0);
      });
      return () => {
        alive = false;
      };
    }, [practiceId]),
  );

  const practiceItems: MenuItem[] = [
    {
      key: "notifications",
      label: "Notifications",
      hint: "Booking alerts and WhatsApp delivery",
      icon: "notifications-outline",
      href: "/(app)/notifications" as Href,
      badge: openAlerts,
    },
    ...(isClinicAdmin
      ? [
          {
            key: "doctors",
            label: "Doctors",
            hint: "Clinic roster and doctor settings (web)",
            icon: "medkit-outline" as IconName,
            web: "/clinic/doctors",
          },
        ]
      : []),
    {
      key: "support",
      label: "Patient Support",
      hint: "WhatsApp chats handed to the clinic",
      icon: "chatbubbles-outline",
      href: "/(app)/inbox",
    },
    ...(isReception
      ? []
      : [
          {
            key: "audit",
            label: "Audit log",
            hint: "Who changed what, and when (web)",
            icon: "document-text-outline" as IconName,
            web: "/doctor/audit",
          },
        ]),
    {
      key: "analytics",
      label: "Analytics",
      hint: "Visits, trends and doctor breakdown",
      icon: "stats-chart-outline",
      href: "/(app)/analytics",
    },
    {
      key: "payments",
      label: "Payments",
      hint: "Visit payments and payment requests",
      icon: "card-outline",
      href: "/(app)/payments" as Href,
    },
    {
      key: "hours",
      label: canManage ? "Hours & blocks" : "My hours",
      hint: canManage ? "Clinic hours, slots and leave" : "Your weekly hours and leave",
      icon: "time-outline",
      href: "/(app)/schedule",
    },
    {
      key: "subscription",
      label: "Subscription",
      hint: "Plan, trial and WhatsApp line",
      icon: "diamond-outline",
      href: "/(app)/subscriptions",
    },
  ];

  const accountItems: MenuItem[] = [
    {
      key: "settings",
      label: "Settings",
      hint: "Account, practice profile and theme (web)",
      icon: "settings-outline",
      web: "/settings",
    },
    {
      key: "help",
      label: "Help & Support",
      hint: "Ask Mira about GlucoGuide",
      icon: "help-buoy-outline",
      href: "/(app)/queries",
    },
  ];

  function open(item: MenuItem) {
    if (item.href) router.push(item.href);
    else if (item.web) void Linking.openURL(doctorWebPath(item.web));
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
          { paddingTop: space.lg, paddingBottom: contentBottomPad(insets.bottom) },
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

        <Text style={styles.section}>Practice</Text>
        <MenuGroup items={practiceItems} onOpen={open} />

        <Text style={styles.section}>Account</Text>
        <MenuGroup items={accountItems} onOpen={open} />

        <Pressable
          accessibilityRole="button"
          onPress={() => void signOut()}
          style={({ pressed }) => [styles.group, styles.row, pressed && styles.rowPressed]}
        >
          <View style={[styles.iconWrap, styles.iconDanger]}>
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
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
  const initial = name.replace(/^Dr\.?\s*/i, "").trim().charAt(0).toUpperCase() || "?";
  return (
    <View style={styles.photoTile}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={uri ? `Change ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
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
            <Ionicons name="camera" size={13} color="#fff" />
          )}
        </View>
      </Pressable>
      <Text style={styles.photoLabel}>{label}</Text>
      {uri ? (
        <Pressable accessibilityRole="button" onPress={onRemove} disabled={disabled} hitSlop={8}>
          <Text style={styles.photoRemove}>Remove</Text>
        </Pressable>
      ) : (
        <Text style={styles.hint}>Tap to add</Text>
      )}
    </View>
  );
}

function MenuGroup({ items, onOpen }: { items: MenuItem[]; onOpen: (i: MenuItem) => void }) {
  return (
    <View style={styles.group}>
      {items.map((item, i) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityLabel={item.badge ? `${item.label}, ${item.badge} open` : item.label}
          onPress={() => onOpen(item)}
          style={({ pressed }) => [
            styles.row,
            i > 0 && styles.rowDivider,
            pressed && styles.rowPressed,
          ]}
        >
          <View style={styles.iconWrap}>
            <Ionicons name={item.icon} size={20} color={colors.brand} />
          </View>
          <View style={styles.text}>
            <Text style={styles.label}>{item.label}</Text>
            <Text style={styles.hint} numberOfLines={1}>
              {item.hint}
            </Text>
          </View>
          {item.badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.badge > 99 ? "99+" : item.badge}</Text>
            </View>
          ) : null}
          <Ionicons
            name={item.web ? "open-outline" : "chevron-forward"}
            size={18}
            color={colors.inkSoft}
          />
        </Pressable>
      ))}
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
    marginTop: space.sm,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  group: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    marginBottom: space.lg,
    overflow: "hidden",
    ...shadows.card,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 56,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineStrong,
  },
  rowPressed: { backgroundColor: colors.paper },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
  },
  iconDanger: { backgroundColor: "#fdecec" },
  text: { flex: 1, minWidth: 0 },
  label: { fontSize: 15, fontWeight: "600", color: colors.ink },
  hint: { marginTop: 2, fontSize: 12, color: colors.inkSoft },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.danger,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  photoGroup: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: space.lg,
  },
  photoTile: { alignItems: "center", gap: 4, minWidth: 110 },
  photo: { width: 72, height: 72, backgroundColor: colors.paper },
  photoEmpty: { alignItems: "center", justifyContent: "center" },
  photoInitial: { fontSize: 26, fontWeight: "700", color: colors.brand },
  photoBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
    borderWidth: 2,
    borderColor: colors.white,
  },
  photoLabel: { marginTop: 6, fontSize: 14, fontWeight: "600", color: colors.ink },
  photoRemove: { fontSize: 12, fontWeight: "600", color: colors.danger },
  photoError: {
    marginTop: -space.sm,
    marginBottom: space.md,
    fontSize: 13,
    color: colors.danger,
  },
});
