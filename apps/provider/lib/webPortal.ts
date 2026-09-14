/** Web clinic portal for billing / analytics deep links (doctor role). */
export function getWebPortalUrl(): string {
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.EXPO_PUBLIC_WEB_URL?.trim()
      : "";
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "http://localhost:3000";
}

export function doctorWebPath(path: string): string {
  const base = getWebPortalUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
