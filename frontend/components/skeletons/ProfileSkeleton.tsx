export default function ProfileSkeleton() {
  return (
    <div role="status" className="dashboard-page animate-pulse">
      <div className="dashboard-hero min-h-[11.5rem]">
        <div className="flex min-h-[7.5rem] flex-col gap-5 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <div className="size-20 rounded-full bg-slate-200 dark:bg-slate-700 sm:size-24" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-8 w-48 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-4 w-64 max-w-full rounded bg-slate-200 dark:bg-slate-700" />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="h-11 w-32 rounded-full bg-slate-200 dark:bg-slate-700" />
            <div className="h-11 w-28 rounded-full bg-slate-200 dark:bg-slate-700" />
          </div>
        </div>
      </div>

      <section className="dashboard-panel min-h-[10rem]">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-8">
          <div className="size-40 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-36 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-3 w-full max-w-md rounded bg-slate-200 dark:bg-slate-700" />
            <div className="mt-3 flex gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-6 w-20 rounded-full bg-slate-200 dark:bg-slate-700"
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="dashboard-grid-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="min-h-[9.5rem] rounded-[20px] bg-slate-100 dark:bg-slate-800"
          />
        ))}
      </div>

      <div className="dashboard-grid-2">
        {[0, 1].map((section) => (
          <div
            key={section}
            className="dashboard-panel min-h-[16rem]"
          >
            <div className="mb-4 h-6 w-40 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="grid gap-3 sm:grid-cols-2">
              {[...Array(section === 0 ? 8 : 6)].map((_, idx) => (
                <div
                  key={idx}
                  className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800"
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  )
}
