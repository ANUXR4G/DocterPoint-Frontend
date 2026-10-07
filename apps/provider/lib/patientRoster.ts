import type { PracticePatient } from "@/lib/types";

export function patientRosterKey(p: PracticePatient): string {
  if (p.patientId?.trim()) return `id:${p.patientId.trim()}`;
  return `phone:${(p.phone || "").replace(/\D/g, "")}|${(p.name || "")
    .trim()
    .toLowerCase()}`;
}

export function findPatientInRoster(
  rows: PracticePatient[],
  key: string,
): PracticePatient | null {
  const decoded = decodeURIComponent(key || "");
  if (!decoded) return null;
  const byKey = rows.find((p) => patientRosterKey(p) === decoded);
  if (byKey) return byKey;
  if (decoded.startsWith("id:")) {
    const id = decoded.slice(3);
    return rows.find((p) => p.patientId === id) ?? null;
  }
  if (decoded.startsWith("phone:")) {
    const rest = decoded.slice(6);
    const [digits, name] = rest.split("|");
    return (
      rows.find(
        (p) =>
          (p.phone || "").replace(/\D/g, "") === digits &&
          (p.name || "").trim().toLowerCase() === (name || ""),
      ) ?? null
    );
  }
  return (
    rows.find((p) => p.patientId === decoded) ??
    rows.find((p) => (p.phone || "").replace(/\D/g, "") === decoded) ??
    null
  );
}
