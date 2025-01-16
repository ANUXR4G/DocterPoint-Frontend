"use client"

import { useApi } from "@/hooks/useApi"
import { useProfile } from "@/hooks/useProfile"
import { recommendedCategoryOptions } from "@/lib/dummy/recommededOptData"
import { patientService } from "@/lib/services/patient"
import { TMedications } from "@/types"
import { firey } from "@/utils"
import Image from "next/image"

export default function DietCategory() {
  // retrieve medication details
  const { data: profile } = useProfile()
  const { data: suggestions, isLoading } = useApi(
    [`patients:medications:${profile?.id}`],
    (_, token) => patientService.getMedications(token),
    {
      select: (data) => firey.convertKeysToCamelCase(data) as TMedications | [],
    }
  )

  const options = recommendedCategoryOptions({
    activity: 90, // minutes
    water:
      suggestions && !Array.isArray(suggestions) ? suggestions.hydration : "8",
    sleep:
      suggestions && !Array.isArray(suggestions) ? suggestions.sleep : "8hrs",
  })

  if (isLoading) return <div />

  return (
    <div className="mt-3 md:mt-4 grid grid-cols-3 2xl:grid-cols-3 gap-2 lg:w-full min-h-44 lg:items-center">
      {options.map((option, idx) => (
        <div
          key={`recommendation_option_${idx}`}
          className={`cursor-pointer max-h-40 hover:shadow md:hover:shadow-md relative rounded-2xl lg:h-full lg:max-h-full center flex-col border dark:border-neutral-500 dark:bg-neutral-900/50 shadow-sm`}
        >
          <div className="center flex-col">
            {option.info && (
              <span className="font-bold opacity-70 text-sm">
                {option.info}
              </span>
            )}
            <span
              className={`text-sm md:text-base font-bold mb-1 text-center ${
                idx === 2 && `-mb-3.5`
              }`}
            >
              {option.title}
            </span>
          </div>
          <div
            className={`relative ${
              option.size === "smaller"
                ? "w-8 h-8 2xl:w-14 2xl:h-14"
                : "w-16 h-16 2xl:w-24 2xl:h-24"
            }`}
          >
            <Image
              fill
              src={option.imgSrc}
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              alt={`${option.title}.png`}
              style={{ objectFit: "contain", filter: "contrast(0.9)" }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
