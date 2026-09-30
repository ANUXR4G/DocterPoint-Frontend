/** Upload visit documents to Cloudinary (same preset as doctor web portal). */
import * as ImagePicker from "expo-image-picker";

const CLOUD_NAME = "dwhlynqj3";
const UPLOAD_PRESET = "gluco-guide-users";

export type CloudinaryUpload = {
  secure_url: string;
  original_filename?: string;
};

function publicId(name: string) {
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .slice(0, 40);
  return `${base || "doc"}-${Date.now()}`;
}

export async function uploadVisitFile(opts: {
  uri: string;
  name: string;
  mimeType?: string | null;
}): Promise<CloudinaryUpload> {
  const mime = opts.mimeType || "application/octet-stream";
  const isImage = mime.startsWith("image/");
  const endpoint = isImage ? "image/upload" : "auto/upload";

  const form = new FormData();
  form.append("upload_preset", UPLOAD_PRESET);
  form.append("public_id", publicId(opts.name));
  form.append("file", {
    uri: opts.uri,
    name: opts.name || "document",
    type: mime,
  } as unknown as Blob);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${endpoint}`,
    { method: "POST", body: form },
  );
  if (!res.ok) {
    throw new Error("Upload failed");
  }
  return (await res.json()) as CloudinaryUpload;
}

/** Pick a square-cropped photo and upload it; null if cancelled, "denied" if blocked. */
export async function pickAndUploadPhoto(): Promise<string | "denied" | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return "denied";
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return null;
  const upload = await uploadVisitFile({
    uri: asset.uri,
    name: asset.fileName || "photo.jpg",
    mimeType: asset.mimeType || "image/jpeg",
  });
  return upload.secure_url;
}
