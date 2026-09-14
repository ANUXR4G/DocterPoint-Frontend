import { AppError } from "./response.js";

export function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Return true if value looks like a UUID (Prisma @db.Uuid paths). */
export function isUuid(value: string | undefined | null): boolean {
  return Boolean(value && UUID_RE.test(value));
}

export function requireUuid(value: string, label = "id"): string {
  if (!isUuid(value)) {
    throw new AppError(400, `Invalid ${label}.`);
  }
  return value;
}
