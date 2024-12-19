"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { Button, WalkingDog } from "@/components"

type Props = {
  content?: string
}

export default function NoData({ content = "Not found" }: Props) {
  const router = useRouter()

  return (
    <div className="mt-20 center flex-col mx-auto">
      <WalkingDog className="max-w-xl" />
      <h5 className="font-bold text-2xl">{content}</h5>
      <Button className="mt-3 text-lg px-8 py-3" onClick={() => router.back()}>
        Go back
      </Button>
    </div>
  )
}
