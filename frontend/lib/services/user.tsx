import { AuthValueType } from "@/types"
import { readJson } from "@/lib/readJson"

/** Login/signup success body; failure may only include status + message. */
export type AuthResult = {
  status?: string
  message?: string
  role?: string
  name?: string | null
  email?: string | null
  date_of_birth?: string | null
  access_token?: string
  refresh_token?: string
  token?: string
}

async function login(values: AuthValueType): Promise<AuthResult> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
    })

    return await readJson<AuthResult>(response, {
      status: "unsuccessful",
      message: "Login service unavailable. Is the API running?",
    })
  } catch (error) {
    console.log(error)
    return {
      status: "unsuccessful",
      message: "Login service unavailable. Is the API running?",
    }
  }
}

async function signup(values: AuthValueType): Promise<AuthResult> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API}/auth/signup`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
    })
    return await readJson<AuthResult>(response, {
      status: "unsuccessful",
      message: "Signup service unavailable. Is the API running?",
    })
  } catch (error) {
    console.log(error)
    return {
      status: "unsuccessful",
      message: "Signup service unavailable. Is the API running?",
    }
  }
}

async function account(token: string) {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API}/auth/me`, {
      method: "GET",
      credentials: "include",
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
        "Content-Type": "application/json",
      },
    })

    const json = await readJson<{
      status?: string
      message?: string
      detail?: string
      data?: Record<string, unknown>
    }>(response, { status: "unsuccessful", message: "Empty response" })

    if (!response.ok) {
      const msg =
        json.message ||
        json.detail ||
        (response.status === 401
          ? "Session expired — sign in again."
          : response.status === 403
            ? "You do not have permission to view this account."
            : `Account request failed (${response.status}).`)
      throw new Error(msg)
    }

    if (json.status === "unsuccessful") {
      throw new Error(json.message || "Failed to fetch account.")
    }

    if (json.status === "successful" && json.data) {
      return json.data
    }

    return json
  } catch (error) {
    if (error instanceof Error) throw error
    throw new Error("Failed to fetch account.")
  }
}

async function profile(token: string) {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API}/patient/profile`,
      {
        method: "GET",
        credentials: "include",
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
          "Content-Type": "application/json",
        },
      },
    )

    const contentType = response.headers.get("content-type") ?? ""
    if (
      contentType.includes("text/html") ||
      (response.status === 404 &&
        !contentType.includes("json") &&
        response.url.includes("patient/profile"))
    ) {
      throw new Error(
        "API is not the GlucoGuide backend. Set BACKEND_URL to http://127.0.0.1:3002 and run: cd backend && PORT=3002 yarn dev (port 3001 may be used by another app).",
      )
    }

    const json = await readJson<{
      status?: string
      message?: string
      detail?: string
      data?: unknown
    }>(response, { status: "unsuccessful", message: "Empty response" })

    if (!response.ok) {
      const msg =
        json.message ||
        json.detail ||
        (response.status === 429
          ? "Too many requests — wait a moment and try again."
          : response.status === 401
          ? "Session expired — sign in again."
          : response.status === 403
            ? "You do not have permission to view this profile."
            : response.status === 404
              ? "Patient profile not found."
              : `Profile request failed (${response.status}).`)
      throw new Error(msg)
    }

    if (json.status === "unsuccessful") {
      throw new Error(json.message || "Failed to fetch patient profile.")
    }

    return json
  } catch (error) {
    if (error instanceof Error) throw error
    throw new Error("Failed to fetch patient profile.")
  }
}

async function update(token: string, payload: Record<string, unknown>) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/patient/profile`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  )

  if (!response.ok) {
    throw new Error(`failed to update patient information.`)
  }

  return response.json()
}

export type IdScanResult = {
  documentType: string | null
  name: string | null
  dateOfBirth: string | null
  gender: "male" | "female" | "others" | null
  address: string | null
  contactNumber: string | null
  documentNumberMasked: string | null
  aadharNumber: string | null
  panNumber: string | null
  confidence: number
}

export type ProfessionalScanResult = {
  documentType: string | null
  name: string | null
  clinicName: string | null
  licenseNo: string | null
  registrationNo: string | null
  email: string | null
  phone: string | null
  address: string | null
  specialty: string | null
  confidence: number
}

type ScanApiResponse<T> = {
  status: string
  message?: string
  data?: T
}

async function parseScanResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<ScanApiResponse<T>> {
  const contentType = response.headers.get("content-type") ?? ""
  if (
    contentType.includes("text/html") ||
    (response.status === 404 && !contentType.includes("json"))
  ) {
    throw new Error(
      "Backend API is not running. Start it with: cd backend && yarn dev (listens on :3002 by default).",
    )
  }

  const json = await readJson<ScanApiResponse<T>>(response, {
    status: "unsuccessful",
    message: fallbackMessage,
  })

  if (!response.ok) {
    throw new Error(json.message || fallbackMessage)
  }
  if (json.status === "unsuccessful") {
    throw new Error(json.message || fallbackMessage)
  }
  return json
}

