import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
import {
  hexToHsv,
  hsvToHex,
  isHexColor,
  type Hsv,
} from "@/lib/colorWheel";

const SIZE = 248;
const RING = 28;
const SQUARE = 128;
const PAD = 10;
const OUTER = SIZE / 2 - PAD;
const INNER = OUTER - RING;
const SEGMENTS = 180;

type Props = {
  color: string;
  onChange: (hex: string) => void;
};

function wedge(index: number) {
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const a0 = (index / SEGMENTS) * Math.PI * 2 - Math.PI / 2;
  const a1 = ((index + 1) / SEGMENTS) * Math.PI * 2 - Math.PI / 2;
  const at = (radius: number, angle: number) =>
    `${cx + Math.cos(angle) * radius} ${cy + Math.sin(angle) * radius}`;
  return `M ${at(INNER, a0)} L ${at(OUTER, a0)} A ${OUTER} ${OUTER} 0 0 1 ${at(OUTER, a1)} L ${at(INNER, a1)} A ${INNER} ${INNER} 0 0 0 ${at(INNER, a0)} Z`;
}

/** Hue ring with a saturation square. Red sits at the top; the square is saturated on the left. */
export function ColorWheel({ color, onChange }: Props) {
  const dragging = useRef(false);
  const [hsv, setHsv] = useState<Hsv>(() =>
    isHexColor(color) ? hexToHsv(color) : { h: 0, s: 1, v: 1 },
  );
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (dragging.current || !isHexColor(color)) return;
    const next = hexToHsv(color);
    hsvRef.current = next;
    setHsv(next);
  }, [color]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          dragging.current = true;
          paint(event.nativeEvent.locationX, event.nativeEvent.locationY);
        },
        onPanResponderMove: (event) => {
          paint(event.nativeEvent.locationX, event.nativeEvent.locationY);
        },
        onPanResponderRelease: () => {
          dragging.current = false;
        },
        onPanResponderTerminate: () => {
          dragging.current = false;
        },
      }),
    [],
  );

  function paint(x: number, y: number) {
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const origin = (SIZE - SQUARE) / 2;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy);
    const current = hsvRef.current;
    let next = current;
    if (
      x >= origin &&
      x <= origin + SQUARE &&
      y >= origin &&
      y <= origin + SQUARE
    ) {
      next = {
        ...current,
        s: 1 - (x - origin) / SQUARE,
        v: 1 - (y - origin) / SQUARE,
      };
    } else if (dist >= INNER - 6 && dist <= OUTER + 8) {
      const hue = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
      next = { ...current, h: hue };
    } else {
      return;
    }
    hsvRef.current = next;
    setHsv(next);
    onChangeRef.current(hsvToHex(next.h, next.s, next.v));
  }

  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const ringMid = (INNER + OUTER) / 2;
  const origin = (SIZE - SQUARE) / 2;
  const current = hsvToHex(hsv.h, hsv.s, hsv.v);
  const hueColor = hsvToHex(hsv.h, 1, 1);
  const hueRad = (hsv.h * Math.PI) / 180;
  const hueX = cx + Math.sin(hueRad) * ringMid;
  const hueY = cy - Math.cos(hueRad) * ringMid;
  const satX = origin + (1 - hsv.s) * SQUARE;
  const satY = origin + (1 - hsv.v) * SQUARE;

  return (
    <View
      accessibilityLabel="Custom theme colour"
      style={styles.box}
      {...pan.panHandlers}
    >
      <Svg width={SIZE} height={SIZE}>
        {Array.from({ length: SEGMENTS }, (_, index) => (
          <Path
            key={index}
            d={wedge(index)}
            fill={hsvToHex((index / SEGMENTS) * 360, 1, 1)}
          />
        ))}
        <Defs>
          <LinearGradient id="satFade" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={hueColor} />
            <Stop offset="1" stopColor="#ffffff" />
          </LinearGradient>
          <LinearGradient id="valFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000000" stopOpacity="0" />
            <Stop offset="1" stopColor="#000000" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect
          x={origin}
          y={origin}
          width={SQUARE}
          height={SQUARE}
          fill="url(#satFade)"
        />
        <Rect
          x={origin}
          y={origin}
          width={SQUARE}
          height={SQUARE}
          fill="url(#valFade)"
        />
      </Svg>
      <View
        pointerEvents="none"
        style={[styles.thumb, { left: hueX - 11, top: hueY - 11, backgroundColor: hueColor }]}
      />
      <View
        pointerEvents="none"
        style={[styles.thumb, { left: satX - 11, top: satY - 11, backgroundColor: current }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: "#ECECEC",
    alignSelf: "flex-start",
  },
  thumb: {
    position: "absolute",
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});
