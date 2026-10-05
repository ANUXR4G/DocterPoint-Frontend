import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgIcon } from "@/components/icons/SvgIcon";
import {
  canManagePractice,
  isClinicAdminRole,
  usePractice,
} from "@/lib/practiceContext";
import { fetchPracticeNotifications } from "@/lib/procto";
import {
  buildSidebarNav,
  sidebarItemActive,
  type SidebarNavItem,
} from "@/lib/sidebarNav";
import { colors, radii, shadows, space } from "@/lib/theme";
import { doctorWebPath } from "@/lib/webPortal";

type SidebarCtx = {
  open: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
};

const Ctx = createContext<SidebarCtx | null>(null);

export function useAppSidebar() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppSidebar requires SidebarProvider");
  return v;
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo<SidebarCtx>(
    () => ({
      open,
      openSidebar: () => setOpen(true),
      closeSidebar: () => setOpen(false),
      toggleSidebar: () => setOpen((o) => !o),
    }),
    [open],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const SECTION_LABEL: Record<string, string> = {
  care: "Care",
  practice: "Practice",
  account: "Account",
};

export function AppSidebar() {
  const { open, closeSidebar } = useAppSidebar();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { membership, practiceId } = usePractice();
  const [openAlerts, setOpenAlerts] = useState(0);

  useEffect(() => {
    if (!practiceId || !open) return;
    let alive = true;
    void fetchPracticeNotifications(practiceId, { take: 1 }).then((res) => {
      if (alive && res.status === "successful") {
        setOpenAlerts(res.data?.total ?? 0);
      }
    });
    return () => {
      alive = false;
    };
  }, [practiceId, open]);

  const items = useMemo(
    () => buildSidebarNav(membership, { openAlerts }),
    [membership, openAlerts],
  );

  const onOpen = useCallback(
    (item: SidebarNavItem) => {
      closeSidebar();
      if (item.href) router.push(item.href as never);
      else if (item.web) void Linking.openURL(doctorWebPath(item.web));
    },
    [closeSidebar, router],
  );

  let lastSection = "";

  return (
    <Modal
      visible={open}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={closeSidebar}
    >
      <View style={styles.modalRoot}>
        <Pressable
          style={styles.backdrop}
          onPress={closeSidebar}
          accessibilityLabel="Close menu"
        />
        <View
          style={[
            styles.panel,
            shadows.dock,
            {
              paddingTop: Math.max(insets.top, space.md),
              paddingBottom: Math.max(insets.bottom, space.md),
            },
          ]}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.brand}>GlucoGuide</Text>
              <Text style={styles.brandSub} numberOfLines={1}>
                {membership?.practice.name ?? "Clinic"}
                {isClinicAdminRole(membership?.role)
                  ? " · Clinic"
                  : canManagePractice(membership)
                    ? " · Doctor"
                    : ""}
              </Text>
            </View>
            <Pressable
              onPress={closeSidebar}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close menu"
              hitSlop={8}
            >
              <SvgIcon name="close" size={18} color={colors.inkSoft} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {items.map((item) => {
              const section = item.section ?? "care";
              const showSection = section !== lastSection;
              lastSection = section;
              const active = sidebarItemActive(item, pathname);
              return (
                <View key={item.key}>
                  {showSection ? (
                    <Text style={styles.section}>{SECTION_LABEL[section]}</Text>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => onOpen(item)}
                    style={({ pressed }) => [
                      styles.row,
                      active && styles.rowActive,
                      pressed && styles.rowPressed,
                    ]}
                  >
                    <View
                      style={[styles.iconWrap, active && styles.iconWrapActive]}
                    >
                      <SvgIcon
                        name={item.icon}
                        size={18}
                        color={active ? colors.brand : colors.inkSoft}
                      />
                    </View>
                    <Text
                      style={[styles.label, active && styles.labelActive]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                    {item.badge ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          {item.badge > 99 ? "99+" : item.badge}
                        </Text>
                      </View>
                    ) : null}
                    {item.web ? (
                      <SvgIcon name="open" size={14} color={colors.inkFaint} />
                    ) : null}
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Floating menu control — unused when AppTopBar is present; kept for reuse. */
export function SidebarMenuButton() {
  const { openSidebar } = useAppSidebar();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open menu"
      onPress={openSidebar}
      style={[
        styles.menuFab,
        shadows.soft,
        {
          top: Math.max(insets.top, 8) + 4,
          left: Math.max(insets.left, 12),
        },
      ]}
    >
      <SvgIcon name="menu" size={20} color={colors.ink} />
    </Pressable>
  );
}

const PANEL_W = 288;

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    flexDirection: "row",
  },
  backdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 27, 36, 0.38)",
  },
  panel: {
    width: PANEL_W,
    maxWidth: "86%",
    height: "100%",
    backgroundColor: colors.white,
    paddingHorizontal: space.md,
    zIndex: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.md,
    paddingHorizontal: space.sm,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    marginBottom: space.sm,
  },
  brand: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.4,
  },
  brandSub: {
    marginTop: 2,
    fontSize: 12,
    color: colors.inkSoft,
    maxWidth: 200,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: space.xl,
    gap: 2,
  },
  section: {
    marginTop: space.md,
    marginBottom: space.xs,
    marginHorizontal: space.sm,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: colors.inkFaint,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: 10,
    paddingHorizontal: space.sm,
    borderRadius: radii.lg,
  },
  rowActive: {
    backgroundColor: colors.brandLight,
  },
  rowPressed: {
    opacity: 0.72,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
  },
  iconWrapActive: {
    backgroundColor: colors.white,
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
    letterSpacing: -0.2,
  },
  labelActive: {
    color: colors.brand,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
  },
  badgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "700",
  },
  menuFab: {
    position: "absolute",
    zIndex: 40,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15, 27, 36, 0.08)",
  },
});
