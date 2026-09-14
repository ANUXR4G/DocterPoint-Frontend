import { redirect } from "next/navigation"

export default function AdminDoctorsRedirect() {
  redirect("/admin/dashboard")
}
