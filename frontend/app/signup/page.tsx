import { redirect } from "next/navigation"

/** Legacy signup URL — patient registration lives on the patient portal. */
export default function SignupPage() {
  redirect("/login/patient?mode=register")
}
