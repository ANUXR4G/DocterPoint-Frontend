"use client"

import dynamic from "next/dynamic"

const DateHeading = dynamic(() => import("./DateHeading"), { ssr: false })

export default function DateHeadingClient() {
  return <DateHeading />
}
