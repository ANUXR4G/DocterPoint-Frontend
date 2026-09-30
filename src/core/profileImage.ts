import { AppError } from "./response.js";

export const CLOUDINARY_CLOUD_NAME = "dwhlynqj3";

const MAX_URL_LENGTH = 1000;

/**
 * Profile photos / clinic logos must come from our Cloudinary account (or a
 * server-owned `/uploads/` path) so a profile can't point patients at an
 * arbitrary third-party URL. Blank clears the image; an unchanged value passes.
 */
export function normalizeProfileImageUrl(
  value: unknown,
  current?: string | null,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new AppError(400, "Photo must be an image link.");
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (current && trimmed === current) return trimmed;
  if (trimmed.length > MAX_URL_LENGTH) {
    throw new AppError(400, "Photo link is too long.");
  }
  if (/^\/uploads\/patients\/[\w./-]+$/.test(trimmed) && !trimmed.includes("..")) {
    return trimmed;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new AppError(400, "Photo must be an uploaded image.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "res.cloudinary.com" ||
    !url.pathname.startsWith(`/${CLOUDINARY_CLOUD_NAME}/image/upload/`)
  ) {
    throw new AppError(400, "Photo must be an uploaded image.");
  }
  return url.toString();
}
