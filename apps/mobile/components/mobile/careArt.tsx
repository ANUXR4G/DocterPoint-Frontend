import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
import { useCareTheme } from "@/lib/careTheme";

export type CareGlyphName =
  | "home"
  | "calendar"
  | "checklist"
  | "person"
  | "people"
  | "bell"
  | "bolt"
  | "note"
  | "heart"
  | "video"
  | "expand"
  | "search"
  | "settings";

export function CareGlyph({
  name,
  size = 18,
  color = "#fff",
}: {
  name: CareGlyphName;
  size?: number;
  color?: string;
}) {
  const p = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
  };
  const stroke = {
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "home":
      return (
        <Svg {...p}>
          <Path d="M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8.8Z" {...stroke} />
        </Svg>
      );
    case "calendar":
      return (
        <Svg {...p}>
          <Rect x="3.5" y="5" width="17" height="15.5" rx="3" {...stroke} />
          <Path d="M3.5 10h17M8 3.5v3.5M16 3.5v3.5" {...stroke} />
        </Svg>
      );
    case "checklist":
      return (
        <Svg {...p}>
          <Rect x="4" y="3.5" width="16" height="17" rx="3" {...stroke} />
          <Path d="M8 9.5l1.6 1.6L13 8M8 15h8" {...stroke} />
        </Svg>
      );
    case "person":
      return (
        <Svg {...p}>
          <Circle cx="12" cy="8" r="3" {...stroke} />
          <Path d="M6 19.5c1.2-3 3.4-4.5 6-4.5s4.8 1.5 6 4.5" {...stroke} />
        </Svg>
      );
    case "people":
      return (
        <Svg {...p}>
          <Circle cx="9" cy="8" r="2.6" {...stroke} />
          <Circle cx="16" cy="9" r="2.2" {...stroke} />
          <Path d="M4.5 19c.8-2.8 2.6-4.2 4.8-4.2 2.1 0 3.8 1.3 4.6 3.6" {...stroke} />
          <Path d="M13 15.2c1.4-.6 2.8-.5 4.2.6 1 .8 1.6 2 1.8 3.2" {...stroke} />
        </Svg>
      );
    case "bell":
      return (
        <Svg {...p}>
          <Path d="M6 16.5h12l-1.2-2V10a4.8 4.8 0 0 0-9.6 0v4.5L6 16.5Z" {...stroke} />
          <Path d="M10 18.5a2 2 0 0 0 4 0" {...stroke} />
        </Svg>
      );
    case "bolt":
      return (
        <Svg {...p}>
          <Path d="M13 3 6 13h5l-1 8 8-11h-5l0-7Z" {...stroke} />
        </Svg>
      );
    case "note":
      return (
        <Svg {...p}>
          <Path d="M7 4.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V6A1.5 1.5 0 0 1 7 4.5Z" {...stroke} />
          <Path d="M14 4.8V9h4.2M8.5 13h7M8.5 16.5h5" {...stroke} />
        </Svg>
      );
    case "heart":
      return (
        <Svg {...p}>
          <Path
            d="M12 19s-6.5-3.8-6.5-8.2A3.4 3.4 0 0 1 12 8a3.4 3.4 0 0 1 6.5 2.8C18.5 15.2 12 19 12 19Z"
            {...stroke}
          />
        </Svg>
      );
    case "video":
      return (
        <Svg {...p}>
          <Rect x="3.5" y="7" width="12" height="10" rx="2" {...stroke} />
          <Path d="M15.5 11.2 20.5 8.5v7l-5-2.6" {...stroke} />
        </Svg>
      );
    case "search":
      return (
        <Svg {...p}>
          <Circle cx="11" cy="11" r="6" {...stroke} />
          <Path d="M15.5 15.5 20 20" {...stroke} />
        </Svg>
      );
    case "expand":
      return (
        <Svg {...p}>
          <Path d="M9 5H5v4M15 5h4v4M9 19H5v-4M15 19h4v-4" {...stroke} />
        </Svg>
      );
    case "settings":
      return (
        <Svg {...p}>
          <Circle cx="12" cy="12" r="3" {...stroke} />
          <Path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18" {...stroke} />
        </Svg>
      );
  }
}

export function CareIconTile({
  name,
  background,
  color,
  size = 36,
}: {
  name: CareGlyphName;
  background: string;
  color: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        backgroundColor: background,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <CareGlyph name={name} size={size * 0.52} color={color} />
    </View>
  );
}

/** Gold, mint, and sky rings with a white spark, matching the care tab. */
export function RainbowSparkle({ size = 54 }: { size?: number }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.06, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [scale]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={anim}>
      <Svg width={size} height={size} viewBox="0 0 54 54">
        <Circle cx="27" cy="27" r="27" fill="#F6C96A" />
        <Circle cx="27" cy="27" r="20" fill="#7DDCB8" />
        <Circle cx="27" cy="27" r="13" fill="#8EB7FF" />
        <Circle cx="27" cy="27" r="7.5" fill="#F7B6D2" />
        <Path
          d="M27 13.5l1.7 6.4 6.4 1.6-6.4 1.7L27 29.6l-1.7-6.4-6.4-1.7 6.4-1.6L27 13.5z"
          fill="#fff"
        />
      </Svg>
    </Animated.View>
  );
}

