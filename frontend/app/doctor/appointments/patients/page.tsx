import { redirect } from "next/navigation"

/** Legacy path → dedicated doctor patients page. */
export default function LegacyDoctorPatientsRedirect() {
  redirect("/doctor/patients")
}
