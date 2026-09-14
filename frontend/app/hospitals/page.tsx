import { redirect } from "next/navigation"

/** Legacy hospitals directory → canonical Practo-style Find Care. */
export default function HospitalsPage() {
  redirect("/practices")
}
