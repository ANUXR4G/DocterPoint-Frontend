import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ClinicGridCard } from "@/components/mobile/ClinicCards";
import { MobileHomeHeader } from "@/components/mobile/MobileHomeHeader";
import { SearchBar } from "@/components/mobile/SearchBar";
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
import { colors, space } from "@/lib/theme";
import type { PracticeListItem } from "@/lib/types";

export default function DoctorsScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const [q, setQ] = useState(params.q ?? "");
  const [practices, setPractices] = useState<PracticeListItem[]>(
    () => (!params.q ? getCachedPractices() ?? [] : []),
  );
  const [loading, setLoading] = useState(
    () => Boolean(params.q) || !getCachedPractices(),
  );
  const [error, setError] = useState("");

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    const soft = Boolean(opts?.soft);
    const searchParams = new URLSearchParams();
    if (q.trim()) searchParams.set("q", q.trim());
    const qs = searchParams.toString();

    if (soft && !qs) {
      const cached = getCachedPractices();
      if (cached) {
        setPractices(cached);
        setLoading(false);
        return;
      }
    }

    if (!soft) setLoading(true);
    setError("");
    const res = await api<PracticeListItem[]>(
      `/procto/practices${qs ? `?${qs}` : ""}`,
    );
    if (!soft) setLoading(false);
    if (res.status !== "successful") {
      if (!soft) {
        setError(
          `${res.message || "Failed to load clinics"} (API: ${getApiUrl()})`,
        );
      }
      return;
    }
    const next = Array.isArray(res.data) ? res.data : [];
    setPractices(next);
    if (!qs) setCachedPractices(next);
  }, [q]);

  useEffect(() => {
    setQ(params.q ?? "");
  }, [params.q]);

  useEffect(() => {
    void load({ soft: true });
  }, [load]);

  return (
    <Screen style={styles.screen}>
      <MobileHomeHeader title="Find clinics" showProfile={false} />
      <FlatList
        data={practices}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <SearchBar
              value={q}
              onChangeText={setQ}
              placeholder="Search clinic, specialty, or city"
              onSubmit={() => void load()}
            />
            <View style={{ marginTop: space.lg }}>
              <PrimaryButton label="Search" onPress={() => void load()} busy={loading} />
            </View>
            <ErrorText text={error} />
            {error ? (
              <View style={{ marginTop: space.md }}>
                <PrimaryButton label="Retry" onPress={() => void load()} busy={loading} />
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
            <EmptyState text="No clinics found. Try another search." />
          )
        }
        renderItem={({ item }) => <ClinicGridCard item={item} />}
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
    padding: space.xl,
    paddingBottom: 100,
  },
  header: {
    marginBottom: space.xl,
  },
  separator: {
    height: space.md,
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
