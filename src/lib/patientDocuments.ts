import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UPLOAD_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../uploads/patients",
);

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function saveAadharCardImage(
  patientId: string,
  imageBase64: string,
  mimeType?: string,
): Promise<string> {
  const mime = (mimeType || "image/jpeg").toLowerCase();
  const ext = ALLOWED_MIME[mime];
  if (!ext) {
    throw new Error("Aadhaar card must be JPG, PNG, or WEBP.");
  }

  const raw = imageBase64.includes(",")
    ? imageBase64.split(",").pop()!
    : imageBase64;
  const buffer = Buffer.from(raw, "base64");
  if (buffer.length < 16) {
    throw new Error("Invalid Aadhaar card image.");
  }
  if (buffer.length > 6 * 1024 * 1024) {
    throw new Error("Aadhaar card image must be under 6 MB.");
  }

  const dir = path.join(UPLOAD_ROOT, patientId);
  await fs.mkdir(dir, { recursive: true });
  const filename = `aadhar.${ext}`;
  await fs.writeFile(path.join(dir, filename), buffer);

  return `/api/v1/uploads/patients/${patientId}/${filename}`;
}

export async function saveProfilePhotoImage(
  patientId: string,
  imageBase64: string,
  mimeType?: string,
): Promise<string> {
  const mime = (mimeType || "image/jpeg").toLowerCase();
  const ext = ALLOWED_MIME[mime];
  if (!ext) {
    throw new Error("Profile photo must be JPG, PNG, or WEBP.");
  }

  const raw = imageBase64.includes(",")
    ? imageBase64.split(",").pop()!
    : imageBase64;
  const buffer = Buffer.from(raw, "base64");
  if (buffer.length < 16) {
    throw new Error("Invalid profile photo.");
  }
  if (buffer.length > 6 * 1024 * 1024) {
    throw new Error("Profile photo must be under 6 MB.");
  }

  const dir = path.join(UPLOAD_ROOT, patientId);
  await fs.mkdir(dir, { recursive: true });
  const filename = `profile.${ext}`;
  await fs.writeFile(path.join(dir, filename), buffer);

  return `/api/v1/uploads/patients/${patientId}/${filename}`;
}
