"use client"

type DocumentScanPreviewProps = {
  src: string
  alt: string
  fileName?: string
  scanning?: boolean
  className?: string
  imageClassName?: string
}

/** ID thumbnail with a scan line that sweeps down, then back up. */
export default function DocumentScanPreview({
  src,
  alt,
  fileName,
  scanning = false,
  className = "",
  imageClassName = "max-h-36 w-full object-contain sm:max-h-40",
}: DocumentScanPreviewProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-slate-800 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={imageClassName} />
      {scanning ? (
        <>
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[var(--theme-primary)]/10 via-transparent to-[var(--theme-primary)]/10"
            aria-hidden
          />
          <div className="gg-id-scan-line pointer-events-none absolute inset-x-0 h-1" aria-hidden>
            <div className="h-full w-full bg-[var(--theme-primary)] shadow-[0_0_16px_color-mix(in_srgb,var(--theme-primary)_70%,transparent)]" />
          </div>
          <p className="absolute bottom-2 left-0 right-0 text-center text-[10px] font-semibold uppercase tracking-wide text-white drop-shadow-md">
            Scanning…
          </p>
        </>
      ) : null}
      {fileName ? (
        <p className="truncate border-t border-slate-200 px-2 py-1.5 text-[11px] text-slate-500 dark:border-white/10 dark:text-slate-400">
          {fileName}
        </p>
      ) : null}
    </div>
  )
}
