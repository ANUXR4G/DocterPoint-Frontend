import React from "react"
import { Background, Navigation } from "@/components"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <React.Fragment>
      <Navigation />
      <Background name="gradient-2" />
      <main className="ml-auto md:w-[calc(100%-72px)] xl:w-[calc(100%-240px)] p-4 xs:px-4">
        {children}
      </main>
    </React.Fragment>
  )
}
