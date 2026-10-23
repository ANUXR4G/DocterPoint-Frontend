import { redirect } from "next/navigation"

export default function ClinicMedicinePage() {
  redirect("/clinic/master?tab=medicines")
}
