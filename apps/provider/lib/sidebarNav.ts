import type { SvgIconName } from "@/components/icons/SvgIcon";
import {
  canManagePractice,
  isClinicAdminRole,
} from "@/lib/practiceContext";
import type { PracticeMembership } from "@/lib/types";

export type SidebarNavItem = {
  key: string;
  label: string;
  icon: SvgIconName;
  /** In-app route only (expo-router). Never open website / WhatsApp from here. */
  href: string;
  match?: string[];
  badge?: number;
  section?: "care" | "practice" | "account";
};

/**
 * Full doctor/clinic portal nav — former bottom dock + Dashboard quick links + More.
 */
export function buildSidebarNav(
  membership: PracticeMembership | null,
  opts?: { openAlerts?: number },
): SidebarNavItem[] {
  const isClinicAdmin = isClinicAdminRole(membership?.role);
  const canManage = canManagePractice(membership);
  const isReception =
    membership?.role === "RECEPTIONIST" || membership?.role === "NURSE";

  const care: SidebarNavItem[] = [
    {
      key: "dashboard",
      label: "Dashboard",
      icon: "home",
      href: "/(app)/dashboard",
      match: ["/dashboard"],
      section: "care",
    },
    {
      key: "queue",
      label: "Queue",
      icon: "list",
      href: "/(app)/queue",
      match: ["/queue"],
      section: "care",
    },
    {
      key: "appointments",
      label: "Appointments",
      icon: "calendarNumber",
      href: "/(app)/appointments",
      match: ["/appointments"],
      section: "care",
    },
    {
      key: "patients",
      label: "Patients",
      icon: "people",
      href: "/(app)/patients",
      match: ["/patients"],
      section: "care",
    },
    {
      key: "calendar",
      label: "Calendar",
      icon: "calendar",
      href: "/(app)/calendar",
      match: ["/calendar"],
      section: "care",
    },
  ];

  const practice: SidebarNavItem[] = [
    {
      key: "notifications",
      label: "Notifications",
      icon: "bell",
      href: "/(app)/notifications",
      match: ["/notifications"],
      badge: opts?.openAlerts,
      section: "practice",
    },
  ];

  if (isClinicAdmin) {
    practice.push({
      key: "doctors",
      label: "Doctors",
      icon: "medkit",
      href: "/(app)/doctors",
      match: ["/doctors"],
      section: "practice",
    });
  }

  practice.push({
    key: "support",
    label: "Patient Support",
    icon: "chatOutline",
    href: "/(app)/inbox",
    match: ["/inbox"],
    section: "practice",
  });

  if (!isReception) {
    practice.push({
      key: "audit",
      label: "Audit log",
      icon: "document",
      href: "/(app)/audit",
      match: ["/audit"],
      section: "practice",
    });
  }

  practice.push(
    {
      key: "analytics",
      label: "Analytics",
      icon: "chart",
      href: "/(app)/analytics",
      match: ["/analytics"],
      section: "practice",
    },
    {
      key: "payments",
      label: "Payments",
      icon: "card",
      href: "/(app)/payments",
      match: ["/payments"],
      section: "practice",
    },
    {
      key: "hours",
      label: canManage ? "Hours & blocks" : "My hours",
      icon: "clock",
      href: "/(app)/schedule",
      match: ["/schedule", "/overrides"],
      section: "practice",
    },
  );

  if (canManage) {
    practice.push({
      key: "subscription",
      label: "Subscription",
      icon: "diamond",
      href: "/(app)/subscriptions",
      match: ["/subscriptions"],
      section: "practice",
    });
  }

  const account: SidebarNavItem[] = [
    {
      key: "settings",
      label: "Settings",
      icon: "settings",
      href: "/(app)/settings",
      match: ["/settings"],
      section: "account",
    },
    {
      key: "help",
      label: "Help & Support",
      icon: "help",
      href: "/(app)/queries",
      match: ["/queries"],
      section: "account",
    },
    {
      key: "profile",
      label: "Account",
      icon: "more",
      href: "/(app)/profile",
      match: ["/profile"],
      section: "account",
    },
  ];

  return [...care, ...practice, ...account];
}

export function sidebarItemActive(
  item: SidebarNavItem,
  pathname: string,
): boolean {
  if (!item.match?.length) return false;
  return item.match.some(
    (m) => pathname === m || pathname.endsWith(m) || pathname.includes(m),
  );
}
