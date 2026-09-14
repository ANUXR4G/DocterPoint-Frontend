import { redirect } from "next/navigation"

export default function AdminAppointmentsRedirect() {
  redirect("/admin/dashboard")
}
