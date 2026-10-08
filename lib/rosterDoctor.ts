/** A bookable doctor. The clinic owner is not one until they open a schedule. */
export function isPracticingDoctor(m: {
  role?: string | null
  isActive?: boolean
  doctorId?: string | null
}): boolean {
  if (m.isActive === false) return false
  if (m.role === "DOCTOR") return true
  return m.role === "PRACTICE_OWNER" && Boolean(m.doctorId)
}
