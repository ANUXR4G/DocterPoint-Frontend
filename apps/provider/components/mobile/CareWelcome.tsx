import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CareClockScene,
  CareIconTile,
  CarePill,
  type CareGlyphName,
} from "@/components/mobile/careArt";
import { useCareTheme } from "@/lib/careTheme";
import { AnimatedView } from "@/lib/motion";

const FOCUS: {
  title: string;
  hint: string;
  glyph: CareGlyphName;
  tone: "visit" | "task" | "people";
}[] = [
  { title: "Care Visits", hint: "View upcoming visits.", glyph: "calendar", tone: "visit" },
  { title: "Daily Tasks", hint: "View upcoming visits.", glyph: "checklist", tone: "task" },
  { title: "Patient Care", hint: "View upcoming visits.", glyph: "person", tone: "people" },
];

function todayLine(now = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(now);
}

export function CareWelcome({
  name,
  onContinue,
  onFocus,
}: {
  name?: string;
  onContinue: () => void;
  onFocus: (title: string) => void;
}) {
  const { theme } = useCareTheme();
  const insets = useSafeAreaInsets();
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const inkFor = { visit: theme.visitInk, task: theme.taskInk, people: theme.peopleInk };

  return (
    <View style={[styles.root, { backgroundColor: "#fff", paddingTop: insets.top + 8 }]}>
      <View style={[styles.hero, { backgroundColor: theme.welcome }]}>
        <Text style={[styles.date, { color: theme.ink }]}>{todayLine()}</Text>
        <Text style={[styles.hello, { color: theme.ink }]}>
          {greet}
          {name ? `, ${name}` : ""}
        </Text>
        {FOCUS.map((item, index) => (
          <AnimatedView key={item.title} from="up" delay={60 + index * 60}>
            <Pressable
              onPress={() => onFocus(item.title)}
              style={[styles.card, { backgroundColor: "#fff" }]}
            >
              <CareIconTile
                name={item.glyph}
                background={theme[item.tone]}
                color={inkFor[item.tone]}
                size={34}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: theme.ink }]}>{item.title}</Text>
                <Text style={[styles.cardHint, { color: theme.muted }]}>{item.hint}</Text>
              </View>
            </Pressable>
          </AnimatedView>
        ))}
        <View style={styles.clock}>
          <CareClockScene color={theme.visitInk} />
        </View>
      </View>

      <View style={styles.copy}>
        <CarePill label="Care made simple" />
        <Text style={[styles.question, { color: theme.ink }]}>
          What would you like to{"\n"}focus on today?
        </Text>
        <Text style={[styles.sub, { color: theme.muted }]}>
          Choose what you need help with so we can personalize your care experience.
        </Text>
      </View>

      <Pressable
        onPress={onContinue}
        style={[styles.continue, { backgroundColor: theme.ink, marginBottom: Math.max(insets.bottom, 16) }]}
      >
        <Text style={styles.continueText}>Continue</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 18 },
  hero: {
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingTop: 16,
    overflow: "hidden",
  },
  date: { fontSize: 12, fontWeight: "500" },
  hello: { marginTop: 2, marginBottom: 12, fontSize: 20, fontWeight: "700" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: "700" },
  cardHint: { fontSize: 12, marginTop: 1 },
  clock: { marginTop: -8, marginBottom: -18 },
  copy: { alignItems: "center", paddingTop: 28, paddingHorizontal: 8 },
  question: {
    marginTop: 16,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
    lineHeight: 34,
    textAlign: "center",
  },
  sub: { marginTop: 10, fontSize: 14, lineHeight: 20, textAlign: "center" },
  continue: {
    marginTop: "auto",
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  continueText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
