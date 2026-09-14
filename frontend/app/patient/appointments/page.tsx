import { redirect } from "next/navigation"

/** Legacy hospital appointments → Procto clinic bookings. */
export default function PatientAppointmentsRedirect() {
  redirect("/patient/bookings")
}
