import { StyleSheet, Text, View } from "react-native";
import { usePathname } from "expo-router";
import { usePractice } from "@/lib/practiceContext";
import { colors, space } from "@/lib/theme";

const TITLE_BY_PATH: { match: string; title: string }[] = [
  { match: "/dashboard", title: "Dashboard" },
  { match: "/queue", title: "Queue" },
  { match: "/appointments", title: "Appointments" },
  // Detail before list so /patients/:key is not titled only "Patients".
  { match: "/visit/", title: "Visit" },
  { match: "/patients/", title: "Patient" },
  { match: "/patients", title: "Patients" },
  { match: "/calendar", title: "Calendar" },
  { match: "/analytics", title: "Analytics" },
  { match: "/payments", title: "Payments" },
  { match: "/profile", title: "Account" },
  { match: "/subscriptions", title: "Subscription" },
  { match: "/schedule", title: "Hours & blocks" },
  { match: "/overrides", title: "Blocks" },
  { match: "/inbox", title: "Patient Support" },
  { match: "/notifications", title: "Notifications" },
  { match: "/queries", title: "Help" },
  { match: "/settings", title: "Settings" },
  { match: "/doctors", title: "Doctors" },
  { match: "/audit", title: "Audit log" },
];

function titleForPath(pathname: string): string {
  for (const row of TITLE_BY_PATH) {
    if (pathname.includes(row.match)) return row.title;
  }
  return "GlucoGuide";
}

/** Slim top bar: screen title + clinic name (nav is the bottom dock). */
export function AppTopBar() {
  const pathname = usePathname();
  const { membership } = usePractice();
  const title = titleForPath(pathname);
  const careRoot =
    ["/dashboard", "/patients", "/appointments", "/profile"].some(
      (part) => pathname === part || pathname.endsWith(part),
    ) && !pathname.includes("/patients/");
  if (careRoot) return null;

  return (
    <View style={styles.bar}>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {membership?.practice.name ?? "Clinic"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    backgroundColor: colors.paper,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  text: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.35,
  },
  sub: {
    marginTop: 1,
    fontSize: 12,
    color: colors.inkSoft,
  },
});
