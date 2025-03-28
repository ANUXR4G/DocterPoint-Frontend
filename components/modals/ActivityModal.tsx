"use client"

import React, { useState } from "react"
import {
  BasicSelect,
  Button,
  Checkbox,
  Modal,
  MultiOptions,
  TextInput,
} from ".."
import { useApiMutation } from "@/hooks/useApiMutation"
import { patientService } from "@/lib/services/patient"
import { useProfile } from "@/hooks/useProfile"
import { queryClient } from "@/app/providers"
import { TMedications } from "@/types"

type Props = {
  active: boolean
  closeHandler: () => void
  details?: TMedications | []
}

const initialValues = {
  type: "Exercise 🏃🏼‍♂️",
  name: "",
  times: ["morning"],
  amount: "",
  duration: "10-15mins",
  description: "",
}

export default function AddActivity({ active, closeHandler, details }: Props) {
  const [values, setValues] = useState({ ...initialValues })

  // retrieve profile details
  const { data: profile } = useProfile()

  // update medication preferences if already exists
  const { mutate } = useApiMutation<{
    payload: Record<string, unknown>
  }>(({ payload }, token) => patientService.updateMedications(token, payload), {
    onSuccess: () => {
      queryClient.invalidateQueries(`patients:medications:${profile?.id}`)
    },
  })

  // handle times selection
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
  const disableForExercise = isExercise && values.name.length <= 1
  const disableForMedicine =
    !isExercise && (values.name.length <= 1 || values.amount.length === 0)

  function handleConfirmation() {
    if (details && Array.isArray(details)) return
    // update exercise timings
    if (isExercise) {
      const { type, description, amount, ...rest } = values
      const exerciseDetails = {
        ...rest,
        ...(description.length > 1 && { description }),
      } // reconstruct the payload for updating

      const oldData = details?.exercises ? details.exercises : []
      const newData = oldData.concat(exerciseDetails)

      mutate({ payload: { exercises: newData } })
    } else {
      const { name, amount, description, times } = values
      const medicineDetails = {
        name,
        amount: Number(amount),
        times,
        ...(description.length > 1 && { description }),
      } // reconstruct the payload for updating

      const oldData = details?.medications ? details.medications : []
      const newData = oldData.concat(medicineDetails)

      mutate({ payload: { medications: newData } })
    }

    setValues({ ...initialValues })
    closeHandler()
  }

  return (
    <Modal
      open={active}
      handler={closeHandler}
      secondaryBtn={
        <Button
          disabled={disableForExercise || disableForMedicine}
          onClick={handleConfirmation}
        >
          Save Activity
        </Button>
      }
      className="w-full max-w-xl"
      direction="center"
    >
      <div className="p-4 overflow-x-hidden overflow-y-auto custom-scroll">
        <div className="flex flex-col gap-2">
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

          {!isExercise && (
            <div>
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

          {/* time */}
          <MultiOptions
            title="time"
            values={["morning", "afternoon", "evening", "night"]}
            options={values.times}
            onChange={handleTimeSelection}
            innerClassName="-ml-0.5"
          />

          {/* duration */}
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
              innerClassName="-ml-0.5"
            />
          )}

          <div>
            <label htmlFor="notes" className="text-sm font-semibold opacity-90">
              Description
            </label>
            <textarea
              rows={4}
              className="mt-1 p-2 w-full text-sm text-gray-900 dark:text-neutral-400 bg-gray-50 dark:bg-neutral-700 rounded-md border border-gray-300 dark:border-neutral-600 focus:ring-blue-500 focus:border-blue-500 resize-none"
              placeholder="Write description here..."
              value={values.description}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, description: e.target.value }))
              }
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}
