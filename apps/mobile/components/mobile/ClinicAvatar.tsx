import { useEffect, useState } from "react";
import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors } from "@/lib/theme";

type Props = {
  name: string;
  uri?: string | null;
  size: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  backgroundColor?: string;
  textColor?: string;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";
}

/** Clinic/doctor avatar — photo when available, initials fallback. */
export function ClinicAvatar({
  name,
  uri,
  size,
  radius,
  style,
  imageStyle,
  backgroundColor = colors.brandMist,
  textColor = colors.brand,
}: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  const showImage = Boolean(uri) && !failed;
  const borderRadius = radius ?? Math.round(size * 0.28);

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor,
        },
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: uri! }}
          style={[
            {
              width: size,
              height: size,
              borderRadius,
            },
            imageStyle,
          ]}
          onError={() => setFailed(true)}
          accessibilityLabel={`${name} photo`}
        />
      ) : (
        <Text
          style={[
            styles.initials,
            {
              color: textColor,
              fontSize: Math.max(12, Math.round(size * 0.32)),
            },
          ]}
        >
          {initials(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  initials: {
    fontWeight: "800",
  },
});
