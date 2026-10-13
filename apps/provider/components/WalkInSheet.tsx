import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Chip,
  ErrorText,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui";
import {
  createWalkIn,
  linkDeskPatient,
  registerDeskPatient,
  searchDeskPatients,
  type DeskPatient,
} from "@/lib/procto";
import { usePractice } from "@/lib/practiceContext";
import { practiceDateIso } from "@/lib/practiceTime";
import { colors, radii, space } from "@/lib/theme";
import {
  COUNTRY_DIALS,
  DEFAULT_COUNTRY,
  composeWhatsAppMsisdn,
  type CountryDial,
} from "@/lib/countries";

function isBookableDoctor(row: {
  role: string;
  isActive?: boolean;
  doctorId?: string | null;
}) {
  if (row.isActive === false) return false;
  if (row.role === "DOCTOR") return true;
  return row.role === "PRACTICE_OWNER" && Boolean(row.doctorId);
}
const GENDERS: Array<["male" | "female" | "others", string]> = [
  ["male", "Male"],
  ["female", "Female"],
  ["others", "Other"],
];
const RELATIONSHIPS = ["Spouse", "Child", "Parent", "Sibling", "Other"];

type Props = {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
};

function LookupStatus({ label, detail }: { label: string; detail?: string }) {
  return (
    <View style={styles.lookup} accessibilityRole="text">
      <ActivityIndicator color={colors.brand} />
      <View style={styles.lookupCopy}>
        <Text style={styles.lookupLabel}>{label}</Text>
        {detail ? <Text style={styles.lookupDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

function patientMeta(p: DeskPatient) {
  const gender =
    p.gender === "male" ? "Male" : p.gender === "female" ? "Female" : p.gender ? "Other" : null;
  return [p.age != null ? `${p.age} y` : null, gender, p.phone, p.relationship]
    .filter(Boolean)
    .join(" · ");
}

export function WalkInSheet({ visible, onClose, onAdded }: Props) {
  const insets = useSafeAreaInsets();
  const { membership } = usePractice();
  const practiceId = membership?.practice.id ?? "";
  const practiceName = membership?.practice.name ?? "this clinic";
  const myUserId = membership?.userId ?? "";
  const onlySelf = membership?.role === "DOCTOR";

  const doctors = useMemo(() => {
    return (membership?.practice.members ?? [])
      .filter(
        (row) =>
          isBookableDoctor(row) &&
          Boolean(row.userId) &&
          (!onlySelf || row.userId === myUserId),
      )
      .map((row) => ({
        id: row.userId,
        name: row.user?.name || row.user?.email || "Doctor",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [membership, onlySelf, myUserId]);

  const [providerId, setProviderId] = useState("");
  const [patient, setPatient] = useState<DeskPatient | null>(null);
  const [disease, setDisease] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DeskPatient[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState("");
  const [searchError, setSearchError] = useState("");
  const [mode, setMode] = useState<"search" | "register">("search");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<CountryDial>(DEFAULT_COUNTRY);
  const [countryOpen, setCountryOpen] = useState(false);
  const [gender, setGender] = useState<"" | "male" | "female" | "others">("");
  const [dob, setDob] = useState("");
  const [relationship, setRelationship] = useState("");
  const [needsRelationship, setNeedsRelationship] = useState(false);
  const [linkingId, setLinkingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const recordWait = Boolean(linkingId) || saving || submitting;
  const opened = useRef(false);

  useEffect(() => {
    if (!visible) {
      opened.current = false;
      return;
    }
    if (opened.current) return;
    opened.current = true;
    setMessage("");
    setPatient(null);
    setDisease("");
    setQuery("");
    setResults([]);
    setSearching(false);
    setSearched("");
    setSearchError("");
    setMode("search");
    setName("");
    setPhone("");
    setCountry(DEFAULT_COUNTRY);
    setCountryOpen(false);
    setGender("");
    setDob("");
    setRelationship("");
    setNeedsRelationship(false);
    setLinkingId("");
    setSaving(false);
    setSubmitting(false);
    setProviderId((prev) => {
      if (prev && doctors.some((d) => d.id === prev)) return prev;
      return doctors.find((d) => d.id === myUserId)?.id || doctors[0]?.id || "";
    });
  }, [visible, doctors, myUserId]);

  useEffect(() => {
    if (!visible || providerId) return;
    const next = doctors.find((d) => d.id === myUserId)?.id || doctors[0]?.id || "";
    if (next) setProviderId(next);
  }, [visible, providerId, doctors, myUserId]);

  useEffect(() => {
    const q = query.trim();
    const long = q.replace(/[^\p{L}]/gu, "").length >= 2;
    if (!visible || !practiceId || !long || patient || mode !== "search") {
      setResults([]);
      setSearched("");
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      void searchDeskPatients(practiceId, q, "name")
        .then((res) => {
          if (!alive) return;
          setSearching(false);
          setSearched(q);
          if (res.status === "successful" && res.data) {
            setResults(res.data.patients ?? []);
            setSearchError("");
          } else {
            setResults([]);
            setSearchError(res.message || "Could not search patients.");
          }
        })
        .catch(() => {
          if (!alive) return;
          setSearching(false);
          setSearched(q);
          setResults([]);
          setSearchError("Could not search patients. Try again.");
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, practiceId, visible, patient, mode]);

  async function pick(p: DeskPatient) {
    if (p.knownHere) {
      setPatient(p);
      setQuery("");
      setResults([]);
      return;
    }
    setLinkingId(p.patientId);
    setMessage("");
    try {
      const res = await linkDeskPatient(practiceId, p.patientId);
      if (res.status === "successful" && res.data) {
        setPatient(res.data);
        setQuery("");
        setResults([]);
        return;
      }
      setMessage(res.message || "Could not load this patient's details. Try again.");
    } catch {
      setMessage("Could not load this patient's details. Try again.");
    } finally {
      setLinkingId("");
    }
  }

  function startRegister() {
    const q = query.trim();
    const digits = q.replace(/\D/g, "");
    if (/^[+\d\s()-]+$/.test(q) && digits.length >= 10) setPhone(digits.slice(-10));
    else if (q && !/\d/.test(q)) setName(q);
    setMessage("");
    setMode("register");
  }

  async function register() {
    if (name.trim().replace(/[^\p{L}]/gu, "").length < 2) {
      setMessage("Enter the patient's full name.");
      return;
    }
    const digits = composeWhatsAppMsisdn(country, phone);
    if (!digits) {
      setMessage(
        country.dial === "91"
          ? "Enter a 10-digit WhatsApp mobile. +91 is added for you."
          : `Enter the WhatsApp mobile for +${country.dial}.`,
      );
      return;
    }
    if (!gender) {
      setMessage("Pick the patient's gender.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      setMessage("Enter the date of birth as YYYY-MM-DD.");
      return;
    }
    const today = practiceDateIso(new Date()) || "";
    if (today && dob > today) {
      setMessage("Date of birth can't be in the future.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const res = await registerDeskPatient(practiceId, {
        name: name.trim(),
        phone: digits,
        gender,
        dateOfBirth: dob,
        ...(relationship ? { relationship } : {}),
      });
      if (res.status === "successful" && res.data) {
        setPatient(res.data);
        setMode("search");
        setQuery("");
        return;
      }
      const msg = res.message || "Could not register the patient.";
      setMessage(msg);
      if (/choose how this patient is related/i.test(msg)) setNeedsRelationship(true);
    } catch {
      setMessage("Could not register the patient. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!practiceId || !providerId) {
      setMessage("Select the doctor.");
      return;
    }
    if (!patient) {
      setMessage("Find the patient or register them first.");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      const res = await createWalkIn({
        practiceId,
        providerId,
        patientId: patient.patientId,
        patientPhone: patient.phone,
        ...(disease.trim() ? { disease: disease.trim() } : {}),
      });
      if (res.status !== "successful") {
        setMessage(res.message || "Could not add the walk-in. Try again.");
        return;
      }
      onAdded();
      onClose();
    } catch {
      setMessage("Could not add the walk-in. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const q = query.trim();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => {
        if (!recordWait) onClose();
      }}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={styles.dismiss}
          onPress={() => {
            if (!recordWait) onClose();
          }}
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
          <Text style={styles.title}>Emergency walk-in</Text>
          <Text style={styles.subtitle}>
            Goes straight into today&apos;s waiting list at {practiceName} — no time slot needed.
          </Text>
          <View style={styles.body}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
              <Text style={styles.label}>Doctor</Text>
              {doctors.length ? (
                <View style={styles.chips}>
                  {doctors.map((d) => (
                    <Chip
                      key={d.id}
                      label={d.name}
                      active={providerId === d.id}
                      onPress={() => setProviderId(d.id)}
                    />
                  ))}
                </View>
              ) : (
                <Text style={styles.hint}>No doctors on the roster.</Text>
              )}

              <Text style={styles.label}>Patient</Text>
              <Text style={styles.hint}>Every walk-in needs a Patient ID (MRN).</Text>
              {patient ? (
                <View style={styles.picked}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickedName}>{patient.name}</Text>
                    <Text style={styles.hint}>
                      {patient.mrn ?? "No MRN"} · {patientMeta(patient)}
                    </Text>
                  </View>
                  <SecondaryButton
                    label="Change"
                    onPress={() => setPatient(null)}
                    disabled={recordWait}
                  />
                </View>
              ) : mode === "register" ? (
                <View>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Full name"
                    placeholderTextColor={colors.inkFaint}
                    autoCapitalize="words"
                  />
                  <Text style={styles.hint}>
                    Country code is saved with the number so WhatsApp can send
                    and receive.
                  </Text>
                  <View style={styles.phoneRow}>
                    <Pressable
                      onPress={() => setCountryOpen((open) => !open)}
                      style={styles.countryBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Country code +${country.dial}`}
                    >
                      <Text style={styles.countryCode}>+{country.dial}</Text>
                      <Text style={styles.chevron}>▾</Text>
                    </Pressable>
                    <TextInput
                      style={styles.phoneInput}
                      value={phone}
                      onChangeText={(v) => {
                        setPhone(v);
                        setNeedsRelationship(false);
                      }}
                      placeholder={
                        country.dial === "91" ? "10-digit mobile" : "Mobile number"
                      }
                      placeholderTextColor={colors.inkFaint}
                      keyboardType="phone-pad"
                    />
                  </View>
                  {countryOpen ? (
                    <ScrollView style={styles.countryList} nestedScrollEnabled>
                      {COUNTRY_DIALS.map((c) => (
                        <Pressable
                          key={c.iso}
                          onPress={() => {
                            setCountry(c);
                            setCountryOpen(false);
                          }}
                          style={styles.countryItem}
                        >
                          <Text style={styles.countryItemText}>
                            +{c.dial} {c.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : null}
                  <View style={styles.chips}>
                    {GENDERS.map(([value, label]) => (
                      <Chip
                        key={value}
                        label={label}
                        active={gender === value}
                        onPress={() => setGender(value)}
                      />
                    ))}
                  </View>
                  <TextInput
                    style={styles.input}
                    value={dob}
                    onChangeText={setDob}
                    placeholder="Date of birth YYYY-MM-DD"
                    placeholderTextColor={colors.inkFaint}
                    autoCapitalize="none"
                  />
                  {needsRelationship ? (
                    <View style={styles.chips}>
                      {RELATIONSHIPS.map((rel) => (
                        <Chip
                          key={rel}
                          label={rel}
                          active={relationship === rel}
                          onPress={() => setRelationship(rel)}
                        />
                      ))}
                    </View>
                  ) : null}
                  <View style={styles.rowBtns}>
                    <SecondaryButton label="Back to search" onPress={() => setMode("search")} />
                    <PrimaryButton label="Register" onPress={() => void register()} busy={saving} />
                  </View>
                </View>
              ) : (
                <View>
                  <TextInput
                    style={styles.input}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Patient name"
                    placeholderTextColor={colors.inkFaint}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {searching ? (
                    <LookupStatus
                      label="Looking up patient details…"
                      detail="This can take a few seconds. Matches will show here when they’re ready."
                    />
                  ) : null}
                  {searchError ? <ErrorText text={searchError} /> : null}
                  {!searching && results.length
                    ? results.map((p) => (
                        <Pressable key={p.patientId} style={styles.result} onPress={() => void pick(p)}>
                          <Text style={styles.pickedName}>{p.name}</Text>
                          <Text style={styles.hint}>
                            {p.mrn ?? "No MRN"} · {patientMeta(p)}
                          </Text>
                        </Pressable>
                      ))
                    : null}
                  {!searching && searched && searched === q && !results.length ? (
                    <Text style={styles.empty}>No patient found for “{q}”. Register them below.</Text>
                  ) : !searching ? (
                    <Text style={styles.hint}>
                      Type at least 2 letters of the patient's name.
                    </Text>
                  ) : null}
                  <SecondaryButton label="Register new patient" onPress={startRegister} />
                </View>
              )}

              <Text style={styles.label}>Chief complaint</Text>
              <TextInput
                style={styles.input}
                value={disease}
                onChangeText={setDisease}
                placeholder="e.g. chest pain, high fever"
                placeholderTextColor={colors.inkFaint}
              />
              <ErrorText text={message} />
            </ScrollView>
            {recordWait ? (
              <View style={styles.overlay}>
                <LookupStatus
                  label={
                    submitting
                      ? "Adding to the waiting list…"
                      : "Loading this patient’s details…"
                  }
                  detail="This can take a few seconds. Stay on this screen until it finishes."
                />
              </View>
            ) : null}
          </View>
          <View style={styles.footer}>
            <SecondaryButton label="Cancel" onPress={onClose} disabled={recordWait} />
            <PrimaryButton
              label={submitting ? "Adding to waiting list…" : "Add to waiting list"}
              onPress={() => void submit()}
              busy={submitting}
              disabled={recordWait || searching || !practiceId || !doctors.length || !patient}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 27, 36, 0.45)",
  },
  dismiss: { flex: 1 },
  sheet: {
    maxHeight: "88%",
    backgroundColor: colors.paperRaised,
    borderTopLeftRadius: radii.xl ?? 24,
    borderTopRightRadius: radii.xl ?? 24,
    paddingTop: space.lg,
    paddingHorizontal: space.lg,
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.ink },
  subtitle: { marginTop: 4, marginBottom: space.md, color: colors.inkSoft, fontSize: 13 },
  body: { flexShrink: 1, minHeight: 220, maxHeight: 520 },
  scroll: { paddingBottom: space.md, gap: 8 },
  label: { marginTop: space.sm, fontSize: 13, fontWeight: "700", color: colors.ink },
  hint: { color: colors.inkSoft, fontSize: 12, marginBottom: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    marginBottom: 8,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  countryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  countryCode: { fontWeight: "700", color: colors.ink },
  chevron: { color: colors.inkSoft, fontSize: 12 },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
  },
  countryList: {
    maxHeight: 160,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: 12,
    marginBottom: 8,
  },
  countryItem: { paddingHorizontal: 12, paddingVertical: 10 },
  countryItemText: { color: colors.ink, fontSize: 14 },
  lookup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.sky50,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
  },
  lookupCopy: { flex: 1 },
  lookupLabel: { fontWeight: "700", color: colors.ink, fontSize: 14 },
  lookupDetail: { marginTop: 2, color: colors.inkSoft, fontSize: 12 },
  result: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  picked: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    backgroundColor: colors.emeraldLight,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  pickedName: { fontWeight: "700", color: colors.ink },
  empty: {
    backgroundColor: "#FFFBEB",
    color: "#92400E",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    overflow: "hidden",
  },
  rowBtns: { gap: 8, marginTop: 4 },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255,255,255,0.88)",
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
  },
  footer: { flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingTop: space.sm },
});
