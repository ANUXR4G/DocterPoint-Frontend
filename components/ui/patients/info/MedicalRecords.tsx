"use client"

import {
  bloodGroups,
  diabetesTypes,
  physicalActivities,
  smokingStatuses,
} from "@/lib/dummy/lifestyles"
import { motion } from "framer-motion"
import { TInfoOptions } from "@/types"
import { BasicSelect, Input, MultiOptions, Button } from "@/components"

type Props = {
  values: TInfoOptions
  setValues: React.Dispatch<React.SetStateAction<TInfoOptions>>
  handleChange: (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => void
  handleGoBack: () => void
  infoKeys: string[]
  allowNext: boolean
}

export default function MedicalRecords({
  values,
  setValues,
  handleChange,
  handleGoBack,
  infoKeys,
  allowNext,
}: Props) {
  // handle weight change
  function handleWeightChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.valueAsNumber
    setValues((prev) => ({ ...prev, weight: !isNaN(value) ? value : "" }))
  }

  // handle height change
  function handleHeightChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.valueAsNumber
    setValues((prev) => ({ ...prev, height: !isNaN(value) ? value : "" }))
  }

  // handle previous diabetes status changes
  function handleDiabetesStatus(e: React.ChangeEvent<HTMLInputElement>) {
    setValues((prev) => {
      const value = e.target.value
      const exists = prev.previousDiabetesRecords.includes(value)
      const newStatus = exists
        ? prev.previousDiabetesRecords.filter((item) => item !== value)
        : prev.previousDiabetesRecords.concat(value)
      return { ...prev, previousDiabetesRecords: newStatus }
    })
  }

  // handle smoking stutus changes
  function handleSmokingStatus(e: React.ChangeEvent<HTMLInputElement>) {
    setValues((prev) => ({
      ...prev,
      smokingStatus: e.target.value,
    }))
  }

  // handle physical activities changes
  function handlePhysicalActivity(e: React.ChangeEvent<HTMLInputElement>) {
    setValues((prev) => ({
      ...prev,
      physicalActivity: e.target.value,
    }))
  }

  return (
    <motion.div
      className={`size-full flex flex-col mt-5 min-w-full`}
      initial={{ opacity: 0 }}
      animate={{ opacity: allowNext ? 1 : 0 }}
      exit={{ opacity: 0 }}
    >
      {/* go back button */}
      <Button type="outline" className="ml-auto" onClick={handleGoBack}>
        Go Back
      </Button>

      {allowNext && (
        <div className="p-2 w-full flex flex-col gap-2">
          <h1 className="text-lg mt-2 font-bold opacity-75 dark:text-neutral-200">
            Medical History
          </h1>

          {/* medical history options */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 2xl:gap-y-3">
            <Input
              type="number"
              placeholder="165"
              name={infoKeys[8]}
              value={values.weight}
              onChange={handleWeightChange}
              info="measured in lb"
              className="2xl:text-base"
            />

            <Input
              type="number"
              placeholder="5.7"
              name={infoKeys[9]}
              value={values.height}
              onChange={handleHeightChange}
              info="measured in ft"
              className="2xl:text-base"
            />

            <BasicSelect
              name="Blood Group"
              values={bloodGroups}
              onChange={handleChange}
              className="2xl:[&_select]:text-base"
            />

            {/* physical activity preferences options */}
            <MultiOptions
              title={infoKeys[13]}
              values={diabetesTypes}
              options={values.previousDiabetesRecords}
              onChange={handleDiabetesStatus}
              containerClassName="mt-2 col-span-2 2xl:mt-3"
            />

            {/* smoking status options */}
            <MultiOptions
              title={infoKeys[11]}
              values={smokingStatuses}
              active={values.smokingStatus}
              onChange={handleSmokingStatus}
              containerClassName="mt-2 col-span-2 2xl:mt-3"
            />

            {/* physical activity preferences options */}
            <MultiOptions
              title={infoKeys[12]}
              values={physicalActivities}
              active={values.physicalActivity}
              onChange={handlePhysicalActivity}
              containerClassName="mt-2 col-span-2 2xl:mt-3"
            />
          </div>
        </div>
      )}
    </motion.div>
  )
}
