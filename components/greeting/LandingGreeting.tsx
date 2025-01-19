"use client"

import { useProfile } from "@/hooks/useProfile"
import GreetingSkeleton from "../skeletons/GreetingSkeleton"
import React from "react"

export default function LandingGreeting() {
  const { data, isLoading } = useProfile()

  // handle completing user informations if not completed yet
  if (data && (!data.name || !data?.dateOfBirth)) return <div />

  if (isLoading) return <GreetingSkeleton />

  return (
    <div className="ml-2">
      {data && data.name && (
        <React.Fragment>
          <h2 className="text-xl leading-5 font-bold">
            Hey, {data.name.split(" ")[0]}
          </h2>
          <span className="text-sm font-semibold opacity-90">
            How are you feeling today?
          </span>
        </React.Fragment>
      )}
    </div>
  )
}
