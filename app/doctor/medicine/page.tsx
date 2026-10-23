import { redirect } from "next/navigation"

export default function DoctorMedicinePage() {
  redirect("/doctor/master?tab=medicines")
}
