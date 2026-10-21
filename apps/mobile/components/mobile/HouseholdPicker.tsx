import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { api, setRefreshToken, setToken } from "@/lib/api";
import { useCareTheme } from "@/lib/careTheme";
import { clearDataCache } from "@/lib/dataCache";
import { colors, space } from "@/lib/theme";

type Person = {
  id: string;
  name: string;
  relationship: string | null;
  kind: "self" | "child";
  withName: string | null;
};

export function HouseholdPicker({ onSwitched }: { onSwitched?: () => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [currentId, setCurrentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await api<{ people?: Person[]; currentId?: string }>("/patient/household");
    if (res.status !== "successful" || !res.data) return;
    setPeople(Array.isArray(res.data.people) ? res.data.people : []);
    setCurrentId(res.data.currentId || "");
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { theme } = useCareTheme();
  const current = people.find((p) => p.id === currentId);
  if (people.length < 2 && !current?.withName) return null;

  async function open(id: string) {
    if (id === currentId || busy) return;
    setBusy(true);
    setError("");
    const res = await api("/patient/household/switch", {
      method: "POST",
      body: JSON.stringify({ patientUserId: id }),
    });
    const access = String(res.access_token || res.token || "");
    if (res.status !== "successful" || !access) {
      setBusy(false);
      setError(res.message || "Could not open that profile.");
      return;
    }
    clearDataCache();
    await setToken(access);
    if (res.refresh_token) await setRefreshToken(String(res.refresh_token));
    setCurrentId(id);
    setBusy(false);
    onSwitched?.();
    void load();
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.muted }]}>People on this number</Text>
      {current?.kind === "child" && current.withName ? (
        <Text style={[styles.with, { color: theme.ink }]}>Child · with {current.withName}</Text>
      ) : (
        <Text style={[styles.hint, { color: theme.muted }]}>
          A child on this number opens here. Another adult keeps their own record.
        </Text>
      )}
      <View style={styles.row}>
        {people.map((p) => {
          const active = p.id === currentId;
          const label = p.kind === "child" ? `${p.name} · child` : p.name;
          return (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: busy }}
              disabled={busy}
              onPress={() => void open(p.id)}
              style={[
                styles.chip,
                { backgroundColor: active ? theme.ink : theme.card },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? colors.white : theme.ink }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: space.md,
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
  with: {
    fontSize: 14,
    fontWeight: "600",
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "600",
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
});
