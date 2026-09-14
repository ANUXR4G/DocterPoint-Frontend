import { redirect } from "next/navigation"

/** Personal details are edited only on the profile page. */
export default function InfoPage() {
  redirect("/patient/profile")
}
