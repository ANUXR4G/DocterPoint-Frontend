/** Hue / saturation / value helpers for the custom theme colour picker. */

export type Hsv = { h: number; s: number; v: number };

export function isHexColor(value: string | null | undefined): value is string {
  return !!value && /^#[0-9a-fA-F]{6}$/.test(value);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function hsvToHex(h: number, s: number, v: number): string {
  const hue = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toByte = (n: number) => Math.round((n + m) * 255);
  return `#${[toByte(r), toByte(g), toByte(b)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function hexToHsv(hex: string): Hsv {
  const raw = hex.replace("#", "");
  const n = Number.parseInt(raw.length === 3 ? raw.replace(/./g, "$&$&") : raw, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function shadeHex(hex: string, deltaV = -0.14): string {
  const { h, s, v } = hexToHsv(hex);
  return hsvToHex(h, s, clamp(v + deltaV, 0.12, 1));
}
