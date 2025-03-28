"use client"

import {
  BasicSelect,
  Button,
  Icon,
  MultiOptions,
  TextInput,
} from "@/components"
import { TDoctorAppointment, TPresciptionOpts } from "@/types"
import { firey } from "@/utils"
import { motion } from "framer-motion"

type Props = {
  info: TDoctorAppointment
  values: TPresciptionOpts
  activities: {
    exercises: Pick<TPresciptionOpts, "name" | "duration" | "times">[]
    medications: Pick<TPresciptionOpts, "name" | "amount" | "times">[]
  }
  setValues: React.Dispatch<React.SetStateAction<TPresciptionOpts>>
  setActivities: React.Dispatch<
    React.SetStateAction<{
      exercises: Pick<TPresciptionOpts, "name" | "duration" | "times">[]
      medications: Pick<TPresciptionOpts, "name" | "amount" | "times">[]
    }>
  >
}

export default function AppointmentPrescription({
  info,
  values,
  setValues,
  activities,
  setActivities,
}: Props) {
  // const [prescribed, setPrescribed] = useState<{
  //   exercises: Pick<TPresciptionOpts, "name" | "duration" | "times">[]
  //   medications: Pick<TPresciptionOpts, "name" | "amount" | "times">[]
  // }>({
  //   exercises: [],
  //   medications: [],
  // })

  // const { data } = useApi([`users:doctor:${doctorId}:patient:${patientId}`], (_, token) => {
  //   if(!appointmentId) throw new Error(`Failed to retrieve patient medication based on appointment id`)
  //   return patientService.getAppointmentMedications(token, appointmentId)
  // })

  // Handle time selection
  function handleTimeSelection(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.toLowerCase()

    setValues((prev) => {
      const times = prev.times.includes(value)
        ? prev.times.length > 1
          ? prev.times.filter((item) => item !== value)
          : prev.times
        : [...prev.times, value]
      return { ...prev, times }
    })
  }

  const isExercise = values.type === "Exercise 🏃🏼‍♂️"
  const isActivityEmpty =
    activities.exercises.length === 0 && activities.medications.length === 0

  // Add a new acitivity as prescription
  function handleNewActivity() {
    if (isExercise) {
      setActivities((prev) => ({
        exercises: prev.exercises.concat({
          name: values.name,
          duration: values.duration,
          times: values.times,
        }),
        medications: prev.medications,
      }))
    } else {
      setActivities((prev) => ({
        exercises: prev.exercises,
        medications: prev.medications.concat({
          name: values.name,
          amount: values.amount,
          times: values.times,
        }),
      }))
    }

    setValues((prev) => ({
      ...prev,
      name: "",
      amount: "1",
      times: ["morning"],
    }))
  }

  return (
    <div className="text-neutral-600 dark:text-neutral-400">
      <h2 className="text-lg font-semibold mt-4">Assign Prescription</h2>

      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <BasicSelect
          name="Event Type"
          className="ml-0"
          values={["Exercise 🏃🏼‍♂️", "Medicine 💊"]}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, type: e.target.value }))
          }
        />

        <div>
          <TextInput
            name={`${isExercise ? `Exercise` : `Medicine`} Name`}
            value={values.name}
            indent="indent-2.5"
            onChange={(e) =>
              setValues((prev) => ({ ...prev, name: e.target.value }))
            }
          />
          <p className="text-xs font-medium opacity-70 mt-1">
            e.g, {isExercise ? `Cycling` : `Vitamin D`}
          </p>
        </div>
      </div>

      {!isExercise && (
        <div className="w-full sm:w-1/2 pr-0 sm:pr-1 mt-2 sm:mt-0">
          <TextInput
            name={`Dose Amount`}
            value={values.amount}
            indent="indent-2.5"
            onChange={(e) =>
              setValues((prev) => ({
                ...prev,
                amount: e.target.value,
              }))
            }
          />
          <p className="text-xs font-medium opacity-70 mt-1">
            e.g, Twice a day = 2
          </p>
        </div>
      )}

      <div />

      {/* Duration */}
      {values.type === "Exercise 🏃🏼‍♂️" && (
        <MultiOptions
          title="duration"
          values={[
            "10-15mins",
            "15min-20mins",
            "15min-30mins",
            "30-45mins",
            "40-50mins",
            "1-2hrs",
          ]}
          options={[values.duration]}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, duration: e.target.value }))
          }
          containerClassName="mt-3"
          innerClassName="-ml-1 [&&]:mt-1"
        />
      )}

      {/* Time */}
      <MultiOptions
        title="time"
        values={["morning", "afternoon", "evening", "night"]}
        options={values.times}
        onChange={handleTimeSelection}
        containerClassName={`mt-2`}
        innerClassName="-ml-1 [&&]:mt-1"
      />

      {/* Activity save button */}
      <div className="flex justify-end">
        <Button
          disabled={
            isExercise
              ? values.name.length === 0
              : values.name.length === 0 || values.amount.length === 0
          }
          // disabled={disableForExercise || disableForMedicine}
          onClick={handleNewActivity}
          className="text-xs"
        >
          Add Activity
        </Button>
      </div>

      {!isActivityEmpty && (
        <ul className="mt-2">
          {activities.exercises.map((item, idx) => (
            <li key={`ex-p-${idx}`} className="text-sm">
              {item.name} for {item.duration} on every{" "}
              {firey.makeString(item.times)} 💪🏼
            </li>
          ))}
          {activities.medications.map((item, idx) => (
            <li key={`ex-p-${idx}`} className="text-sm">
              {item.name} on every {firey.makeString(item.times)} 💊
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <label htmlFor="notes" className="text-sm font-semibold opacity-90">
          Doctor Note
        </label>
        <textarea
          rows={4}
          className="mt-1 p-2 w-full text-sm text-gray-900 dark:text-neutral-400 bg-gray-50 dark:bg-neutral-700 rounded-md border border-gray-300 dark:border-neutral-600 focus:ring-blue-500 focus:border-blue-500 resize-none"
          placeholder="Write inportant notes..."
          value={values.note}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, note: e.target.value }))
          }
        />
      </div>
    </div>
  )
}
