import Link from "next/link"

export default function AdminViewAllLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-blue-600 shadow-sm transition hover:border-blue-300 hover:bg-sky-50 dark:border-white/15 dark:bg-white/5 dark:text-sky-400 dark:hover:border-blue-500/40"
    >
      View all
      <span aria-hidden>→</span>
    </Link>
  )
}

/** Next status in WhatsApp number go-live pipeline. */
export function nextWaNumberStatus(
  current: string,
):
  | "VERIFYING"
  | "DISPLAY_NAME_PENDING"
  | "TEMPLATES_PENDING"
  | "LIVE"
  | null {
  switch (current.toUpperCase()) {
    case "ASSIGNED":
      return "VERIFYING"
    case "VERIFYING":
      return "DISPLAY_NAME_PENDING"
    case "DISPLAY_NAME_PENDING":
      return "TEMPLATES_PENDING"
    case "TEMPLATES_PENDING":
      return "LIVE"
    default:
      return null
  }
}

export function waStatusLabel(status: string) {
  return status.replace(/_/g, " ")
}
