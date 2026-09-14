import { redirect } from "next/navigation"

export default function AdminPatientsRedirect() {
  redirect("/admin/dashboard")
}