/** Orange alarm clock resting on clouds. */
export function CareClockScene({ color }: { color: string }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(
      withTiming(-8, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [y]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <View style={styles.clockWrap}>
      <Animated.View style={anim}>
        <Svg width={240} height={168} viewBox="0 0 240 168">
          <Path
            d="M18 132c16-34 48-52 78-38 10-24 46-34 70-14 24-20 64-8 68 20 18 2 30 18 24 34H30c-12 0-18-8-12-2z"
            fill="#fff"
            opacity={0.9}
          />
          <Path
            d="M86 72c-18-6-26-26-8-34"
            stroke={color}
            strokeWidth={7}
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d="M154 72c18-6 26-26 8-34"
            stroke={color}
            strokeWidth={7}
            fill="none"
            strokeLinecap="round"
          />
          <Circle cx="78" cy="40" r="5" fill={color} />
          <Circle cx="162" cy="40" r="5" fill={color} />
          <Rect x="78" y="64" width="84" height="72" rx="24" fill={color} />
          <Circle cx="120" cy="100" r="24" fill="#fff" />
          <Path d="M120 100V84" stroke="#1C1C1E" strokeWidth={2.6} strokeLinecap="round" />
          <Path d="M120 100l14-6" stroke="#1C1C1E" strokeWidth={2.6} strokeLinecap="round" />
          <Circle cx="120" cy="100" r="2.4" fill="#1C1C1E" />
          <Path
            d="M92 132l-10 12M148 132l10 12"
            stroke={color}
            strokeWidth={6}
            strokeLinecap="round"
          />
          <Path
            d="M6 146c22-24 54-20 72-4 12-18 46-20 62-2 20-18 56-12 70 8 16 2 28 14 20 24H14c-14-4-16-14-8-26z"
            fill="#fff"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

export function CarePill({ label }: { label: string }) {
  return (
    <View style={styles.pill}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="carePill" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#F08A62" />
            <Stop offset="1" stopColor="#7DDCB8" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" rx="14" fill="url(#carePill)" />
      </Svg>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

export function CareBar({
  color,
  track,
  ratio,
}: {
  color: string;
  track: string;
  ratio: number;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    const next = Math.max(0, Math.min(1, ratio));
    progress.value = withTiming(next, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [progress, ratio]);
  const fill = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));
  return (
    <View style={[styles.track, { backgroundColor: track }]}>
      <Animated.View
        style={[styles.fill, { backgroundColor: color }, fill]}
      />
    </View>
  );
}

export function CareStatCard({
  label,
  value,
  hint,
  background,
  ink,
  glyph,
  ratio,
  onPress,
}: {
  label: string;
  value: string;
  hint: string;
  background: string;
  ink: string;
  glyph: CareGlyphName;
  ratio: number;
  onPress: () => void;
}) {
  const { theme } = useCareTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.stat, { backgroundColor: theme.card }]}
    >
      <View style={styles.statTop}>
        <CareIconTile name={glyph} background={background} color={ink} size={28} />
        <Text style={[styles.statLabel, { color: theme.muted }]}>{label}</Text>
      </View>
      <Text style={[styles.statValue, { color: theme.ink }]}>{value}</Text>
      <CareBar color={ink} track={background} ratio={ratio} />
      <Text style={[styles.statHint, { color: theme.muted }]}>{hint}</Text>
    </Pressable>
  );
}

export function CareQuickAction({
  label,
  glyph,
  onPress,
}: {
  label: string;
  glyph: CareGlyphName;
  onPress: () => void;
}) {
  const { theme } = useCareTheme();
  return (
    <Pressable onPress={onPress} style={styles.action}>
      <View style={[styles.actionIcon, { backgroundColor: theme.card }]}>
        <CareGlyph name={glyph} size={20} color={theme.ink} />
      </View>
      <Text style={[styles.actionLabel, { color: theme.muted }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  clockWrap: { height: 176, alignItems: "center", justifyContent: "flex-end" },
  pill: {
    alignSelf: "flex-start",
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  track: {
    marginTop: 8,
    height: 4,
    borderRadius: 4,
    overflow: "hidden",
  },
  fill: {
    height: 4,
    width: "100%",
    borderRadius: 4,
    transformOrigin: "left",
  },
  stat: {
    width: "48%",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexGrow: 1,
  },
  statTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  statLabel: { flex: 1, fontSize: 13, fontWeight: "600" },
  statValue: { marginTop: 4, fontSize: 32, fontWeight: "700", letterSpacing: -1 },
  statHint: { marginTop: 6, fontSize: 12 },
  action: { alignItems: "center", width: 72 },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { marginTop: 6, fontSize: 11, fontWeight: "600", textAlign: "center" },
});
