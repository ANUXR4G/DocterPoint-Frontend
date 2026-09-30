import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { type ComponentProps, useCallback, useState } from "react";
import {
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
import { contentBottomPad } from "@/lib/dockLayout";
import {
  canManagePractice,
  isClinicAdminRole,
  usePractice,
  usePracticeLabel,
} from "@/lib/practiceContext";
import { fetchPracticeNotifications } from "@/lib/procto";
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
  const { memberships, membership, practiceId, practiceIndex, setPracticeIndex } =
    usePractice();
  const label = usePracticeLabel(membership);
  const [openAlerts, setOpenAlerts] = useState(0);

  const isClinicAdmin = isClinicAdminRole(membership?.role);
  const canManage = canManagePractice(membership);
  const isReception = membership?.role === "RECEPTIONIST";

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
});
