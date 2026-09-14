import { redirect } from "next/navigation"

/** Legacy admin routes → GlucoGuide Ops dashboard anchors */
export default function AdminInboxRedirect() {
  redirect("/admin/dashboard#escalations")
}
