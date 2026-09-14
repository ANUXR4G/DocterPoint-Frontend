"use client"

import dynamic from "next/dynamic"
import type { ComponentProps } from "react"

const CoolKid = dynamic(() => import("./CoolKid"), { ssr: false })

export default function CoolKidClient(props: ComponentProps<typeof CoolKid>) {
  return <CoolKid {...props} />
}
