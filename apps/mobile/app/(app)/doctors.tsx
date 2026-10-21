import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ClinicCard, clinicDoctorCards } from "@/components/mobile/ClinicCards";
import { SearchBar } from "@/components/mobile/SearchBar";
import { SpecialtyChips } from "@/components/mobile/SpecialtyRow";
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
import { useCareTheme } from "@/lib/careTheme";
import { contentBottomPad, safeTopInset } from "@/lib/dockLayout";
import { space } from "@/lib/theme";
import type { PracticeListItem } from "@/lib/types";

export default function DoctorsScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useCareTheme();
  const params = useLocalSearchParams<{ q?: string; specialty?: string }>();
  const paramText = Array.isArray(params.q) ? params.q[0] : params.q;
  const paramSpecialty = Array.isArray(params.specialty)
    ? params.specialty[0]
    : params.specialty;
  const [text, setText] = useState(paramText ?? "");
  const [specialty, setSpecialty] = useState<string | undefined>(paramSpecialty);
  const [practices, setPractices] = useState<PracticeListItem[]>(
    () => (!params.q ? getCachedPractices() ?? [] : []),
  );
  const [loading, setLoading] = useState(
    () => Boolean(params.q) || !getCachedPractices(),
  );
  const [error, setError] = useState("");
  const loadGen = useRef(0);

  const query = text.trim();

  const load = useCallback(async (q: string, specialtyName: string | undefined, opts?: { soft?: boolean }) => {
    const soft = Boolean(opts?.soft);
    if (soft && !q && !specialtyName) {
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
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (specialtyName) params.set("specialty", specialtyName);
    const qs = params.toString();
    const res = await api<PracticeListItem[]>(
      `/procto/practices${qs ? `?${qs}` : ""}`,
    );
    if (gen !== loadGen.current) return;
    setLoading(false);
    if (res.status !== "successful") {
      setError(`${res.message || "Failed to load clinics"} (API: ${getApiUrl()})`);
      return;
    }
    const next = Array.isArray(res.data) ? res.data : [];
    setPractices(next);
    if (!q && !specialtyName) setCachedPractices(next);
  }, []);

  useEffect(() => {
    setText(paramText ?? "");
    setSpecialty(paramSpecialty);
  }, [paramText, paramSpecialty]);

  useEffect(() => {
    const t = setTimeout(() => void load(query, specialty, { soft: true }), text ? 350 : 0);
    return () => clearTimeout(t);
  }, [query, specialty, text, load]);

  return (
    <Screen style={{ backgroundColor: theme.paper }}>
      <FlatList
        data={clinicDoctorCards(practices)}
        keyExtractor={(d) => d.key}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: safeTopInset(insets.top) + 8,
            paddingBottom: contentBottomPad(insets.bottom),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.ink }]}>Clinics</Text>
            <SearchBar
              value={text}
              onChangeText={(t) => {
                setText(t);
                if (t.trim()) setSpecialty(undefined);
              }}
              placeholder="Search doctor, clinic or city…"
              onSubmit={() => void load(query, specialty)}
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
                <PrimaryButton label="Retry" onPress={() => void load(query, specialty)} busy={loading} />
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
        renderItem={({ item }) => (
          <ClinicCard
            item={item.item}
            doctorUserId={item.doctorUserId}
            doctorName={item.doctorName}
          />
        )}
        ListFooterComponent={
          !loading && !error && practices.length > 0 ? (
            <Text style={[styles.count, { color: theme.muted }]}>
              {clinicDoctorCards(practices).length} doctor
              {clinicDoctorCards(practices).length === 1 ? "" : "s"}
            </Text>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -0.8,
    marginBottom: 16,
  },
  chips: {
    marginTop: 14,
  },
  separator: {
    height: space.lg,
  },
  count: {
    textAlign: "center",
    marginTop: space.xl,
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
});
