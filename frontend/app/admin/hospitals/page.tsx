import { redirect } from "next/navigation"

export default function AdminHospitalsRedirect() {
  redirect("/admin/dashboard#numbers")
}
