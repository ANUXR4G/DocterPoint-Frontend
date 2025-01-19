"use client"

import React, { useEffect, useRef } from "react"

import { useApi } from "@/hooks/useApi"
import { useProfile } from "@/hooks/useProfile"
import { useActivities } from "@/hooks/useActivities"
import { useApiMutation } from "@/hooks/useApiMutation"

import { firey } from "@/utils"
import { TMedications } from "@/types"
import { queryClient } from "@/app/providers"
import { patientService } from "@/lib/services/patient"
import { PendingActivitiesSkeleton, Tasks } from "@/components"

export default function Activities() {
  const hasRun = useRef(false)

  // retrieve medication details
  const { data: profile } = useProfile()
  const { data: suggestions, isLoading } = useApi(
    [`patients:medications:${profile?.id}`],
    (_, token) => patientService.getMedications(token),
    {
      enabled: !!profile?.id,
      select: (data) => firey.convertKeysToCamelCase(data) as TMedications | [],
    }
  )

  // geenrate suggestions if no medication record was found
  const { mutate } = useApiMutation<{
    payload: Record<string, number>
  }>(
    ({ payload }, token) => patientService.generateSuggestions(token, payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(`patients:medications:${profile?.id}`)
      },
    }
  )

  // distribute all the pending activities based on hours
  const { data } = useActivities(suggestions)

  // automatically generate suggestions based on age
  useEffect(() => {
    if (hasRun.current) return
    if (!profile?.dateOfBirth || !suggestions) return
    const age = firey.calculateAge(profile.dateOfBirth)
    if (Array.isArray(suggestions) || suggestions.expiry === 0) {
      mutate({ payload: { age: age } })
      hasRun.current = true
    }
  }, [profile?.dateOfBirth, mutate, suggestions])

  // reconstruct the activities data
  const activities = Object.keys(data).map((key) =>
    data[key].map((item: any) => {
      return {
        // set type based on the required field
        type: item.duration ? "exercise" : item.amount ? "medication" : "meal",
        name: item.name ? item.name : item.time,
        time: key,
        ...(item.duration && { duration: item.duration }), // make it optional based on it's existence
      }
    })
  )

  return (
    <React.Fragment>
      {suggestions && !isLoading && !Array.isArray(suggestions) && (
        <React.Fragment>
          <div className="text-center">
            <h3 className="mt-3 font-bold text-sm leading-4">
              Tasks for today
            </h3>
            <div className="font-semibold text-xs text-neutral-400 dark:text-slate-300/70">
              generated via
              <span className="ml-1 font-extrabold text-neutral-500 dark:text-slate-200">
                {suggestions.generatedBy}
              </span>
            </div>
          </div>
        </React.Fragment>
      )}
      <div className={`mt-3 flex flex-col gap-3`}>
        {isLoading ? (
          <PendingActivitiesSkeleton />
        ) : (
          activities.map((item, idx) => (
            <Tasks key={`activities-pending-today-${idx}`} data={item} />
          ))
        )}
      </div>
    </React.Fragment>
  )
}
