import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { PracticeMembership } from "@/lib/types";

type Ctx = {
  memberships: PracticeMembership[];
  membership: PracticeMembership | null;
  practiceId: string | null;
  providerId: string | null;
  setPracticeIndex: (i: number) => void;
  refresh: () => Promise<void>;
  practiceIndex: number;
};

const PracticeCtx = createContext<Ctx | null>(null);

export function PracticeProvider({
  value,
  children,
}: {
  value: Ctx;
  children: ReactNode;
}) {
  return (
    <PracticeCtx.Provider value={value}>{children}</PracticeCtx.Provider>
  );
}

export function usePractice() {
  const ctx = useContext(PracticeCtx);
  if (!ctx) throw new Error("usePractice outside provider");
  return ctx;
}

export function isClinicAdminRole(role?: string | null) {
  return role === "PRACTICE_OWNER" || role === "PRACTICE_ADMIN";
}

/** Owners, admins, reception, and nurses see the whole clinic. A doctor sees only their own list. */
export function isDeskRole(role?: string | null) {
  return (
    role === "PRACTICE_OWNER" ||
    role === "PRACTICE_ADMIN" ||
    role === "RECEPTIONIST" ||
    role === "NURSE"
  );
}

/** Mirrors backend assertProfileEditor: owner/admin, or the only doctor of a SOLO practice. */
export function canManagePractice(m: PracticeMembership | null): boolean {
  if (!m) return false;
  if (isClinicAdminRole(m.role)) return true;
  return (
    m.role === "DOCTOR" &&
    m.practice.type === "SOLO" &&
    m.practice.members.length === 1
  );
}

/** Clinic-wide lists: omit for staff doctors so API + UI stay on own roster. */
export function selfProviderScope(
  membership: PracticeMembership | null,
): string | undefined {
  if (!membership) return undefined;
  if (isDeskRole(membership.role)) return undefined;
  return membership.userId;
}

export function pickProviderId(m: PracticeMembership | null): string | null {
  if (!m) return null;
  const docs = m.practice.members.filter(
    (x) => x.role === "DOCTOR" || x.role === "PRACTICE_OWNER",
  );
  const self = docs.find((d) => d.userId === m.userId);
  return self?.userId || docs[0]?.userId || m.userId;
}

export function usePracticeLabel(m: PracticeMembership | null) {
  return useMemo(() => {
    if (!m) return "";
    return `${m.practice.name} · ${m.role.replace(/_/g, " ")}`;
  }, [m]);
}