async function scanIdDocument(
  token: string,
  payload: { imageBase64: string; mimeType: string },
) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/patient/profile/id-scan`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        imageBase64: payload.imageBase64,
        mimeType: payload.mimeType,
      }),
    },
  )

  const json = await parseScanResponse<IdScanResult>(
    response,
    "Could not read the document. Try a clearer photo.",
  )
  return json as { status: string; message: string; data: IdScanResult }
}

/** Unauthenticated OCR for patient registration autofill. */
async function scanIdDocumentGuest(payload: {
  imageBase64: string
  mimeType: string
}) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API}/auth/id-scan`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64: payload.imageBase64,
      mimeType: payload.mimeType,
    }),
  })

  const json = await parseScanResponse<IdScanResult>(
    response,
    "Could not read the document. Try a clearer photo.",
  )
  return json as { status: string; message: string; data: IdScanResult }
}

/** Unauthenticated OCR for doctor / clinic visiting card or documents. */
async function scanProfessionalDocumentGuest(payload: {
  imageBase64: string
  mimeType: string
}) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API}/auth/doc-scan`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64: payload.imageBase64,
      mimeType: payload.mimeType,
    }),
  })

  const json = await parseScanResponse<ProfessionalScanResult>(
    response,
    "Failed to extract details from the document. Is the API running? Set HF_TOKEN or OPENAI_API_KEY on the server.",
  )
  return json as {
    status: string
    message: string
    data: ProfessionalScanResult
  }
}

async function logout() {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (typeof document !== "undefined") {
      for (const name of ["access_token", "refresh_token"]) {
        document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`
      }
    }

    if (!response.ok) {
      console.warn("logout API returned", response.status)
    }

    return response.ok ? response : new Response(null, { status: 200 })
  } catch (error) {
    if (typeof document !== "undefined") {
      for (const name of ["access_token", "refresh_token"]) {
        document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`
      }
    }
    console.warn("logout request failed", error)
    return new Response(null, { status: 200 })
  }
}

async function updateThemePreferences(
  token: string,
  data: { textSize?: string; bgSrc?: string | null },
) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/patient/theme`,
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    },
  )
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.message || "Failed to update appearance preferences")
  }
  const json = await response.json()
  return {
    ...json,
    bg_src: json?.data?.bg_src ?? json?.data?.bgSrc ?? data.bgSrc,
    text_size:
      json?.data?.text_size ?? json?.data?.textSize ?? data.textSize,
  }
}

async function uploadAadharCard(
  token: string,
  payload: { imageBase64: string; mimeType: string },
) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/patient/profile/aadhar-card`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        imageBase64: payload.imageBase64,
        mimeType: payload.mimeType,
      }),
    },
  )

  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      (json as { message?: string }).message ||
        "Failed to upload Aadhaar card.",
    )
  }
  return json as { status: string; message: string; data: { aadhar_card_src?: string } }
}

async function uploadProfilePhoto(
  token: string,
  payload: { imageBase64: string; mimeType: string },
) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API}/patient/profile/photo`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        imageBase64: payload.imageBase64,
        mimeType: payload.mimeType,
      }),
    },
  )

  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      (json as { message?: string }).message ||
        "Failed to upload profile photo.",
    )
  }
  return json as { status: string; message: string; data: { img_src?: string; imgSrc?: string } }
}

async function requestPhoneOtp(phone: string): Promise<{
  status?: string
  message?: string
  from?: string
  debugOtp?: string
  data?: { from?: string; debugOtp?: string }
}> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API}/auth/otp/request`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      },
    )
    const json = await readJson<{
      status?: string
      message?: string
      data?: { from?: string; debugOtp?: string }
    }>(response, {
      status: "unsuccessful",
      message: "OTP service unavailable.",
    })
    return {
      ...json,
      from: json.data?.from,
      debugOtp: json.data?.debugOtp,
    }
  } catch {
    return { status: "unsuccessful", message: "OTP service unavailable." }
  }
}

async function verifyPhoneOtp(phone: string, code: string): Promise<AuthResult> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API}/auth/otp/verify`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      },
    )
    return await readJson<AuthResult>(response, {
      status: "unsuccessful",
      message: "OTP verification unavailable.",
    })
  } catch {
    return {
      status: "unsuccessful",
      message: "OTP verification unavailable.",
    }
  }
}

export const userService = {
  login,
  signup,
  account,
  profile,
  update,
  logout,
  updateThemePreferences,
  scanIdDocument,
  scanIdDocumentGuest,
  scanProfessionalDocumentGuest,
  uploadAadharCard,
  uploadProfilePhoto,
  requestPhoneOtp,
  verifyPhoneOtp,
}
