"use client"

type MicButtonProps = {
  listening: boolean
  disabled?: boolean
  onClick: () => void
  ariaLabel?: string
  className?: string
}

export function MicGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
      <path d="M19 11v1a7 7 0 0 1-14 0v-1" />
      <path d="M12 19v3" />
    </svg>
  )
}

export default function MicButton({
  listening,
  disabled,
  onClick,
  ariaLabel = "Record by voice",
  className = "",
}: MicButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={listening ? "Stop voice input" : ariaLabel}
      aria-pressed={listening}
      className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border transition disabled:opacity-50 ${className} ${
        listening
          ? "border-red-300 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
          : "border-neutral-300 text-neutral-700 hover:bg-neutral-100 dark:border-white/20 dark:text-neutral-200 dark:hover:bg-white/10"
      }`}
    >
      <MicGlyph className="size-5" />
    </button>
  )
}
