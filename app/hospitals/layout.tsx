"use client"

import { Background, Loader, Navigation } from "@/components"
import { useProfile } from "@/hooks/useProfile"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect } from "react"

export default function HospitalsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathName = usePathname()
  const searchParams = useSearchParams()

  const { data, isLoading } = useProfile()

  useEffect(() => {
    const needsReload = searchParams.get("reload")
    if (needsReload === "t") {
      const params = new URLSearchParams(searchParams.toString())
      params.delete("reload")

      window.history.replaceState({}, "", `${pathName}?${params.toString()}`)
      window.location.reload()
    }
  }, [pathName, router, searchParams])

  if (isLoading) return <Loader />

  return (
    <>
      {data && <Navigation />}
      <Background name="gradient-2" className="dark:hidden" />
      <Background
        name="half-box-pattern"
        className="hidden !fixed dark:block"
      />
      <div
        className={`ml-auto p-4 xs:px-4 ${
          !!data
            ? `md:w-[calc(100%-72px)] xl:w-[calc(100%-240px)]`
            : `w-full pt-6 sm:pt-10 xl:pt-12`
        }`}
      >
        {children}
      </div>
    </>
  )
}
