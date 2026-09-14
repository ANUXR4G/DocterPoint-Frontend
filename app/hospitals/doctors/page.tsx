import { redirect } from "next/navigation"

/** Legacy doctors directory → canonical Find Care. */
export default function DoctorsPage() {
  redirect("/practices?view=doctors")
}
