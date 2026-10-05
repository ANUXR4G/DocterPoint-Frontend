import * as SecureStore from "expo-secure-store";
import { clearProviderDataCache } from "./dataCache";
import { resolveApiUrl } from "./resolveApiUrl";

const API_PREFIX = "/api/v1";
const TOKEN_KEY = "gg_provider_access_token";
const REFRESH_KEY = "gg_provider_refresh_token";

let cachedAccessToken: string | null | undefined;
let cachedRefreshToken: string | null | undefined;

export function getApiUrl(): string {
  return resolveApiUrl();
}

export type ApiResponse<T = unknown> = {
  status: "successful" | "unsuccessful";
  message: string;
  data?: T;
  total?: number;
  access_token?: string;
  refresh_token?: string;
  token?: string;
  role?: string;
  name?: string | null;
  email?: string | null;
};

export async function getToken(): Promise<string | null> {
  if (cachedAccessToken !== undefined) return cachedAccessToken;
  cachedAccessToken = await SecureStore.getItemAsync(TOKEN_KEY);
  return cachedAccessToken;
}

export async function getRefreshToken(): Promise<string | null> {
  if (cachedRefreshToken !== undefined) return cachedRefreshToken;
  cachedRefreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  return cachedRefreshToken;
}

export async function setToken(token: string | null): Promise<void> {
  cachedAccessToken = token;
  if (!token) await SecureStore.deleteItemAsync(TOKEN_KEY);
  else await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function setRefreshToken(token: string | null): Promise<void> {
  cachedRefreshToken = token;
  if (!token) await SecureStore.deleteItemAsync(REFRESH_KEY);
  else await SecureStore.setItemAsync(REFRESH_KEY, token);
}

export async function clearSession(): Promise<void> {
  cachedAccessToken = null;
  cachedRefreshToken = null;
  clearProviderDataCache();
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

function normalizeResponse<T>(raw: Record<string, unknown>): ApiResponse<T> {
  if (raw.status === "successful" || raw.status === "unsuccessful") {
    return raw as ApiResponse<T>;
  }
  return {
    status: "successful",
    message: "ok",
    data: raw as T,
    access_token: raw.access_token as string | undefined,
    refresh_token: raw.refresh_token as string | undefined,
    token: (raw.token || raw.access_token) as string | undefined,
    role: raw.role as string | undefined,
    name: raw.name as string | null | undefined,
    email: raw.email as string | null | undefined,
  };
}

async function tryRefreshAccessToken(): Promise<boolean> {
  const refresh = await getRefreshToken();
  if (!refresh) return false;

  const apiUrl = getApiUrl();
  try {
    const res = await fetch(`${apiUrl}${API_PREFIX}/auth/token/refresh`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${refresh}`,
      },
    });
    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return false;

    const access = String(raw.access_token || raw.token || "");
    const nextRefresh = String(raw.refresh_token || refresh);
    if (!access) return false;

    await setToken(access);
    await setRefreshToken(nextRefresh);
    return true;
  } catch {
    return false;
  }
}

function jwtExpSeconds(token: string): number {
  try {
    const part = token.split(".")[1];
    if (!part) return 0;
    const padded =
      part.replace(/-/g, "+").replace(/_/g, "/") +
      "===".slice((part.length + 3) % 4);
    const json = JSON.parse(globalThis.atob(padded)) as { exp?: number };
    return typeof json.exp === "number" ? json.exp : 0;
  } catch {
    return 0;
  }
}

/** Fresh access JWT for REST + WebSocket (refresh when expired). */
export async function ensureAccessToken(): Promise<string | null> {
  const access = await getToken();
  if (access && jwtExpSeconds(access) >= Date.now() / 1000 + 30) {
    return access;
  }
  const ok = await tryRefreshAccessToken();
  if (ok) return getToken();
  return access;
}

export async function api<T = unknown>(
  path: string,
  init?: RequestInit,
  _retried = false,
): Promise<ApiResponse<T>> {
  const token = await getToken();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const apiUrl = getApiUrl();
  const url = `${apiUrl}${API_PREFIX}${normalized}`;
  const isAuthPath =
    normalized.startsWith("/auth/login") ||
    normalized.startsWith("/auth/signup") ||
    normalized.startsWith("/auth/token/refresh");

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    return {
      status: "unsuccessful",
      message:
        err instanceof Error
          ? err.message
          : `Network error — is the GlucoGuide API running at ${apiUrl}?`,
    };
  }

  if (res.status === 401 && !isAuthPath && !_retried) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) return api<T>(path, init, true);
    await clearSession();
  }

  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const detail = raw.message || raw.detail;
    return {
      status: "unsuccessful",
      message: String(
        detail || `Request failed (${res.status}) at ${url}`,
      ),
    };
  }

  return normalizeResponse<T>(raw);
}

export { API_PREFIX };
