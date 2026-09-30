import { resolveUploadUrl } from "@/lib/uploads"

type PhotoSource = {
  type?: string | null
  bgSrc?: string | null
  members?: Array<{
    role: string
    user?: { imgSrc?: string | null } | null
  }>
}

/** Clinics lead with their logo; solo doctors lead with their own photo. */
export function practicePhotoUrl(practice: PhotoSource): string {
  const members = practice.members ?? []
  const doctor =
    members.find((m) => m.role === "DOCTOR" && m.user?.imgSrc) ??
    members.find((m) => m.role === "PRACTICE_OWNER" && m.user?.imgSrc)
  const doctorPhoto = resolveUploadUrl(doctor?.user?.imgSrc)
  const logo = resolveUploadUrl(practice.bgSrc)
  const isClinic = practice.type === "CLINIC" || practice.type === "CENTER"
  return isClinic ? logo || doctorPhoto : doctorPhoto || logo
}
