import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import {
  optionsForTab,
  PAIN_TOOL_TABS,
  scaleNameForTab,
  type PainToolOption,
  type PainToolTab,
  WONG_BAKER_OPTIONS,
} from "@/lib/painAssessmentTool";
import { colors, radii, space } from "@/lib/theme";

export type PainAssessmentSelection = {
  scale: string;
  score: string;
  label: string;
  tab: PainToolTab;
};

type Props = {
  open: boolean;
  initialTab?: PainToolTab;
  initialScore?: string;
  onClose: () => void;
  onSave: (selection: PainAssessmentSelection) => void;
};

const TEAL = "#0D9488";
const SLIDER_BLUE = "#3B82F6";
const SLIDER_TRACK = "#BFDBFE";

function LinearPainSlider({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number) => void;
}) {
  const [trackW, setTrackW] = useState(0);
  const n = value;
  const pct = n == null ? 0 : ((n - 1) / 9) * 100;

  function valueFromX(x: number) {
    if (trackW <= 0) return 1;
    const ratio = Math.min(1, Math.max(0, x / trackW));
    return Math.min(10, Math.max(1, Math.round(ratio * 9) + 1));
  }

  return (
    <View style={styles.linearSlider}>
      <View
        style={styles.linearTrackHit}
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => onChange(valueFromX(e.nativeEvent.locationX))}
        onResponderMove={(e) => onChange(valueFromX(e.nativeEvent.locationX))}
      >
        <View style={styles.linearTrackBg} />
        <View style={[styles.linearTrackFill, { width: `${pct}%` }]} />
        {n != null && trackW > 0 ? (
          <View
            style={[
              styles.linearThumb,
              { left: (pct / 100) * trackW - 10 },
            ]}
          />
        ) : null}
      </View>
      <View style={styles.linearNums}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => {
          const active = n === num;
          return (
            <Pressable
              key={num}
              onPress={() => onChange(num)}
              style={styles.linearNumBtn}
              hitSlop={6}
            >
              <Text
                style={[
                  styles.linearNumText,
                  active && styles.linearNumTextActive,
                ]}
              >
                {num}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function WongBakerFace({
  optionId,
  color,
  size = 52,
}: {
  optionId: string;
  color: string;
  size?: number;
}) {
  const mouth =
    optionId === "mild"
      ? "M20 38c4 8 20 8 24 0"
      : optionId === "moderate"
        ? "M20 40h24"
        : optionId === "moderate-high"
          ? "M22 44c3-5 17-5 20 0"
          : optionId === "severe"
            ? "M20 48c4-10 20-10 24 0"
            : "M18 50c5-14 23-14 28 0";

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Circle cx={32} cy={32} r={30} fill={color} />
      <Circle cx={22} cy={optionId === "mild" ? 26 : 28} r={3.2} fill="#fff" />
      <Circle cx={42} cy={optionId === "mild" ? 26 : 28} r={3.2} fill="#fff" />
      {(optionId === "severe" || optionId === "worst") && (
        <Path
          d="M17 22c3-3 8-2 10 1M37 23c2-3 7-3 10 0"
          fill="none"
          stroke="#fff"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      )}
      {optionId === "moderate-high" && (
        <Path
          d="M18 24c2-2 6-2 8 0M38 24c2-2 6-2 8 0"
          fill="none"
          stroke="#fff"
          strokeWidth={2}
          strokeLinecap="round"
        />
      )}
      <Path
        d={mouth}
        fill="none"
        stroke="#fff"
        strokeWidth={optionId === "worst" ? 3.2 : 3}
        strokeLinecap="round"
      />
      {optionId === "worst" && (
        <>
          <Path
            d="M18 34c0 4 2 7 4 8c-3-1-5-4-5-7z"
            fill="#BFDBFE"
          />
          <Path
            d="M46 34c0 4-2 7-4 8c3-1 5-4 5-7z"
            fill="#BFDBFE"
          />
        </>
      )}
    </Svg>
  );
}

export default function PainAssessmentToolModal({
  open,
  initialTab = "wong-baker",
  initialScore = "",
  onClose,
  onSave,
}: Props) {
  const [tab, setTab] = useState<PainToolTab>(initialTab);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    const opts = optionsForTab(initialTab);
    const hit =
      opts.find((o) => o.score === initialScore || o.label === initialScore) ??
      null;
    setSelectedId(hit?.id ?? null);
  }, [open, initialTab, initialScore]);

  const options = optionsForTab(tab);
  const selected: PainToolOption | undefined = options.find(
    (o) => o.id === selectedId,
  );
  const canSave = Boolean(selected);

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Pain Assessment Tool</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabs}
          >
            {PAIN_TOOL_TABS.map((t) => {
              const active = tab === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    setTab(t.id);
                    setSelectedId(null);
                  }}
                  style={[styles.tab, active && styles.tabActive]}
                >
                  <Text
                    style={[styles.tabText, active && styles.tabTextActive]}
                    numberOfLines={2}
                  >
                    {t.label.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.body}>
            {tab === "wong-baker" ? (
              <View style={styles.facesRow}>
                {WONG_BAKER_OPTIONS.map((opt) => {
                  const active = selectedId === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => setSelectedId(opt.id)}
                      style={[styles.faceCard, active && styles.faceCardActive]}
                    >
                      <WongBakerFace
                        optionId={opt.id}
                        color={opt.color || TEAL}
                      />
                      <Text style={styles.faceLabel}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : tab === "linear" ? (
              <LinearPainSlider
                value={
                  selectedId && /^\d+$/.test(selectedId)
                    ? Number(selectedId)
                    : null
                }
                onChange={(num) => setSelectedId(String(num))}
              />
            ) : (
              <View style={styles.activityWrap}>
                {options.map((opt, i) => {
                  const active = selectedId === opt.id;
                  const bgs = [
                    "#ECFDF5",
                    "#EFF6FF",
                    "#FFFBEB",
                    "#FFF7ED",
                    "#FFF1F2",
                  ];
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => setSelectedId(opt.id)}
                      style={[
                        styles.activityCard,
                        { backgroundColor: bgs[i] ?? "#fff" },
                        active && styles.faceCardActive,
                      ]}
                    >
                      <Text style={styles.activityLabel}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.footer}>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.cancel}>CANCEL</Text>
            </Pressable>
            <Pressable
              disabled={!canSave}
              onPress={() => {
                if (!selected) return;
                onSave({
                  scale: scaleNameForTab(tab),
                  score: selected.score,
                  label: selected.label,
                  tab,
                });
              }}
              style={[styles.save, !canSave && styles.saveDisabled]}
            >
              <Text style={styles.saveText}>SAVE SELECTION</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: space.md,
  },
  sheet: {
    backgroundColor: colors.paperRaised,
    borderRadius: radii.lg,
    maxHeight: "90%",
    overflow: "hidden",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  tabs: {
    paddingHorizontal: space.md,
    gap: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.lineStrong,
    paddingBottom: 0,
  },
  tab: {
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    maxWidth: 140,
  },
  tabActive: {
    borderBottomColor: TEAL,
  },
  tabText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.inkSoft,
    letterSpacing: 0.3,
  },
  tabTextActive: {
    color: TEAL,
  },
  body: {
    padding: space.lg,
    minHeight: 160,
  },
  facesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: space.sm,
  },
  faceCard: {
    width: 96,
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  faceCardActive: {
    borderColor: TEAL,
    borderWidth: 2,
  },
  faceLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.ink,
    textAlign: "center",
  },
  linearSlider: {
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 4,
  },
  linearTrackHit: {
    height: 28,
    justifyContent: "center",
  },
  linearTrackBg: {
    height: 3,
    borderRadius: 2,
    backgroundColor: SLIDER_TRACK,
  },
  linearTrackFill: {
    position: "absolute",
    left: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: SLIDER_BLUE,
  },
  linearThumb: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: SLIDER_BLUE,
    top: 4,
  },
  linearNums: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  linearNumBtn: {
    width: 28,
    alignItems: "center",
  },
  linearNumText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.inkFaint,
  },
  linearNumTextActive: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
  },
  activityWrap: {
    gap: space.sm,
  },
  activityCard: {
    padding: space.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  activityLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineStrong,
  },
  cancel: {
    color: TEAL,
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 0.5,
  },
  save: {
    backgroundColor: TEAL,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radii.sm,
  },
  saveDisabled: {
    backgroundColor: "#D1D5DB",
  },
  saveText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 0.5,
  },
});
