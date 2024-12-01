import { TYPERECOMMENDATIONS } from "@/lib/dummy/recommendations"
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

// convert hours as the keys of a new object with an empty array
const newObj = hours.reduce<Record<string, any>>(
  (acc, key) => ((acc[key] = []), acc),
  {}
)

export function useActivities(recommendation: TYPERECOMMENDATIONS[]) {
  const [data, setData] = useState<Record<string, any>>(newObj)

  // distribute the items based on it's timing
  function distributeItems(dataObj: any, items: any) {
    // get the keys of the data object
    const keys = Object.keys(dataObj)
    let currentKeyIndex = 0

    // find the next empty array in the data
    const findNextEmptyKey = () => {
      for (let i = 0; i < keys.length; i++) {
        if (dataObj[keys[i]].length === 0) {
          return i
        }
      }
      return -1
    }

    const newData = { ...dataObj }

    // fill empty items first
    for (const item of items) {
      const emptyKeyIndex = findNextEmptyKey()
      if (emptyKeyIndex !== -1) {
        newData[keys[emptyKeyIndex]].push(item)
      } else {
        // distribute in a round robin manner (top to bottom then again to top)
        newData[keys[currentKeyIndex]].push(item)
        currentKeyIndex = (currentKeyIndex + 1) % keys.length
      }
    }

    return newData
  }

  // get the size of a nested object which contains arrays
  function countSizeOfNestedArrObject(givenObj: { [key: string]: any }) {
    return Object.keys(givenObj).reduce(
      (acc, key) => acc + givenObj[key].length,
      0
    )
  }

  // handle activity timings
  useEffect(() => {
    // split morning hour activities
    const morningActivities = Object.fromEntries(
      Object.entries(data).slice(0, 3)
    )

    // split afternoon hour activities
    const noonActivities = Object.fromEntries(Object.entries(data).slice(3, 5))

    // split evening hour activities
    const eveningActivies = Object.fromEntries(Object.entries(data).slice(5, 7))

    // split night hour activities
    const nightActivities = Object.fromEntries(Object.entries(data).slice(7, 9))

    // get length of activities on different hours
    const morningActLen = countSizeOfNestedArrObject(morningActivities)
    const noonActLen = countSizeOfNestedArrObject(noonActivities)
    const eveningActLen = countSizeOfNestedArrObject(eveningActivies)
    const nightActLen = countSizeOfNestedArrObject(nightActivities)

    // get all the recommended exercises
    const exercises = recommendation
      .map((item) => item.exercises?.map((item) => item))
      .flat()

    // get the exercises on morning
    const morningExercises = exercises.filter((item) =>
      item?.times.includes("morning")
    )

    // get the exercises on afternoon
    const noonExercises = exercises.filter((item) =>
      item?.times.includes("afternoon")
    )

    // get the exercises on evening
    const eveningExercises = exercises.filter((item) =>
      item?.times.includes("evening")
    )

    // get the exercises on night
    const nightExercises = exercises.filter((item) =>
      item?.times.includes("night")
    )

    // get all the recommended medicines
    const medicines = recommendation
      .map((item) => item.medications?.medicine.map((item) => item))
      .flat()

    // get the medicines on morning
    const morningMeds = medicines.filter((item) =>
      item?.times.includes("morning")
    )

    // get the medicines on afternoon
    const noonMeds = medicines.filter((item) =>
      item?.times.includes("afternoon")
    )

    // get the medicines on evening
    const eveningMeds = medicines.filter((item) =>
      item?.times.includes("evening")
    )

    // get the medicines on night
    const nightMeds = medicines.filter((item) => item?.times.includes("night"))

    // food intake timings
    const breakfast = recommendation[0].dietary[0]
    const lunch = recommendation[0].dietary[1]
    const snack = recommendation[0].dietary[2]
    const dinner = recommendation[0].dietary[3]

    // combine the total activities based on different hours
    const totalMorningActivities = [
      ...morningExercises,
      ...morningMeds,
      breakfast,
    ]
    const totalNoonActivities = [...noonExercises, ...noonMeds, lunch]
    const totalEveningActivities = [snack, ...eveningExercises, ...eveningMeds]
    const totalNightActivities = [...nightExercises, dinner, ...nightMeds]

    if (totalMorningActivities.length !== morningActLen) {
      const updatedData = distributeItems(
        morningActivities,
        totalMorningActivities
      )
      setData((prev) => ({ ...prev, ...updatedData }))
    }

    if (totalNoonActivities.length !== noonActLen) {
      const updatedData = distributeItems(noonActivities, totalNoonActivities)
      setData((prev) => ({ ...prev, ...updatedData }))
    }

    if (totalEveningActivities.length !== eveningActLen) {
      const updatedData = distributeItems(
        eveningActivies,
        totalEveningActivities
      )

      setData((prev) => ({ ...prev, ...updatedData }))
    }

    if (totalNightActivities.length !== nightActLen) {
      const updatedData = distributeItems(nightActivities, totalNightActivities)
      setData((prev) => ({ ...prev, ...updatedData }))
    }
  }, [data, recommendation])

  return {
    data,
    hours,
  }
}
