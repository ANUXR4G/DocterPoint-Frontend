import { firey } from "@/utils"

export type BookingDocument = {
  name: string
  url: string
  uploadedAt: string
}

export const MAX_BOOKING_DOCUMENTS = 5
export const MAX_BOOKING_DOCUMENT_BYTES = 10 * 1024 * 1024

export const BOOKING_DOCUMENT_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,application/pdf,.pdf"

export async function uploadBookingDocument(
  file: File,
): Promise<BookingDocument> {
  if (file.size > MAX_BOOKING_DOCUMENT_BYTES) {
    throw new Error("Each file must be under 10 MB.")
  }

  const formData = new FormData()
  const publicId = `${firey.camelize(file.name)}-${firey.getID()}`
  formData.append("file", file)
  formData.append("upload_preset", "gluco-guide-users")
  formData.append("public_id", publicId)

  const endpoint = file.type.startsWith("image/")
    ? "image/upload"
    : "auto/upload"

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/dwhlynqj3/${endpoint}`,
    { method: "POST", body: formData },
  )
  if (!res.ok) throw new Error("Upload failed. Try again.")

  const result = (await res.json()) as {
    secure_url: string
    original_filename?: string
  }

  return {
    name: file.name || result.original_filename || "Document",
    url: result.secure_url,
    uploadedAt: new Date().toISOString(),
  }
}
