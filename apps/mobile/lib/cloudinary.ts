import * as ImagePicker from "expo-image-picker";

/** Same unsigned preset as the web portal; the API only accepts this cloud's URLs. */
const CLOUD_NAME = "dwhlynqj3";
const UPLOAD_PRESET = "gluco-guide-users";

export type PickedPhoto = { uri: string; name: string; mimeType: string };

/** Square-cropped photo from the library, or null if cancelled / blocked. */
export async function pickProfilePhoto(): Promise<PickedPhoto | "denied" | null> {
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
  return {
    uri: asset.uri,
    name: asset.fileName || "photo.jpg",
    mimeType: asset.mimeType || "image/jpeg",
  };
}

export async function uploadPhoto(photo: PickedPhoto): Promise<string> {
  const form = new FormData();
  form.append("upload_preset", UPLOAD_PRESET);
  form.append("public_id", `profile-${Date.now()}`);
  form.append("file", {
    uri: photo.uri,
    name: photo.name,
    type: photo.mimeType,
  } as unknown as Blob);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: "POST", body: form },
  );
  if (!res.ok) throw new Error("Upload failed");
  const json = (await res.json()) as { secure_url?: string };
  if (!json.secure_url) throw new Error("Upload failed");
  return json.secure_url;
}
