/** A bookable doctor. The clinic owner is one only with their own doctor profile. */
export function isPracticingDoctor(m: {
  role?: string | null
  isActive?: boolean
  doctorId?: string | null
  user?: { doctor?: unknown } | null
}): boolean {
  if (m.isActive === false) return false
  if (m.role === "DOCTOR") return true
  if (m.role !== "PRACTICE_OWNER") return false
  return Boolean(m.doctorId) || Boolean(m.user?.doctor)
}
