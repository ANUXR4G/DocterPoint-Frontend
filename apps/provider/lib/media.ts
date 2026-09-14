import { resolveApiUrl } from "@/lib/resolveApiUrl";

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
  const origin = resolveApiUrl().replace(/\/$/, "");
  return `${origin}${value.startsWith("/") ? value : `/${value}`}`;
}
