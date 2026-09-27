/** Chief complaint table cell — two lines max, full text on hover. */
export default function ChiefComplaintCell({ text }: { text: string }) {
  if (!text) {
    return <span className="text-xs opacity-50">—</span>
  }
  return (
    <p
      className="line-clamp-2 max-w-[280px] text-xs leading-snug text-neutral-800 dark:text-slate-200"
      title={text}
    >
      {text}
    </p>
  )
}
