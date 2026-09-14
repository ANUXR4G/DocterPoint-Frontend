import { getToken } from "./api";

function decodeBase64Url(part: string): string {
  const padded =
    part.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((part.length + 3) % 4);
  if (typeof atob === "function") {
    return atob(padded);
  }
  // Expo / Hermes fallback without Node Buffer types
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let output = "";
  let i = 0;
  const str = padded.replace(/[^A-Za-z0-9+/=]/g, "");
  while (i < str.length) {
    const enc1 = chars.indexOf(str.charAt(i++));
    const enc2 = chars.indexOf(str.charAt(i++));
    const enc3 = chars.indexOf(str.charAt(i++));
    const enc4 = chars.indexOf(str.charAt(i++));
    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;
    output += String.fromCharCode(chr1);
    if (enc3 !== 64) output += String.fromCharCode(chr2);
    if (enc4 !== 64) output += String.fromCharCode(chr3);
  }
  return output;
}

/** Decode JWT `sub` (User UUID) without verifying — for client room paths only. */
export async function getSessionUserId(): Promise<string | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const payload = JSON.parse(decodeBase64Url(part)) as { sub?: unknown };
    return typeof payload.sub === "string" && payload.sub.length > 10
      ? payload.sub
      : null;
  } catch {
    return null;
  }
}
