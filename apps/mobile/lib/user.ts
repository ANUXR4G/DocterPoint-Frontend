import { api } from "@/lib/api";

export type IdScanResult = {
  documentType: string | null;
  name: string | null;
  dateOfBirth: string | null;
  gender: "male" | "female" | "others" | null;
  address: string | null;
  contactNumber: string | null;
  documentNumberMasked: string | null;
  aadharNumber: string | null;
  panNumber: string | null;
  confidence: number;
};

export type AuthResult = {
  status?: string;
  message?: string;
  role?: string;
  name?: string | null;
  email?: string | null;
  access_token?: string;
  refresh_token?: string;
  token?: string;
};

export async function signup(payload: {
  email: string;
  password: string;
  role: "user";
  name: string;
  phone?: string;
}) {
  return api<AuthResult>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function scanIdDocumentGuest(payload: {
  imageBase64: string;
  mimeType: string;
}) {
  return api<IdScanResult>("/auth/id-scan", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateProfile(
  token: string,
  payload: Record<string, unknown>,
) {
  return api("/patient/profile", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function uploadProfilePhoto(
  token: string,
  payload: { imageBase64: string; mimeType: string },
) {
  return api("/patient/profile/photo", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function uploadAadharCard(
  token: string,
  payload: { imageBase64: string; mimeType: string },
) {
  return api("/patient/profile/aadhar-card", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}
