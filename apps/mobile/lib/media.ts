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

export function practicePhotoUrl(item: {
  bgSrc?: string | null;
  members?: {
    role: string;
    user?: { imgSrc?: string | null } | null;
  }[];
}): string | null {
  const doctor = item.members?.find((m) => m.role === "DOCTOR");
  const doctorPhoto = resolveMediaUrl(doctor?.user?.imgSrc);
  if (doctorPhoto) return doctorPhoto;
  return resolveMediaUrl(item.bgSrc);
}
