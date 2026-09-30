import { getApiUrl } from "@/lib/api";

/** Turn backend upload paths into absolute URLs for RN Image. */
export function resolveMediaUrl(src?: string | null): string | null {
  if (!src?.trim()) return null;
  const value = src.trim();
  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:")
  ) {
    return value;
  }
  const origin = getApiUrl().replace(/\/$/, "");
  return `${origin}${value.startsWith("/") ? value : `/${value}`}`;
}

/** Clinics lead with their logo; solo doctors lead with their own photo. */
export function practicePhotoUrl(item: {
  type?: string | null;
  bgSrc?: string | null;
  members?: {
    role: string;
    user?: { imgSrc?: string | null } | null;
  }[];
}): string | null {
  const members = item.members ?? [];
  const doctor =
    members.find((m) => m.role === "DOCTOR" && m.user?.imgSrc) ??
    members.find((m) => m.role === "PRACTICE_OWNER" && m.user?.imgSrc);
  const doctorPhoto = resolveMediaUrl(doctor?.user?.imgSrc);
  const logo = resolveMediaUrl(item.bgSrc);
  const isClinic = item.type === "CLINIC" || item.type === "CENTER";
  return isClinic ? logo ?? doctorPhoto : doctorPhoto ?? logo;
}
