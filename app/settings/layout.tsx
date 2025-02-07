import { Background, Navigation } from "@/components"
import React from "react"

export default function PatientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <React.Fragment>
      <Navigation />
      <Background name="gradient-2" />
      <div className="ml-auto md:w-[calc(100%-72px)] xl:w-[calc(100%-240px)] p-4 xs:px-4">
        {children}
      </div>
    </React.Fragment>
  )
}
