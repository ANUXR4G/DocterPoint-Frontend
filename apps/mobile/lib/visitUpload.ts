/** Upload visit attachments (photo / PDF) to Cloudinary — same cloud as web. */
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

const CLOUD_NAME = "dwhlynqj3";
const UPLOAD_PRESET = "gluco-guide-users";

export type VisitUpload = {
  name: string;
  url: string;
  uploadedAt: string;
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
}): Promise<VisitUpload> {
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
  if (!res.ok) throw new Error("Upload failed");
  const json = (await res.json()) as {
    secure_url?: string;
    original_filename?: string;
  };
  if (!json.secure_url) throw new Error("Upload failed");
  return {
    name: opts.name || json.original_filename || "Document",
    url: json.secure_url,
    uploadedAt: new Date().toISOString(),
  };
}

/** Photo from the library, or null if cancelled / "denied". */
export async function pickVisitPhoto(): Promise<
  { uri: string; name: string; mimeType: string } | "denied" | null
> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return "denied";
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.85,
  });
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return null;
  return {
    uri: asset.uri,
    name: asset.fileName || `photo-${Date.now()}.jpg`,
    mimeType: asset.mimeType || "image/jpeg",
  };
}

/** PDF / file from the document picker, or null if cancelled. */
export async function pickVisitDocument(): Promise<{
  uri: string;
  name: string;
  mimeType: string;
} | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ["application/pdf", "image/*"],
  });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0];
  return {
    uri: asset.uri,
    name: asset.name || `document-${Date.now()}`,
    mimeType: asset.mimeType || "application/pdf",
  };
}
