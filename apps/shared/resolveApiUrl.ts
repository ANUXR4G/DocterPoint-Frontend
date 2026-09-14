import Constants from "expo-constants";
import * as Device from "expo-device";

/** GlucoGuide backend — canonical local port. */
export const DEFAULT_API_BASE = "http://localhost:3001";

function metroHost(): string | null {
  const expoConfig = Constants.expoConfig as
    | { hostUri?: string }
    | null
    | undefined;
  const legacy = Constants as unknown as {
    manifest?: { debuggerHost?: string };
    manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } };
  };
  const hostUri =
    expoConfig?.hostUri ??
    legacy.manifest?.debuggerHost ??
    legacy.manifest2?.extra?.expoGo?.debuggerHost;
  if (!hostUri) return null;
  const host = String(hostUri).split(":")[0];
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  return host;
}

function isTunnelHost(host: string): boolean {
  return /\.exp\.direct$|\.expo\.dev$|\.ngrok|\.loca\.lt$/i.test(host);
}

function apiPortFromUrl(baseUrl: string, fallback = 3001): number {
  try {
    const u = new URL(baseUrl);
    if (u.port) return Number(u.port);
    return u.protocol === "https:" ? 443 : 80;
  } catch {
    return fallback;
  }
}

/** Resolve GlucoGuide API origin for Expo patient/provider apps. */
export function resolveApiUrl(): string {
  const configured = (
    process.env.EXPO_PUBLIC_API_URL ??
    (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
    ""
  ).replace(/\/$/, "");

  const defaultBase = configured || DEFAULT_API_BASE;
  const port = apiPortFromUrl(defaultBase);
  const isLocalhost =
    configured.length > 0 && /localhost|127\.0\.0\.1/i.test(configured);

  if (!Device.isDevice) {
    return isLocalhost ? configured : defaultBase;
  }

  const host = metroHost();
  if (isLocalhost && host && !isTunnelHost(host)) {
    return `http://${host}:${port}`;
  }

  if (configured && !isLocalhost) return configured;

  if (host && !isTunnelHost(host)) return `http://${host}:${port}`;

  return defaultBase;
}
