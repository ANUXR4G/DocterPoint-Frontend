import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { ClinicCard } from "@/components/mobile/ClinicCards";
import { ScreenHeader } from "@/components/mobile/ScreenHeader";
import { SearchBar } from "@/components/mobile/SearchBar";
import { SPECIALTIES, SpecialtyChips } from "@/components/mobile/SpecialtyRow";
import {
  EmptyState,
  ErrorText,
  Loading,
  PrimaryButton,
  Screen,
} from "@/components/ui";
import { api, getApiUrl } from "@/lib/api";
import {
  getCachedPractices,
  setCachedPractices,
} from "@/lib/dataCache";
import { dockClearance } from "@/lib/dockLayout";
import { colors, space } from "@/lib/theme";
import type { PracticeListItem } from "@/lib/types";

const SPECIALTY_QUERIES = new Set<string>(SPECIALTIES.map((s) => s.query));

export default function DoctorsScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const initial = params.q ?? "";
  const [text, setText] = useState(SPECIALTY_QUERIES.has(initial) ? "" : initial);
  const [specialty, setSpecialty] = useState<string | undefined>(
    SPECIALTY_QUERIES.has(initial) ? initial : undefined,
  );
  const [practices, setPractices] = useState<PracticeListItem[]>(
    () => (!params.q ? getCachedPractices() ?? [] : []),
  );
  const [loading, setLoading] = useState(
    () => Boolean(params.q) || !getCachedPractices(),
  );
  const [error, setError] = useState("");
  const loadGen = useRef(0);

  const query = (text.trim() || specialty || "").trim();

  const load = useCallback(async (q: string, opts?: { soft?: boolean }) => {
    const soft = Boolean(opts?.soft);
    if (soft && !q) {
      const cached = getCachedPractices();
      if (cached) {
        setPractices(cached);
        setLoading(false);
        return;
      }
    }
    const gen = ++loadGen.current;
    setLoading(true);
    setError("");
    const res = await api<PracticeListItem[]>(
      `/procto/practices${q ? `?${new URLSearchParams({ q })}` : ""}`,
    );
    if (gen !== loadGen.current) return;
    setLoading(false);
    if (res.status !== "successful") {
      setError(`${res.message || "Failed to load clinics"} (API: ${getApiUrl()})`);
      return;
    }
    const next = Array.isArray(res.data) ? res.data : [];
    setPractices(next);
    if (!q) setCachedPractices(next);
  }, []);

  useEffect(() => {
    const next = params.q ?? "";
    if (SPECIALTY_QUERIES.has(next)) {
      setSpecialty(next);
      setText("");
    } else {
      setText(next);
    }
  }, [params.q]);

  useEffect(() => {
    const t = setTimeout(() => void load(query, { soft: true }), text ? 350 : 0);
    return () => clearTimeout(t);
  }, [query, text, load]);

  return (
    <Screen style={styles.screen}>
      <ScreenHeader title="Find a clinic" />
      <FlatList
        data={practices}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <SearchBar
              value={text}
              onChangeText={(t) => {
                setText(t);
                if (t.trim()) setSpecialty(undefined);
              }}
              placeholder="Search doctor, clinic or city…"
              onSubmit={() => void load(query)}
            />
            <View style={styles.chips}>
              <SpecialtyChips
                active={specialty}
                onSelect={(q) => {
                  setSpecialty(q);
                  setText("");
                }}
              />
            </View>
            <ErrorText text={error} />
            {error ? (
              <View style={{ marginTop: space.sm }}>
                <PrimaryButton label="Retry" onPress={() => void load(query)} busy={loading} />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <Loading />
          ) : error ? (
            <EmptyState text="Could not load clinics. Check your connection and retry." />
          ) : (
            <EmptyState text="No clinics found. Try another search or specialty." />
          )
        }
        renderItem={({ item }) => <ClinicCard item={item} />}
        ListFooterComponent={
          !loading && !error && practices.length > 0 ? (
            <Text style={styles.count}>
              {practices.length} clinic{practices.length === 1 ? "" : "s"}
            </Text>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.paper,
  },
  content: {
    paddingHorizontal: space.xl,
    paddingTop: space.xs,
    paddingBottom: dockClearance + space.xl,
  },
  header: {
    marginBottom: space.lg,
  },
  chips: {
    marginTop: space.lg,
  },
  separator: {
    height: space.lg,
  },
  count: {
    textAlign: "center",
    marginTop: space.xl,
    fontSize: 12,
    color: colors.inkFaint,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
});
