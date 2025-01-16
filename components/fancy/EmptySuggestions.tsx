"use client"

import Image from "next/image"
import { Button } from "@/components"
import { patientService } from "@/lib/services/patient"
import { useApiMutation } from "@/hooks/useApiMutation"
import { useProfile } from "@/hooks/useProfile"
import { useApi } from "@/hooks/useApi"
import { TMedications } from "@/types"
import { firey } from "@/utils"
import { queryClient } from "@/app/providers"

export default function EmptySuggestions() {
  // retrieve patient and medication details
  const { data: profile } = useProfile()
  const { data: suggestions } = useApi(
    [`patients:medications:${profile?.id}`],
    (_, token) => patientService.getMedications(token),
    {
      select: (data) => firey.convertKeysToCamelCase(data) as TMedications | [],
    }
  )

  // generate new suggestions mutation
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

  // function for generating suggestions
  function generateSuggestions() {
    if (!profile?.dateOfBirth || !suggestions) return
    if (Array.isArray(suggestions)) {
      const age = firey.calculateAge(profile.dateOfBirth)
      mutate({ payload: { age: age } })
    }
  }

  return (
    <div className="mt-10 center flex-col">
      <div className="relative size-52">
        <Image
          fill
          src="https://res.cloudinary.com/dwhlynqj3/image/upload/v1735929859/glucoguide/info_tab_svg.svg"
          alt="info_tab.svg"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          priority
        />
      </div>
      <Button className="mt-2 max-w-48" onClick={generateSuggestions}>
        Generate Recommendations
      </Button>
    </div>
  )
}
