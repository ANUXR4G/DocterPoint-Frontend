import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { colors } from "@/lib/theme";

type Props = {
  text: string;
  style?: object;
  onDone?: () => void;
};

export function TypedText({ text, style, onDone }: Props) {
  const [shown, setShown] = useState("");
  const doneRef = useRef(false);

  useEffect(() => {
    doneRef.current = false;
    setShown("");
    let i = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) {
        if (!doneRef.current) {
          doneRef.current = true;
          onDone?.();
        }
        return;
      }
      const ch = text[i - 1];
      const delay =
        ch === " " ? 12 : ch === "." || ch === "?" || ch === "!" ? 90 : 22;
      timer = setTimeout(tick, delay);
    };

    timer = setTimeout(tick, 40);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [text, onDone]);

  return (
    <Text style={style}>
      {shown}
      {shown.length < text.length ? (
        <Text style={styles.cursor}>|</Text>
      ) : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  cursor: {
    color: colors.inkSoft,
    opacity: 0.6,
  },
});
