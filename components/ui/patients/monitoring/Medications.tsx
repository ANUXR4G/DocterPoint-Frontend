"use client"

import { firey } from "@/utils"
import { TMedications } from "@/types"
import { motion } from "framer-motion"
import { useApi } from "@/hooks/useApi"
import { useProfile } from "@/hooks/useProfile"
import { useClickOutside } from "@/hooks/useClickOutside"
import { patientService } from "@/lib/services/patient"
import { hours } from "@/lib/dummy/health"
import {
  ActivityModal,
  EmptySuggestions,
  Button,
  PopoverModal,
} from "@/components"
import React, { useEffect, useRef, useState } from "react"

export default function Medications() {
  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [isHovering, setIsHovering] = useState<boolean>(false)

  const container = useRef<HTMLDivElement>(null)

  // retrieve medication details
  const { data: profile } = useProfile()
  const { data: suggestions } = useApi(
    [`patients:medications:${profile?.id}`],
    (_, token) => patientService.getMedications(token),
    {
      select: (data) => firey.convertKeysToCamelCase(data) as TMedications | [],
    }
  )

  // convert hours as the keys of a new object with an empty array
  const newObj = hours.reduce<Record<string, any>>(
    (acc, key) => ((acc[key] = []), acc),
    {}
  )

  const [data, setData] = useState<Record<string, any>>(newObj)

  // remove all the duplicate items from the updated time due to stale
  const removeDuplicates = (existing: any[], incoming: any[]) => {
    const existingNames = new Set(existing.map((item) => item.name))
    return incoming.filter((item) => !existingNames.has(item.name))
  }

  // handle activity timings
  useEffect(() => {
    if (!suggestions || Array.isArray(suggestions)) return

    // split activities based on hours
    const morningActivities = Object.fromEntries(
      Object.entries(data).slice(0, 3)
    )
    const noonActivities = Object.fromEntries(Object.entries(data).slice(3, 5))
    const eveningActivies = Object.fromEntries(Object.entries(data).slice(5, 7))
    const nightActivities = Object.fromEntries(Object.entries(data).slice(7, 9))

    // get length of activities on different hours
    const morningActLen = firey.countSizeOfNestedArrObject(morningActivities)
    const noonActLen = firey.countSizeOfNestedArrObject(noonActivities)
    const eveningActLen = firey.countSizeOfNestedArrObject(eveningActivies)
    const nightActLen = firey.countSizeOfNestedArrObject(nightActivities)

    // get all the recommended exercises and medicines
    const exercises = suggestions.exercises || []
    const medicines = suggestions.medications?.medicine || []

    const filterByTime = (items: any[], time: string) =>
      items.filter((item) => item.times.includes(time))

    // combine the total activities based on different hours
    const totalMorningActivities = removeDuplicates(
      Object.values(morningActivities).flat(),
      [
        ...filterByTime(exercises, "morning"),
        ...filterByTime(medicines, "morning"),
        suggestions.dietary.find((meal) => meal.time === "breakfast"),
      ]
    )
    const totalNoonActivities = removeDuplicates(
      Object.values(noonActivities).flat(),
      [
        ...filterByTime(exercises, "afternoon"),
        ...filterByTime(medicines, "afternoon"),
        suggestions.dietary.find((meal) => meal.time === "lunch"),
      ]
    )
    const totalEveningActivities = removeDuplicates(
      Object.values(eveningActivies).flat(),
      [
        ...filterByTime(exercises, "evening"),
        ...filterByTime(medicines, "evening"),
        suggestions.dietary.find((meal) => meal.time === "snacks"),
      ]
    )
    const totalNightActivities = removeDuplicates(
      Object.values(nightActivities).flat(),
      [
        ...filterByTime(exercises, "night"),
        ...filterByTime(medicines, "night"),
        suggestions.dietary.find((meal) => meal.time === "dinner"),
      ]
    )

    // distribute the activities based on the hours
    let updatedData = { ...data }
    let needsUpdate = false

    if (totalMorningActivities.length !== morningActLen) {
      updatedData = {
        ...updatedData,
        ...firey.distributeItems(morningActivities, totalMorningActivities),
      }
      needsUpdate = true // manually trigger to update
    }

    if (totalNoonActivities.length !== noonActLen) {
      updatedData = {
        ...updatedData,
        ...firey.distributeItems(noonActivities, totalNoonActivities),
      }
      needsUpdate = true // manually trigger to update
    }

    if (totalEveningActivities.length !== eveningActLen) {
      updatedData = {
        ...updatedData,
        ...firey.distributeItems(eveningActivies, totalEveningActivities),
      }
      needsUpdate = true // manually trigger to update
    }

    if (totalNightActivities.length !== nightActLen) {
      updatedData = {
        ...updatedData,
        ...firey.distributeItems(nightActivities, totalNightActivities),
      }
      needsUpdate = true // manually trigger to update
    }

    // only update the data if necessary (triggered due to new activity insertion)
    if (needsUpdate) {
      setData(updatedData)
    }
    // eslint-disable-next-line
  }, [suggestions])

  // utilizes the hook to handle hovering outside the referred modal
  useClickOutside(container, () => setIsHovering(false))

  return (
    <React.Fragment>
      <motion.div
        ref={container}
        className="absolute z-20 right-0 top-0 w-full max-w-xl 2xl:max-w-4xl h-96 border border-gray-300 dark:border-neutral-500 rounded-3xl overflow-hidden  dark:bg-neutral-800 [--slide-to:0px] [--slide-from:336px] 2xl:[--slide-from:250px]"
        initial={{ x: "var(--slide-from)" }}
        animate={{
          x: isHovering ? "var(--slide-to)" : "var(--slide-from)",
        }}
        onHoverStart={() => setIsHovering(true)}
        onHoverEnd={() => setIsHovering(false)}
        onTapStart={() => setIsHovering(true)}
      >
        {suggestions &&
          (!Array.isArray(suggestions) ? (
            <React.Fragment>
              <div className="ml-4 mt-5 flex justify-between mr-4">
                <h2 className="text-xl font-semibold opacity-80">Activity</h2>
                <Button
                  className="text-xs relative z-10"
                  onClick={() => setIsOpen(true)}
                >
                  add activity
                </Button>
              </div>

              {/* medications/activities */}
              <div className="h-full overflow-y-auto custom-scroll -mt-2 p-4 pb-16">
                {Object.keys(data).map((item, idx) => (
                  <div
                    key={`activity-m-${idx}`}
                    className="py-3 relative flex items-center"
                  >
                    {data[item].length !== 0 && (
                      <React.Fragment>
                        <div className="after:absolute after:contents[''] after:w-[85%] sm:after:w-[90%] after:h-0.5 after:bg-transparent after:-mt-0.5 after:top-1/2 after:left-12 sm:after:left-14 after:border-b after:border-gray-400/60 dark:after:border-neutral-500 after:border-dashed flex">
                          <span className="text-sm sm:text-base inline-block">
                            {item}
                          </span>
                        </div>
                        <div className="flex flex-col gap-2 sm:gap-2.5 mx-auto">
                          {data[item].map((activity: any, aIdx: number) => (
                            <div
                              key={`${
                                activity.name
                                  ? activity.name.toLowerCase().trim()
                                  : activity.time.toLowerCase().trim()
                              }-${aIdx}`}
                              className={`py-1 px-3.5 text-sm font-medium border rounded-full w-fit z-10 bg-neutral-200/70 dark:bg-neutral-800 shadow-[inset_0_0_0_1px_rgba(56,56,56,0.3)] ${`ml-${
                                aIdx * 5
                              }`}`}
                            >
                              <PopoverModal
                                modalClass={`-mt-5 p-2 ml-12 z-40 min-w-36 ${
                                  !activity.duration &&
                                  !activity.times &&
                                  `group-hover:hidden`
                                }`}
                                content={
                                  activity.name ? activity.name : activity.time
                                }
                              >
                                <div className="flex flex-col">
                                  <span className="text-xs">
                                    {activity.duration ? `Duration` : `Amount`}:{" "}
                                    {activity.duration
                                      ? activity.duration
                                      : activity.times}
                                  </span>
                                  {activity.description && (
                                    <span className="text-xs">
                                      Note: {activity.description}
                                    </span>
                                  )}
                                </div>
                              </PopoverModal>

                              {/* {activity.name ? activity.name : activity.time} */}
                            </div>
                          ))}
                        </div>
                      </React.Fragment>
                    )}
                  </div>
                ))}
              </div>
            </React.Fragment>
          ) : (
            <EmptySuggestions />
          ))}
      </motion.div>

      {/* activity adding modal */}
      <ActivityModal
        active={isOpen}
        details={suggestions}
        closeHandler={() => setIsOpen(false)}
        setData={setData}
      />
    </React.Fragment>
  )
}
