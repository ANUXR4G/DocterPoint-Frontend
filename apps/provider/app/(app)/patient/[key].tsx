import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  EmptyState,
  ErrorText,
  PageTitle,
  PrimaryButton,
  StatusBadge,
  SurfaceCard,
} from "@/components/ui";
import { PremiumAtmosphere } from "@/components/mobile/PremiumChrome";
import { contentBottomPad } from "@/lib/dockLayout";
import { formatPhoneDisplay } from "@/lib/formatPhone";
import { resolveMediaUrl } from "@/lib/media";
import { findPatientInRoster } from "@/lib/patientRoster";
import { usePractice } from "@/lib/practiceContext";
import { usePracticeLive } from "@/lib/PracticeLiveContext";
import { whenLabel } from "@/lib/types";
import { colors, space } from "@/lib/theme";

export default function PatientDetailScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { membership } = usePractice();
  const { patients, error: liveError } = usePracticeLive();

  const patient = useMemo(
    () =>
      findPatientInRoster(patients, Array.isArray(key) ? key[0]! : key || ""),
    [patients, key],
  );

  const visits = patient?.recentBookings ?? patient?.recent ?? [];
  const title = patient?.name?.trim() || formatPhoneDisplay(patient?.phone || "");

  return (
    <View style={styles.root}>
      <PremiumAtmosphere />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: contentBottomPad(insets.bottom) },
        ]}
      >
        <PrimaryButton
          label="← Patients"
          tone="ghost"
          onPress={() => router.back()}
        />

        {!patient ? (
          <>
            <PageTitle
              eyebrow={membership?.practice.name}
              title="Patient"
              subtitle="Not found in this clinic roster."
            />
            <ErrorText text={liveError || ""} />
            <EmptyState text="Pull back and open the patient again from the list." />
          </>
        ) : (
          <>
            <PageTitle
              eyebrow={membership?.practice.name}
              title={title || "Patient"}
              subtitle={
                patient.mrn?.trim()
                  ? `MRN ${patient.mrn.trim()}`
                  : `${patient.bookingCount} visit${patient.bookingCount === 1 ? "" : "s"}`
              }
            />

            <SurfaceCard>
              <View style={styles.headerRow}>
                {resolveMediaUrl(patient.imgSrc) ? (
                  <Image
                    source={{ uri: resolveMediaUrl(patient.imgSrc)! }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitial}>
                      {(title || "?").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{title}</Text>
                  {patient.relationship?.trim() ? (
                    <Text style={styles.meta}>{patient.relationship.trim()}</Text>
                  ) : null}
                  {patient.lastStatus ? (
                    <View style={{ marginTop: 8 }}>
                      <StatusBadge status={patient.lastStatus} />
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={styles.facts}>
                <Fact
                  label="Phone"
                  value={formatPhoneDisplay(patient.phone)}
                />
                <Fact
                  label="Booked via"
                  value={formatPhoneDisplay(
                    patient.bookedViaPhone || patient.phone,
                  )}
                />
                {patient.email?.trim() ? (
                  <Fact label="Email" value={patient.email.trim()} />
                ) : null}
                {patient.gender?.trim() ? (
                  <Fact label="Gender" value={patient.gender.trim()} />
                ) : null}
                {patient.dateOfBirth?.trim() || patient.age != null ? (
                  <Fact
                    label="Age / DOB"
                    value={[
                      patient.age != null ? String(patient.age) : "",
                      patient.dateOfBirth?.trim() || "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                ) : null}
                {patient.address?.trim() ? (
                  <Fact label="Address" value={patient.address.trim()} />
                ) : null}
                {patient.profession?.trim() ? (
                  <Fact label="Profession" value={patient.profession.trim()} />
                ) : null}
                {patient.providerNames?.length ? (
                  <Fact
                    label="Doctors"
                    value={patient.providerNames.join(", ")}
                  />
                ) : null}
                {patient.lastVisitAt ? (
                  <Fact
                    label="Last visit"
                    value={String(patient.lastVisitAt).slice(0, 10)}
                  />
                ) : null}
              </View>
            </SurfaceCard>

            <Text style={styles.section}>Recent visits</Text>
            {visits.length === 0 ? (
              <EmptyState text="No visits recorded yet." />
            ) : (
              visits.map((b) => (
                <SurfaceCard
                  key={b.id}
                  onPress={() => router.push(`/(app)/visit/${b.id}`)}
                >
                  <View style={styles.visitRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.visitWhen}>{whenLabel(b)}</Text>
                      {b.disease ? (
                        <Text style={styles.meta}>{b.disease}</Text>
                      ) : null}
                      {b.provider?.name ? (
                        <Text style={styles.meta}>{b.provider.name}</Text>
                      ) : null}
                    </View>
                    <StatusBadge status={b.status} />
                  </View>
                  <Text style={styles.openLink}>Open visit →</Text>
                </SurfaceCard>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    gap: space.md,
  },
  headerRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.line,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandLight,
  },
  avatarInitial: { fontSize: 20, fontWeight: "700", color: colors.brand },
  name: { fontSize: 18, fontWeight: "700", color: colors.ink },
  meta: { marginTop: 4, fontSize: 13, color: colors.inkSoft },
  facts: { marginTop: space.lg, gap: space.sm },
  fact: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: space.sm,
  },
  factLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.inkFaint,
  },
  factValue: { marginTop: 2, fontSize: 15, color: colors.ink, lineHeight: 20 },
  section: {
    marginTop: space.sm,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.inkSoft,
  },
  visitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
  },
  visitWhen: { fontSize: 15, fontWeight: "600", color: colors.ink },
  openLink: {
    marginTop: space.sm,
    fontSize: 13,
    fontWeight: "700",
    color: colors.brand,
  },
});
