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
