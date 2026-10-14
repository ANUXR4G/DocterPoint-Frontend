import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";

const STORE_KEY = "gg.careTheme";

export type CarePalette = {
  id: string;
  name: string;
  swatch: string;
  paper: string;
  card: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  welcome: string;
  visit: string;
  visitInk: string;
  task: string;
  taskInk: string;
  people: string;
  peopleInk: string;
  alert: string;
  alertInk: string;
  stable: string;
  attention: string;
};

export const CARE_THEMES: CarePalette[] = [
  {
    id: "peach",
    name: "Peach",
    swatch: "#F4A261",
    paper: "#F6F3EE",
    card: "#FFFFFF",
    ink: "#1C1C1E",
    muted: "#8A8A8E",
    line: "#ECE7E1",
    accent: "#F5C451",
    welcome: "#F8CDB6",
    visit: "#FFF1E4",
    visitInk: "#E08A3C",
    task: "#E7F8EE",
    taskInk: "#3CB87A",
    people: "#E8F1FF",
    peopleInk: "#6AA6F5",
    alert: "#FFECEE",
    alertInk: "#E07A8A",
    stable: "#3DDC97",
    attention: "#F4A6B0",
  },
  {
    id: "mint",
    name: "Mint",
    swatch: "#3CB87A",
    paper: "#F3F7F4",
    card: "#FFFFFF",
    ink: "#1C1C1E",
    muted: "#8A8A8E",
    line: "#E3EEE6",
    accent: "#7DCEA0",
    welcome: "#CDEBD8",
    visit: "#E7F8EE",
    visitInk: "#2E9B62",
    task: "#E5F6F4",
    taskInk: "#2A9D8F",
    people: "#E8F1FF",
    peopleInk: "#6AA6F5",
    alert: "#FFF6E8",
    alertInk: "#E09A3C",
    stable: "#3DDC97",
    attention: "#F4A6B0",
  },
  {
    id: "sky",
    name: "Sky",
    swatch: "#6AA6F5",
    paper: "#F3F6FA",
    card: "#FFFFFF",
    ink: "#1C1C1E",
    muted: "#8A8A8E",
    line: "#E3EAF3",
    accent: "#8EBEFF",
    welcome: "#C9DFFB",
    visit: "#E8F1FF",
    visitInk: "#4C8FE0",
    task: "#E7F8EE",
    taskInk: "#3CB87A",
    people: "#EEEAFE",
    peopleInk: "#8B7CFF",
    alert: "#FFECEE",
    alertInk: "#E07A8A",
    stable: "#3DDC97",
    attention: "#F4A6B0",
  },
  {
    id: "lavender",
    name: "Lavender",
    swatch: "#A78BFA",
    paper: "#F6F4FA",
    card: "#FFFFFF",
    ink: "#1C1C1E",
    muted: "#8A8A8E",
    line: "#E8E3F0",
    accent: "#C4B5FD",
    welcome: "#E4D7FB",
    visit: "#F3EEFF",
    visitInk: "#8B6FE0",
    task: "#E7F8EE",
    taskInk: "#3CB87A",
    people: "#E8F1FF",
    peopleInk: "#6AA6F5",
    alert: "#FFECEE",
    alertInk: "#E07A8A",
    stable: "#3DDC97",
    attention: "#F4A6B0",
  },
  {
    id: "slate",
    name: "Slate",
    swatch: "#64748B",
    paper: "#F4F5F7",
    card: "#FFFFFF",
    ink: "#1C1C1E",
    muted: "#8A8A8E",
    line: "#E6E8EC",
    accent: "#94A3B8",
    welcome: "#D5DCE6",
    visit: "#EEF2F6",
    visitInk: "#64748B",
    task: "#E7F8EE",
    taskInk: "#3CB87A",
    people: "#E8F1FF",
    peopleInk: "#6AA6F5",
    alert: "#FFECEE",
    alertInk: "#E07A8A",
    stable: "#3DDC97",
    attention: "#F4A6B0",
  },
];

type ThemeValue = {
  theme: CarePalette;
  setThemeId: (id: string) => void;
};

const CareThemeContext = createContext<ThemeValue>({
  theme: CARE_THEMES[0],
  setThemeId: () => {},
});

export function CareThemeProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState(CARE_THEMES[0].id);

  useEffect(() => {
    void SecureStore.getItemAsync(STORE_KEY).then((saved) => {
      if (saved && CARE_THEMES.some((t) => t.id === saved)) setId(saved);
    });
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({
      theme: CARE_THEMES.find((t) => t.id === id) ?? CARE_THEMES[0],
      setThemeId: (next) => {
        setId(next);
        void SecureStore.setItemAsync(STORE_KEY, next);
      },
    }),
    [id],
  );

  return (
    <CareThemeContext.Provider value={value}>
      {children}
    </CareThemeContext.Provider>
  );
}

export function useCareTheme() {
  return useContext(CareThemeContext);
}

export function ThemeSwatches() {
  const { theme, setThemeId } = useCareTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: theme.ink }]}>Colour theme</Text>
      <Text style={[styles.hint, { color: theme.muted }]}>
        Saved in Settings. Home, Patients, and the tab bar use this colour.
      </Text>
      <View style={styles.row}>
        {CARE_THEMES.map((item) => {
          const selected = item.id === theme.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.name}
              accessibilityState={{ selected }}
              onPress={() => setThemeId(item.id)}
              style={styles.choice}
            >
              <View
                style={[
                  styles.dot,
                  { backgroundColor: item.swatch },
                  selected && { borderColor: theme.ink, borderWidth: 2 },
                ]}
              />
              <Text style={[styles.name, { color: theme.ink }]}>{item.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 20 },
  title: { fontSize: 16, fontWeight: "700" },
  hint: { marginTop: 4, fontSize: 13 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 14 },
  choice: { alignItems: "center", width: 64 },
  dot: { width: 36, height: 36, borderRadius: 18 },
  name: { marginTop: 6, fontSize: 11, fontWeight: "600" },
});
