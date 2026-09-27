import { Siren } from "lucide-react"

export default function EmergencyWalkInBadge({
  className = "",
}: {
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-500/15 dark:text-red-300 ${className}`}
      title="Emergency walk-in — added at the desk without a slot"
    >
      <Siren className="size-3" aria-hidden />
      Walk-in
    </span>
  )
}
