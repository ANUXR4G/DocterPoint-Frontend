import { firey } from "@/utils"
import { TMedications } from "@/types"
import { useEffect, useState } from "react"

const hours = [
  "8AM",
  "10AM",
  "12PM",
  "2PM",
  "4PM",
  "6PM",
  "8PM",
  "10PM",
  "12AM",
]

export function useActivities(details?: TMedications | []) {
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
    if (!details || Array.isArray(details)) return

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
    const exercises = details.exercises || []
    const medicines = details.medications || []

    const filterByTime = (items: any[], time: string) =>
      items.filter((item) => item.times.includes(time))

    // combine the total activities based on different hours
    const totalMorningActivities = removeDuplicates(
      Object.values(morningActivities).flat(),
      [
        ...filterByTime(exercises, "morning"),
        ...filterByTime(medicines, "morning"),
        details.dietary?.find((meal) => meal.time === "breakfast"),
      ]
    )
    const totalNoonActivities = removeDuplicates(
      Object.values(noonActivities).flat(),
      [
        ...filterByTime(exercises, "afternoon"),
        ...filterByTime(medicines, "afternoon"),
        details.dietary?.find((meal) => meal.time === "lunch"),
      ]
    )
    const totalEveningActivities = removeDuplicates(
      Object.values(eveningActivies).flat(),
      [
        ...filterByTime(exercises, "evening"),
        ...filterByTime(medicines, "evening"),
        details.dietary?.find((meal) => meal.time === "snacks"),
      ]
    )
    const totalNightActivities = removeDuplicates(
      Object.values(nightActivities).flat(),
      [
        ...filterByTime(exercises, "night"),
        ...filterByTime(medicines, "night"),
        details.dietary?.find((meal) => meal.time === "dinner"),
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
  }, [details])

  return { data }
}
