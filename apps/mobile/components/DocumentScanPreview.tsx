import { useEffect, useRef } from "react";
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";
import { colors, space } from "@/lib/theme";

type Props = {
  source: ImageSourcePropType;
  fileName?: string;
  scanning?: boolean;
};

export function DocumentScanPreview({
  source,
  fileName,
  scanning = false,
}: Props) {
  const scanY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!scanning) {
      scanY.setValue(0);
      return;
    }

    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scanY, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(scanY, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [scanning, scanY]);

  const translateY = scanY.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 140],
  });

  return (
    <View style={styles.wrap}>
      <Image source={source} style={styles.image} resizeMode="contain" />
      {scanning ? (
        <>
          <View style={styles.overlay} />
          <Animated.View
            style={[styles.scanLine, { transform: [{ translateY }] }]}
          />
          <Text style={styles.scanLabel}>Scanning…</Text>
        </>
      ) : null}
      {fileName ? (
        <Text style={styles.fileName} numberOfLines={1}>
          {fileName}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
  },
  image: {
    width: "100%",
    height: 160,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(15, 92, 92, 0.08)",
  },
  scanLine: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 8,
    height: 3,
    backgroundColor: colors.brand,
    shadowColor: colors.brand,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 4,
  },
  scanLabel: {
    position: "absolute",
    bottom: space.sm,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.white,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  fileName: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    fontSize: 11,
    color: colors.inkSoft,
  },
});
